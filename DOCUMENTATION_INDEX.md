# 📚 SatsBlox Backend Documentation Index

Welcome to the SatsBlox Backend repository! This index helps you navigate all documentation and understand the codebase structure.

---

## 🚀 Quick Start (5 minutes)

1. **Setup**:
   ```bash
   npm install
   docker compose up -d  # Start PostgreSQL
   npx prisma migrate deploy  # Apply migrations
   npm start  # Run server
   ```

2. **Test**:
   ```bash
   curl http://localhost:3000/  # Health check
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"fullName":"Jane","email":"jane@example.com","password":"Password123!","phoneNumber":"+254700000000"}'
   ```

3. **Swagger UI**: http://localhost:3000/api-docs

---

## 📖 Documentation Files

### Getting Started

| Document | Purpose | For Whom |
|----------|---------|----------|
| [README.md](./README.md) | Setup, testing, and deployment guide | Everyone |
| [DELIVERY_SUMMARY.md](./DELIVERY_SUMMARY.md) | What was built and why | Project managers, reviewers |

### Data Model & Architecture

| Document | Purpose | For Whom |
|----------|---------|----------|
| [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md) | **Complete** data model documentation (2000+ lines) | Backend developers, architects |
| [SCHEMA_QUICK_REFERENCE.md](./SCHEMA_QUICK_REFERENCE.md) | Quick lookup for models, fields, and common queries | Developers (quick ref) |
| [prisma/schema.prisma](./prisma/schema.prisma) | Prisma schema with detailed inline comments | Developers working with the schema |

### Code & Configuration

| File | Purpose |
|------|---------|
| [src/config/env.js](./src/config/env.js) | Environment variable validation (Joi) |
| [src/config/db.js](./src/config/db.js) | Prisma client singleton & health checks |
| [src/server.js](./src/server.js) | Express app setup & startup sequence |
| [src/routes/auth.js](./src/routes/auth.js) | Authentication endpoints (register) |
| [docker-compose.yml](./docker-compose.yml) | PostgreSQL 15 container definition |
| [.env.example](./.env.example) | Environment variables template |

---

## 🗂️ Project Structure

```
Satsblox backend/
│
├── 📄 README.md                    ← Start here!
├── 📄 DELIVERY_SUMMARY.md          ← What's been built
├── 📄 SCHEMA_DOCUMENTATION.md      ← Complete data model
├── 📄 SCHEMA_QUICK_REFERENCE.md    ← Quick lookup
├── 📄 DOCUMENTATION_INDEX.md       ← This file
│
├── src/
│   ├── config/
│   │   ├── env.js                  # Environment validation
│   │   ├── db.js                   # Prisma singleton
│   │   └── swagger.js              # OpenAPI spec (stub)
│   ├── routes/
│   │   └── auth.js                 # POST /api/auth/register
│   └── server.js                   # Express entrypoint
│
├── prisma/
│   ├── schema.prisma               # 🎯 Data model (Parent-Child-Wallet)
│   └── migrations/
│       ├── 0_init/
│       │   └── migration.sql       # Parent table
│       └── 1_add_child_and_wallet/
│           └── migration.sql       # Child & Wallet tables
│
├── .env                            # Local environment (git-ignored)
├── .env.example                    # Template for .env
├── .gitignore                      # Git ignore rules
├── docker-compose.yml              # PostgreSQL container
├── package.json                    # Dependencies & scripts
└── node_modules/                   # Installed packages
```

---

## 🔍 Data Model Overview

### Entity Relationship Diagram

```
┌─────────────────────┐
│      Parent         │
├─────────────────────┤
│ id (PK)             │
│ fullName            │
│ email (UNIQUE)      │
│ phoneNumber         │
│ password            │
│ timestamps          │
└─────────────────────┘
         │
         │ 1:N (CASCADE)
         │
    ┌────▼──────────────┐
    │     Child         │
    ├──────────────────┤
    │ id (PK)          │
    │ username (UNI)   │
    │ dateOfBirth      │
    │ parentId (FK)    │
    │ timestamps       │
    └──────────────────┘
         │
         │ 1:1 (CASCADE)
         │
    ┌────▼──────────────┐
    │    Wallet         │
    ├──────────────────┤
    │ id (PK)          │
    │ balance (>= 0)   │
    │ childId (FK,UNI) │
    │ timestamps       │
    └──────────────────┘
```

### Relationships

- **One Parent → Many Children** (One-to-Many)
  - Deleting Parent cascades to Children

- **One Child → One Wallet** (One-to-One)
  - Deleting Child cascades to Wallet

- **Cascade Delete**
  - Parent ✗ → Children ✗ → Wallets ✗
  - Prevents orphaned records

For complete details, see [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md)

---

## 💻 API Endpoints

### Authentication

| Method | Endpoint | Status | Example |
|--------|----------|--------|---------|
| `POST` | `/api/auth/register` | ✅ Active | [README.md](./README.md#register-a-parent-account) |

### Planned (Sprint 3+)

- `POST /api/auth/login` (user authentication)
- `GET /api/children` (list parent's children)
- `POST /api/children` (create child)
- `GET /api/wallets/:childId` (wallet balance)
- `POST /api/wallets/:childId/deposit` (add satoshis)

---

## 🔐 Security Features

✅ **Authentication**: JWT (JSON Web Tokens)  
✅ **Passwords**: Bcrypt hashing (cost 10)  
✅ **Email**: Unique constraint + validation  
✅ **Phone**: Kenyan format validation (`+2547XXXXXXXX`)  
✅ **Balance**: Non-negative constraint (>= 0)  
✅ **Audit**: createdAt/updatedAt timestamps  
✅ **Cascades**: Proper foreign key constraints  
✅ **Secrets**: dotenv + Joi validation  

See [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md#-security--privacy) for details.

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3000/
# Response: {"status":"ok","message":"SatsBlox Backend is Running!"}
```

### Register Parent
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

More examples: [README.md](./README.md#-testing-endpoints)

---

## 🚀 Deployment Checklist

Before going to production:

- [ ] Set strong `JWT_SECRET` (min 32 chars)
- [ ] Use PostgreSQL managed service (AWS RDS, etc.)
- [ ] Enable HTTPS/TLS
- [ ] Set `NODE_ENV=production`
- [ ] Use secrets manager (not .env)
- [ ] Enable rate limiting
- [ ] Add CORS headers
- [ ] Setup logging aggregation
- [ ] Configure backups
- [ ] Monitor errors & uptime

See [README.md](./README.md#production-checklist) for full checklist.

---

## 📊 Development Workflow

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start Database
```bash
docker compose up -d
```

### 4. Apply Migrations
```bash
npx prisma migrate deploy
```

### 5. Start Server
```bash
npm start        # Production
npm run dev      # Development (auto-restart)
```

### 6. View Swagger UI
Open: http://localhost:3000/api-docs

### 7. Make Changes
- Edit files in `src/`
- If DB schema changes, run `npx prisma migrate dev --name <change>`
- Tests run automatically (if enabled)

---

## 🛠️ Useful Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Run server |
| `npm run dev` | Run with auto-restart (nodemon) |
| `npx prisma generate` | Generate Prisma client |
| `npx prisma migrate dev` | Create and apply migration |
| `npx prisma migrate deploy` | Apply pending migrations |
| `npx prisma studio` | Open Prisma Studio (DB UI) |
| `npx prisma db push` | Push schema to DB (development only) |
| `docker compose up -d` | Start PostgreSQL container |
| `docker compose down` | Stop PostgreSQL container |

---

## 📞 Common Questions

### Q: How do I add a new field to the schema?

1. Edit `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name <description>`
3. Commit the migration file

### Q: How do I delete all data?

```bash
npx prisma migrate reset  # WARNING: deletes all data
```

### Q: How do I inspect the database?

```bash
npx prisma studio  # Opens interactive UI at http://localhost:5555
```

### Q: What's the relationship between Parent and Child?

One Parent can have many Children. Each Child belongs to one Parent.  
See [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md#-relationship-flow) for details.

### Q: Can I delete a Parent?

Yes, but it cascades:
- Parent deleted → all Children deleted → all Wallets deleted
- This is intentional (prevents orphaned data)

### Q: How are passwords stored?

Hashed with bcrypt (cost 10). Never expose the hash in API responses.  
See [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md#-security--privacy) for details.

---

## 📚 External Resources

- **Prisma**: https://www.prisma.io/docs/
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Express**: https://expressjs.com/
- **JWT**: https://jwt.io/
- **Bcrypt**: https://en.wikipedia.org/wiki/Bcrypt
- **Bitcoin/Satoshis**: https://en.wikipedia.org/wiki/Satoshi_(unit)
- **Kenyan Phone Format**: https://en.wikipedia.org/wiki/Telephone_numbers_in_Kenya

---

## 🎯 Sprint Timeline

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Auth API (register endpoint) | ✅ Complete |
| Sprint 2 | Schema & Relationships | ✅ Complete |
| Sprint 3 | Child & Wallet Management | 📋 Planned |
| Sprint 4 | Transactions & Goals | 📋 Planned |
| Sprint 5 | Testing & Deployment | 📋 Planned |

---

## 📝 Changelog

### v0.2.0 (Sprint 2 - Feb 17, 2026)
- ✅ Added Child model (one-to-many with Parent)
- ✅ Added Wallet model (one-to-one with Child)
- ✅ Implemented cascade delete
- ✅ Added balance non-negative constraint
- ✅ Updated Prisma schema with detailed comments
- ✅ Created comprehensive documentation (2000+ lines)
- ✅ Added SCHEMA_DOCUMENTATION.md
- ✅ Added SCHEMA_QUICK_REFERENCE.md

### v0.1.0 (Sprint 1 - Feb 15, 2026)
- ✅ Created Parent model
- ✅ Implemented auth/register endpoint
- ✅ Setup Prisma ORM
- ✅ Added environment validation (dotenv + Joi)
- ✅ Implemented database health checks
- ✅ Created docker-compose.yml

---

## 🤝 Contributing

When adding new features:

1. **Update schema**: Edit `prisma/schema.prisma` and add comments
2. **Create migration**: `npx prisma migrate dev --name <feature>`
3. **Update documentation**: Edit relevant `.md` files
4. **Test thoroughly**: Create test cases in `tests/`
5. **Update this index**: If adding new documentation

---

## 📧 Support

For questions or issues:
1. Check [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md)
2. Check [SCHEMA_QUICK_REFERENCE.md](./SCHEMA_QUICK_REFERENCE.md)
3. Check [README.md](./README.md#-troubleshooting)
4. Contact the SatsBlox team

---

## 📄 License

Proprietary — SatsBlox Inc.

---

**Last Updated**: February 17, 2026  
**Version**: 0.2.0  
**Maintained By**: SatsBlox Development Team

---

### 🎯 Start Your Journey

👉 **New to the project?** Start here: [README.md](./README.md)  
👉 **Need data model details?** Go here: [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md)  
👉 **Quick lookup?** Go here: [SCHEMA_QUICK_REFERENCE.md](./SCHEMA_QUICK_REFERENCE.md)  
👉 **What's been done?** Go here: [DELIVERY_SUMMARY.md](./DELIVERY_SUMMARY.md)
