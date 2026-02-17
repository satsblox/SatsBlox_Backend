# SatsBlox Authentication Architecture

## Overview

The SatsBlox backend implements a JWT-based (JSON Web Token) authentication system following industry best practices. This document explains the architecture, security considerations, and how the system works end-to-end.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Client                         │
│          (Web Frontend, Mobile App, REST Client)        │
└────────────────┬────────────────────────────────────────┘
                 │ (1) POST /api/auth/register or /login
                 │ (2) POST /api/auth/refresh
                 │ (3) GET /api/protected with Bearer token
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Express.js HTTP Server                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Routes: src/routes/auth.js                       │  │
│  │  - POST /api/auth/register                        │  │
│  │  - POST /api/auth/login                           │  │
│  │  - POST /api/auth/refresh                         │  │
│  └────────────┬────────────────────────────────────┬─┘  │
│               │                                    │     │
│  ┌────────────▼─────────────┐  ┌─────────────────▼───┐  │
│  │  Controllers             │  │  Middleware         │  │
│  │  src/controllers/        │  │  src/middleware/    │  │
│  │  authController.js       │  │  authMiddleware.js  │  │
│  │                          │  │  errorHandler.js    │  │
│  │  -register()             │  │                     │  │
│  │  -login()                │  │  -authenticate()    │  │
│  │  -refresh()              │  │  -errorHandler()    │  │
│  └────────────┬─────────────┘  └─────────────────────┘  │
│               │                                          │
│  ┌────────────▼──────────────────────────────────────┐  │
│  │  Services: src/services/authService.js            │  │
│  │  - registerParent()  (hash password, create user) │  │
│  │  - loginParent()     (verify password)            │  │
│  │  - refreshAccessToken()  (token rotation)         │  │
│  │  - verifyToken()     (JWT verification)           │  │
│  │  - generateTokens()  (JWT generation)             │  │
│  └────────────┬──────────────────────────────────────┘  │
│               │                                          │
│  ┌────────────▼──────────────────────────────────────┐  │
│  │  Utilities: src/utils/validators.js               │  │
│  │  - validateEmail()                                │  │
│  │  - validatePassword()                             │  │
│  │  - validateKenyanPhone()                          │  │
│  │  - validateFullName()                             │  │
│  │  - validateRegistrationData()                     │  │
│  └────────────┬──────────────────────────────────────┘  │
└───────────────┼──────────────────────────────────────────┘
                │
                │ Prisma ORM (SQL queries)
                ▼
┌─────────────────────────────────────────────────────────┐
│         PostgreSQL Database                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  parents table                                    │  │
│  │  ├─ id (Primary Key)                             │  │
│  │  ├─ email (Unique, indexed)                      │  │
│  │  ├─ password (bcrypt hash, never plain text)     │  │
│  │  ├─ fullName                                     │  │
│  │  ├─ phoneNumber (Kenyan format: +2547XXXXXXXX)  │  │
│  │  └─ createdAt, updatedAt                         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Layered Architecture

### 1. **Routes Layer** (`src/routes/auth.js`)
- Defines HTTP endpoints
- Delegates to controllers
- Documentation (Swagger JSDoc comments)
- **Responsibility**: HTTP binding

### 2. **Controllers Layer** (`src/controllers/authController.js`)
- Parses HTTP requests
- Calls services
- Formats HTTP responses
- Error mapping (service errors → HTTP status codes)
- **Responsibility**: HTTP request/response handling

### 3. **Services Layer** (`src/services/authService.js`)
- Business logic
- Database operations via Prisma
- Password hashing/verification
- JWT generation/verification
- **Responsibility**: Business rules

### 4. **Utilities Layer** (`src/utils/validators.js`)
- Reusable validation functions
- Input sanitization
- Self-documenting validation logic
- **Responsibility**: Data validation

### 5. **Middleware Layer** (`src/middleware/`)
- `authMiddleware.js`: JWT verification for protected routes
- `errorHandler.js`: Global error handling and standardization
- **Responsibility**: Cross-cutting concerns

## Authentication Flow

### Registration Flow: `POST /api/auth/register`

```
Client Request
    │
    ├─ fullName: "Charity Muigai"
    ├─ email: "charity@example.com"
    ├─ password: "SecurePassword123"
    └─ phoneNumber: "+254700000000"
    │
    ▼
[Route Handler]
    │
    ▼
[Controller: register()]
    │├─ Extract request body
    │├─ Call validators.validateRegistrationData()
    │└─ Call authService.registerParent()
    │
    ▼
[Service: registerParent()]
    │├─ Check for duplicate email
    ││  └─ INSERT attempts: Find existing parent
    │├─ Hash password with bcrypt (10 rounds, ~100ms)
    ││  └─ Password: "SecurePassword123" → "$2b$10$...encrypted..."
    │├─ Create parent in database (Prisma)
    │└─ Generate JWT tokens
    │   ├─ Access Token (7 minutes)
    │   └─ Refresh Token (7 days)
    │
    ▼
[Database: INSERT parent]
    │
    ▼
[Return Response]
{
  "message": "Parent registered successfully",
  "parent": {
    "id": 1,
    "email": "charity@example.com",
    "fullName": "Charity Muigai",
    "phoneNumber": "+254700000000",
    "createdAt": "2024-02-17T10:30:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login Flow: `POST /api/auth/login`

```
Client Request
    │
    ├─ email: "charity@example.com"
    └─ password: "SecurePassword123"
    │
    ▼
[Route Handler]
    │
    ▼
[Controller: login()]
    │├─ Extract email and password
    │├─ Validate input format
    │└─ Call authService.loginParent()
    │
    ▼
[Service: loginParent()]
    │├─ Find parent by email (case-insensitive)
    │├─ Compare passwords using bcrypt
    ││  └─ bcrypt.compare(plaintext, hash) → true/false
    ││  └─ Timing-safe (protects against timing attacks)
    │├─ If mismatch: throw INVALID_CREDENTIALS error
    │└─ Generate new tokens (token rotation)
    │   ├─ Access Token (7 minutes)
    │   └─ Refresh Token (7 days)
    │
    ▼
[Return Response]
{
  "message": "Login successful",
  "parent": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Protected Route Flow

```
Client Request
    │
    ├─ GET /api/protected
    └─ Headers: Authorization: Bearer <accessToken>
    │
    ▼
[Middleware: authenticate()]
    │├─ Extract Authorization header
    │├─ Parse "Bearer <token>" format
    │├─ Verify token signature using JWT_SECRET
    │├─ Check token expiration (iat, exp claims)
    │└─ If invalid/expired: return 401 Unauthorized
    │
    ▼
[Attach user to request]
    │
    req.user = {
      id: 1,
      email: "charity@example.com",
      issuedAt: Date,
      expiresAt: Date
    }
    │
    ▼
[Continue to route handler]
    │
    ▼
[Handler can access req.user for authorization]
```

### Token Refresh Flow: `POST /api/auth/refresh`

```
Client Request (when access token expires)
    │
    ├─ POST /api/auth/refresh
    └─ Body: { "refreshToken": "eyJhbGc..." }
    │
    ▼
[Controller: refresh()]
    │├─ Extract refresh token
    │└─ Call authService.refreshAccessToken()
    │
    ▼
[Service: refreshAccessToken()]
    │├─ Verify refresh token signature
    │├─ Check refresh token expiration
    │├─ Verify parent account still exists
    │├─ Generate new access token (short-lived)
    │└─ Return new token
    │
    ▼
[Return Response]
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
    │
    ▼
[Client retries original request with new token]
```

## Security Features

### 1. Password Security

- **Hashing Algorithm**: bcrypt
- **Salt Rounds**: 10 (computation time: ~100ms per hash)
- **Storage**: Only hash stored, never plain text
- **Comparison**: Timing-safe verification (resists timing attacks)

```javascript
// Hash on registration/password change
const hash = await bcrypt.hash(password, 10);

// Verify on login
const isValid = await bcrypt.compare(providedPassword, storedHash);
```

### 2. JWT Tokens

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Access Token**: 7 minutes (short-lived, minimizes exposure)
- **Refresh Token**: 7 days (long-lived, allows extended sessions)
- **Token Rotation**: New tokens on each login (prevents replay attacks)

Token payload:
```json
{
  "id": 123,
  "email": "user@example.com",
  "iat": 1692374400,  // Issued at
  "exp": 1692374820   // Expires at
}
```

### 3. Input Validation

- **Email**: RFC 5322 format
- **Password**: Minimum 8 characters
- **Phone**: Kenyan format (+2547XXXXXXXX) for M-Pesa integration
- **Full Name**: 2-255 characters

### 4. Error Messages

**Principle**: Intentionally vague error messages prevent user enumeration

- ❌ Bad: "User with email 'test@example.com' not found"
- ✓ Good: "Invalid credentials"

This prevents attackers from determining which emails are registered.

### 5. Request Validation

```javascript
// Example: Validate ALL required fields before processing
const validation = validators.validateRegistrationData({
  fullName,
  email,
  password,
  phoneNumber,
});

if (!validation.isValid) {
  return res.status(400).json({
    message: 'Validation failed',
    errors: validation.errors,
  });
}
```

## Error Handling

All errors follow a consistent structure:

```javascript
// 400 Bad Request - Validation error
{
  "message": "Validation failed",
  "errors": {
    "email": "Invalid email format",
    "password": "Too short"
  }
}

// 401 Unauthorized - Authentication failed
{
  "message": "Invalid credentials"
}

// 409 Conflict - Resource exists
{
  "message": "Email already registered",
  "error": "EMAIL_EXISTS"
}

// 500 Internal Server Error
{
  "message": "Failed to register. Please try again later."
}
```

## Database Schema

```sql
CREATE TABLE parents (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  fullName VARCHAR(255) NOT NULL,
  phoneNumber VARCHAR(20) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parents_email ON parents(email);
```

## Configuration

All configuration is read from environment variables in `.env`:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=... # Must be >= 16 characters
LOG_LEVEL=info
```

See `.env.example` for complete documentation.

## Testing the Authentication System

### 1. Register a new account

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Charity Muigai",
    "email": "charity@example.com",
    "password": "SecurePassword123",
    "phoneNumber": "+254700000000"
  }'
```

Response:
```json
{
  "message": "Parent registered successfully",
  "parent": { ... },
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "SecurePassword123"
  }'
```

### 3. Access protected endpoint

```bash
curl -X GET http://localhost:3000/api/protected \
  -H "Authorization: Bearer <accessToken>"
```

### 4. Refresh token when expired

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGci..."
  }'
```

## Future Enhancements

- [ ] Implement refresh token rotation (rotate on each refresh)
- [ ] Add refresh token blacklist for logout
- [ ] Support OAuth 2.0 (Google, Apple Sign-In)
- [ ] Add multi-factor authentication (2FA via SMS)
- [ ] Implement account lockout after failed login attempts
- [ ] Add password reset flow
- [ ] Support multiple device sessions per user
- [ ] Add CORS configuration for frontend domains
- [ ] Implement request rate limiting
- [ ] Add audit logging for all auth events

## References

- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [NIST: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
- [JWT Introduction](https://jwt.io/introduction)
- [bcrypt Documentation](https://github.com/kelektiv/node.bcrypt.js)
- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
