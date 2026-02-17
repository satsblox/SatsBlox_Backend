# SatsBlox Backend

A production-ready Node.js/Express backend for **SatsBlox**, a FinTech/EdTech platform for Bitcoin-powered savings in Kenya.

## 🏗️ Architecture

- **Framework**: Express.js
- **Database**: PostgreSQL (ORM: Prisma)
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt
- **Containerization**: Docker Compose for local PostgreSQL
- **Environment Management**: dotenv + Joi validation
- **API Documentation**: Swagger/OpenAPI

## 📋 Prerequisites

- **Node.js**: v16+ (recommended: v18+)
- **npm**: v8+
- **Docker** & **Docker Compose**: for PostgreSQL container (optional; you can use a local PostgreSQL instance)
- **PostgreSQL**: v15+ (if not using Docker)

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
cd Satsblox\ backend
npm install
```

### 2. Set Up Environment

Copy `.env.example` to `.env` and populate with real values:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/satsblox
JWT_SECRET=your_strong_secret_min_16_chars_here
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Start PostgreSQL

**Option A: Using Docker Compose (Recommended)**
```bash
docker-compose up -d
```
This starts a PostgreSQL 15 container named `satsblox-postgres` with:
- Database: `satsblox`
- User: `postgres`
- Password: `postgres`
- Port: `5432`

**Option B: Local PostgreSQL**
If you have PostgreSQL installed locally, ensure the `satsblox` database exists:
```bash
createdb satsblox
# or using psql:
psql -c "CREATE DATABASE satsblox;"
```

### 4. Initialize Database Schema

Prisma will automatically create tables on first startup, but you can manually run migrations:

```bash
npx prisma migrate dev --name init
```

### 5. Start the Server

```bash
npm start
```

Expected output:
```
[SERVER] Starting SatsBlox Backend...
[SERVER] Environment: development
[SERVER] Performing database health check...
[DATABASE] Connection established successfully to PostgreSQL
[SERVER] ✓ Listening on port 3000
[SERVER] ✓ Swagger UI available at http://localhost:3000/api-docs
```

## �️ Database Migrations

A **migration** is a version-controlled snapshot of your database schema. Prisma stores migrations in `/prisma/migrations/`.

### Apply Migrations

```bash
# Apply all pending migrations to your database
npx prisma migrate deploy
```

This creates all tables (Parent, Child, Wallet) based on `prisma/schema.prisma`.

### Create a New Migration

When you modify `prisma/schema.prisma`, create a migration:

```bash
# Example: Add a Transaction model for audit trail
npx prisma migrate dev --name add_transaction_model

# Prisma will:
# 1. Generate SQL for your changes
# 2. Apply it to your local database
# 3. Create a timestamped folder in /prisma/migrations/
# 4. Regenerate Prisma Client types
```

**Naming conventions**: Use lowercase with underscores (`add_user_avatar`, `modify_child_username_unique`)

For comprehensive migration strategies, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

## 🌱 Database Seeding

**Seeding** populates your database with initial test data. Run it once to get test data ready for frontend development.

### Seed the Database

```bash
# Option 1: Using npm script
npm run seed

# Option 2: Using Prisma
npx prisma db seed
```

Expected output:
```
[SEED] 📌 Starting database seeding...
[SEED] 🧹 Cleaning database...
[SEED] ✅ Database cleaned successfully
[SEED] 👤 Created: Charity Muigai (ID: 1)
[SEED] 👶 Created Child: amara-saving-goal (ID: 1)
[SEED] 💰 Created Wallet: 500000 sats (ID: 1)
[SEED] 👶 Created Child: liam-treasure-hunt (ID: 2)
[SEED] 💰 Created Wallet: 250000 sats (ID: 2)
[SEED] ✅ Database seeding complete!
```

### Test Login with Seeded Data

After seeding, use these credentials to test the authentication:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity.muigai@satsblox.dev",
    "password": "TestPassword123!",
    "fullName": "Charity Muigai",
    "phoneNumber": "+254712345678"
  }'
```

Or use in your frontend:
- **Email**: `charity.muigai@satsblox.dev`
- **Password**: `TestPassword123!`

### Customize Seed Data

Edit `prisma/seed.js` → `TEST_DATA` object to change:
- Parent name, email, phone, password
- Child usernames and birth dates
- Initial wallet balances

Then re-run:
```bash
npm run seed
```

**Important**: Never run seed in production. Seeds are test data only.

### View Seeded Data

Browse your database interactively:

```bash
npx prisma studio
```

Opens http://localhost:5555 with a visual database browser.

## �📚 API Documentation

**Swagger/OpenAPI UI**: http://localhost:3000/api-docs

**Data Schema Documentation**: See [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md) for:
- Complete Parent-Child-Wallet relationships
- Security & privacy rules
- Database constraints & validation
- Prisma client usage examples
- Future enhancements (Transactions, Goals, Achievements)

## 🧪 Testing Endpoints

### Health Check
```bash
curl http://localhost:3000/
```
Response:
```json
{
  "status": "ok",
  "message": "SatsBlox Backend is Running!"
}
```

### 🔐 Authentication Endpoints

#### 1. Register a New Parent Account
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Charity Muigai",
    "email": "charity@example.com",
    "password": "StrongPassword123!",
    "phoneNumber": "+254700000000"
  }'
```

Response (201 Created):
```json
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

#### 2. Login (Authenticate Existing Parent)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "StrongPassword123!"
  }'
```

Response (200 OK):
```json
{
  "message": "Login successful",
  "parent": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 3. Refresh Token (Get New Access Token)
When your access token expires, use the refresh token to get a new one:

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

Response (200 OK):
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 4. Access Protected Endpoint (with Bearer Token)
```bash
curl -X GET http://localhost:3000/api/protected \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Validation Examples

**Missing field**:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "email": "john@example.com"
  }'
```
Response (400 Bad Request):
```json
{
  "message": "Registration validation failed",
  "errors": {
    "password": "Password is required and must be a string",
    "phoneNumber": "Phone number is required and must be a string"
  }
}
```

**Duplicate email**:
Register the same email twice — second attempt returns (409 Conflict):
```json
{
  "message": "Email already registered",
  "error": "EMAIL_EXISTS"
}
```

**Invalid phone format**:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123!",
    "phoneNumber": "0712345678"  # Missing country code
  }'
```
Response (400 Bad Request):
```json
{
  "message": "Registration validation failed",
  "errors": {
    "phoneNumber": "Phone number must be in Kenyan format: +2547XXXXXXXX (e.g., +254700123456)"
  }
}
```

**Invalid email**:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "email": "not-an-email",
    "password": "StrongPassword123!",
    "phoneNumber": "+254700000000"
  }'
```
Response (400 Bad Request):
```json
{
  "message": "Registration validation failed",
  "errors": {
    "email": "Invalid email format"
  }
}
```

**Invalid credentials on login**:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "WrongPassword123!"
  }'
```
Response (401 Unauthorized):
```json
{
  "message": "Invalid credentials"
}
```

## 📁 Project Structure

```
Satsblox backend/
├── src/
│   ├── config/
│   │   ├── env.js              # Environment validation (dotenv + Joi)
│   │   ├── db.js               # Prisma client singleton & health checks
│   │   └── swagger.js          # OpenAPI 3.0 specification
│   ├── controllers/
│   │   └── authController.js   # HTTP handlers (register, login, refresh)
│   ├── middleware/
│   │   ├── authMiddleware.js   # JWT verification for protected routes
│   │   └── errorHandler.js     # Global error handling & standardization
│   ├── services/
│   │   └── authService.js      # Business logic (bcrypt, JWT, DB operations)
│   ├── routes/
│   │   └── auth.js             # Express router for /api/auth endpoints
│   ├── utils/
│   │   └── validators.js       # Reusable validation functions
│   └── server.js               # Express app setup & startup sequence
├── prisma/
│   ├── schema.prisma           # Prisma schema (Parent, Child, Wallet models)
│   ├── seed.js                 # Test data seeding script
│   └── migrations/             # Version-controlled database migrations
├── .env.example                # Template for environment variables
├── docker-compose.yml          # PostgreSQL 15 container definition
├── package.json
├── AUTH_ARCHITECTURE.md        # Detailed authentication architecture docs
├── AUTH_QUICK_REFERENCE.md     # Quick reference for auth implementation
├── README.md                   # This file
└── ...other docs
```

**Key Files for Sprint 1 (Authentication)**:
- `src/routes/auth.js` - All auth endpoints with Swagger docs
- `src/controllers/authController.js` - Request/response handlers
- `src/services/authService.js` - JWT and password logic
- `src/middleware/authMiddleware.js` - Token verification
- `src/utils/validators.js` - Input validation
- `AUTH_ARCHITECTURE.md` - Full implementation guide
- `AUTH_QUICK_REFERENCE.md` - Quick developer reference

## 🔐 Security & Best Practices

### Implemented in Sprint 1

✅ **JWT Authentication**: Secure token-based authentication with access/refresh token rotation  
✅ **Password Hashing**: bcrypt with 10 salt rounds (~100ms per hash, prevents brute force)  
✅ **Email Uniqueness**: Database UNIQUE constraint + application-level check  
✅ **Input Validation**: Comprehensive validators for email, password, phone (Kenyan format)  
✅ **Error Handling**: Global error middleware with consistent JSON responses  
✅ **Vague Error Messages**: "Invalid credentials" instead of user enumeration hints  
✅ **Token Verification**: JWT signature validation (HS256) and expiration checking  
✅ **Middleware Architecture**: `authenticate()` middleware protects private routes  
✅ **Environment Validation**: App fails fast if required env vars missing (DATABASE_URL, JWT_SECRET)  
✅ **Graceful Shutdown**: SIGTERM handling to close connections cleanly  
✅ **Swagger Documentation**: Auto-generated API docs with JWT bearer scheme  
✅ **Layered Architecture**: Separation of concerns (routes → controllers → services → utils)

### Authentication Features

**Token Management**:
- **Access Token**: 7 minute lifespan (short-lived for security)
- **Refresh Token**: 7 day lifespan (long-lived for convenience)
- **Token Rotation**: New tokens on each login (prevents replay attacks)

**Kenyan Localization**:
- Phone number validation: +2547XXXXXXXX format (M-Pesa compatible)
- Internationalized validation error messages
- Ready for future SMS/USSD features

### Production Checklist

Before deploying:

- [ ] Set strong `JWT_SECRET` (min 16 chars, use `openssl rand -base64 32` to generate)
- [ ] Enable HTTPS/TLS for all connections (use reverse proxy like nginx or CloudFlare)
- [ ] Use managed PostgreSQL (AWS RDS, DigitalOcean, Azure Database)
- [ ] Set `NODE_ENV=production`
- [ ] Use secrets manager for sensitive config (AWS Secrets Manager, Vault, etc.)
- [ ] Implement rate limiting on auth endpoints (prevent brute force)
- [ ] Configure CORS headers for frontend domains
- [ ] Set up logging aggregation (Sentry, DataDog, ELK)
- [ ] Enable database encryption at rest
- [ ] Set up automated database backups (daily minimum)
- [ ] Monitor failed login attempts per IP/email
- [ ] Implement account lockout after N failed attempts
- [ ] Use HTTPS-only cookies for refresh tokens
- [ ] Set up security headers (CSP, X-Frame-Options, etc.)
- [ ] Update dependencies regularly: `npm audit fix`

### Documentation References

- **Detailed Architecture**: [AUTH_ARCHITECTURE.md](./AUTH_ARCHITECTURE.md)
- **Quick Reference**: [AUTH_QUICK_REFERENCE.md](./AUTH_QUICK_REFERENCE.md)
- **Security Best Practices**: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## 🛠️ Development

### Start in Watch Mode

Uses `nodemon` to auto-restart on file changes:

```bash
npm run dev
```

### Generate Prisma Client

After modifying `prisma/schema.prisma`:

```bash
npx prisma generate
```

### Browse Database

Use Prisma Studio to explore data interactively:

```bash
npx prisma studio
```

Opens: http://localhost:5555

## 🐛 Troubleshooting

### Server Fails to Start

**Error**: `[SERVER] ✗ Startup failed: [DATABASE] Health check failed: ...`

**Solutions**:
1. Check `.env` file exists and `DATABASE_URL` is set correctly
2. Ensure PostgreSQL is running: `docker-compose ps` or `psql -c "\l"`
3. Verify database `satsblox` exists
4. Check credentials in `DATABASE_URL`

### Database Connection Refused

**Error**: `Connection refused. Is PostgreSQL running?`

**Solution**:
```bash
# Start PostgreSQL container
docker-compose up -d

# Or, if using local PostgreSQL, restart the service
# macOS:
brew services restart postgresql

# Linux:
sudo systemctl restart postgresql

# Windows:
# Use Services app or restart manually
```

### Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000  # macOS/Linux

# Kill it
kill -9 <PID>

# Or, use a different port
PORT=3001 npm start
```

### Prisma Migration Issues

**Reset database** (WARNING: deletes all data):
```bash
npx prisma migrate reset
```

## 📞 Support & Issues

For bugs, feature requests, or questions, open an issue on GitHub or contact the SatsBlox team.

## 📄 License

Proprietary — SatsBlox Inc.

---

**Last Updated**: February 2026  
**Version**: 0.1.0 (Sprint 1: Auth API)
