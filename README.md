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

### Register a Parent Account

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
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
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
  "message": "Missing required fields: fullName, email, password, phoneNumber"
}
```

**Duplicate email**:
Register the same email twice — second attempt returns (409 Conflict):
```json
{
  "message": "An account with that email already exists"
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
    "phoneNumber": "0712345678"
  }'
```
Response (400 Bad Request):
```json
{
  "message": "Phone number must be in Kenyan format: +2547XXXXXXXX"
}
```

## 📁 Project Structure

```
Satsblox backend/
├── src/
│   ├── config/
│   │   ├── env.js          # Environment validation (dotenv + Joi)
│   │   ├── db.js           # Prisma client singleton & health checks
│   │   └── swagger.js      # Minimal OpenAPI spec stub
│   ├── routes/
│   │   └── auth.js         # Authentication endpoints (/api/auth/register)
│   └── server.js           # Express app setup & startup sequence
├── prisma/
│   └── schema.prisma       # Prisma schema (Parent model)
├── .env.example            # Template for environment variables
├── docker-compose.yml      # PostgreSQL 15 container definition
├── package.json
└── README.md
```

## 🔐 Security & Best Practices

### Implemented

✅ **Environment Validation**: App fails fast if `DATABASE_URL`, `JWT_SECRET`, or `PORT` are missing  
✅ **Password Hashing**: bcrypt with 10 salt rounds  
✅ **Email Uniqueness**: Database constraint + application-level check  
✅ **Detailed Error Diagnostics**: Database health checks categorize errors (timeout, auth failure, not found, etc.)  
✅ **Graceful Shutdown**: SIGTERM handling to disconnect cleanly  
✅ **Swagger Documentation**: Auto-generated API docs with examples  

### Production Checklist

Before deploying:

- [ ] Set strong `JWT_SECRET` (min 16 chars, ideally 32+)
- [ ] Enable HTTPS/TLS for all connections
- [ ] Use a managed PostgreSQL service (AWS RDS, DigitalOcean, Heroku Postgres, etc.)
- [ ] Set `NODE_ENV=production`
- [ ] Use environment variables securely (secrets manager, not .env in production)
- [ ] Enable rate limiting on `/api/auth/register`
- [ ] Add CORS headers if frontend is on a different origin
- [ ] Implement logging aggregation (Sentry, LogRocket, ELK stack)
- [ ] Set up database backups
- [ ] Monitor for failed login attempts (brute force protection)

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
