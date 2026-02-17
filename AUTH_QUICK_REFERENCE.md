# Authentication Quick Reference

## File Structure

```
src/
├── config/
│   ├── db.js              # Database connection & health check
│   ├── env.js             # Environment variable validation
│   └── swagger.js         # OpenAPI specifications
├── controllers/
│   └── authController.js  # HTTP request handlers (register, login, refresh)
├── middleware/
│   ├── authMiddleware.js  # JWT verification for protected routes
│   └── errorHandler.js    # Global error handling
├── services/
│   └── authService.js     # Business logic (bcrypt, JWT, database operations)
├── routes/
│   └── auth.js            # Express router mounting all auth endpoints
├── utils/
│   └── validators.js      # Reusable validation functions
└── server.js              # Express app initialization & startup

.env.example                # Environment variable template
AUTH_ARCHITECTURE.md        # Detailed architecture documentation
```

## API Endpoints

### Registration
```
POST /api/auth/register

Request:
{
  "fullName": "Charity Muigai",
  "email": "charity@example.com",
  "password": "SecurePassword123",
  "phoneNumber": "+254700000000"
}

Response (201):
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

### Login
```
POST /api/auth/login

Request:
{
  "email": "charity@example.com",
  "password": "SecurePassword123"
}

Response (200):
{
  "message": "Login successful",
  "parent": { ... },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### Refresh Token
```
POST /api/auth/refresh

Request:
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Response (200):
{
  "message": "Token refreshed successfully",
  "accessToken": "...",
  "refreshToken": "..."
}
```

## Using Authentication in Protected Routes

### Example 1: Protect a route with authentication middleware

```javascript
// src/routes/parents.js

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Example protected endpoint
router.get('/me', authMiddleware.authenticate, async (req, res) => {
  // req.user is now available with id, email, issuedAt, expiresAt
  
  const parentId = req.user.id;
  
  // ... fetch parent data, return response
});

module.exports = router;
```

### Example 2: Optional authentication

```javascript
// Some routes might show different data if authenticated

router.get('/profile/:id', authMiddleware.authenticateOptional, async (req, res) => {
  // req.user is set if valid token provided, undefined otherwise
  
  const targetId = req.params.id;
  
  if (req.user && req.user.id === parseInt(targetId)) {
    // User is viewing their own profile - show full details
    return res.json(fullProfile);
  } else {
    // User is viewing someone else's profile - show limited details
    return res.json(publicProfile);
  }
});
```

### Example 3: Authorization (checking permissions)

```javascript
// In a future endpoint for updating parent account

router.put('/me', authMiddleware.authenticate, async (req, res) => {
  const requestingUserId = req.user.id;
  const targetUserId = req.body.userId;
  
  // Authorization: Only allow user to update their own data
  if (requestingUserId !== targetUserId) {
    return res.status(403).json({
      message: 'Forbidden: You can only update your own profile'
    });
  }
  
  // ... proceed with update
});
```

## Validation Functions

All validation functions are in `src/utils/validators.js`:

```javascript
const {
  validateEmail,
  validatePassword,
  validateKenyanPhone,
  validateFullName,
  validateRegistrationData,
  validateLoginData,
} = require('../utils/validators');

// Individual validators
const emailCheck = validateEmail('test@example.com');
if (!emailCheck.isValid) {
  console.log(emailCheck.error);
}

// Composite validators (recommended)
const regValidation = validateRegistrationData({
  fullName: 'John Doe',
  email: 'john@example.com',
  password: 'SecurePass123',
  phoneNumber: '+254700000000',
});

if (!regValidation.isValid) {
  // regValidation.errors contains field-specific errors
}
```

## Authentication Service Functions

All business logic is in `src/services/authService.js`:

```javascript
const authService = require('../services/authService');

// Register a new parent
const { parent, accessToken, refreshToken } = await authService.registerParent({
  fullName,
  email,
  password,
  phoneNumber,
});

// Authenticate parent
const { parent, accessToken, refreshToken } = await authService.loginParent(
  email,
  password
);

// Refresh access token
const { accessToken, refreshToken } = await authService.refreshAccessToken(
  refreshToken
);

// Verify a token (useful for custom verification)
const payload = authService.verifyToken(token);
console.log(payload.id, payload.email, payload.exp);
```

## Common Error Scenarios

### Validation Error
```json
{
  "message": "Registration validation failed",
  "errors": {
    "email": "Invalid email format",
    "phoneNumber": "Phone number must be in Kenyan format: +2547XXXXXXXX"
  }
}
```

### Email Already Exists
```
Status: 409 Conflict
{
  "message": "Email already registered",
  "error": "EMAIL_EXISTS"
}
```

### Invalid Credentials
```
Status: 401 Unauthorized
{
  "message": "Invalid credentials"
}
```

### Token Expired
```
Status: 401 Unauthorized
{
  "message": "Token expired",
  "error": "TOKEN_EXPIRED"
}
```

### Missing Authorization Header
```
Status: 400 Bad Request
{
  "message": "Authorization header is required"
}
```

## Token Information

### Access Token
- **Lifespan**: 7 minutes
- **Use**: Included in `Authorization: Bearer <token>` header for API requests
- **Storage**: Should be in memory or sessionStorage (NOT localStorage for SPA security)
- **When expired**: Use refresh token to get new access token

### Refresh Token
- **Lifespan**: 7 days
- **Use**: Stored securely on client, used only to refresh access token
- **Storage**: MUST be in httpOnly cookie (secure against XSS)
- **When expired**: User must re-authenticate (login again)

## Troubleshooting

### "Authorization header is required" but I included it

Check that your header format is correct:
```
✓ Correct: Authorization: Bearer eyJhbGci...
✗ Wrong: Authorization: eyJhbGci...
✗ Wrong: Authentication: Bearer eyJhbGci...
```

### "Token expired" immediately after login

Check that your system clock is synchronized. JWT uses absolute timestamps.

### Password hashing seems slow

This is intentional! bcrypt with 10 salt rounds takes ~100ms per hash.
This protects against brute-force attacks.

### "Invalid email format" but the email looks valid to me

Kenyan email validation follows RFC 5322. Some domains may not work:
- ✓ user@example.com
- ✓ user.name@example.co.uk
- ✗ user name@example.com (space not allowed)
- ✗ @example.com (missing local part)

## Development Commands

```bash
# Start development server (with hot reload)
npm run dev

# Start production server
npm start

# Seed database
npm run seed

# View Swagger UI
open http://localhost:3000/api-docs
```

## Best Practices

1. **Never log sensitive data**: Don't log passwords, tokens, or sensitive user info
2. **Error messages**: Keep them vague to prevent user enumeration
3. **Validation**: Validate on both client and server (defense in depth)
4. **Token storage**: Use httpOnly cookies for refresh tokens
5. **HTTPS**: Always use HTTPS in production
6. **Rate limiting**: Add rate limiting to prevent brute force (future enhancement)
7. **CORS**: Configure appropriate CORS headers for frontend domains

## See Also

- [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md) - Detailed architecture documentation
- [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md) - Database schema details
- [.env.example](./.env.example) - Configuration reference
