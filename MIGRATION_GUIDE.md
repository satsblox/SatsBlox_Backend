# Migration & Seeding Guide

> **Professional Database Versioning and Data Population for SatsBlox**

## Table of Contents

1. [Migration Strategy](#migration-strategy)
2. [Seeding Strategy](#seeding-strategy)
3. [Local Development Workflow](#local-development-workflow)
4. [Production Deployment](#production-deployment)
5. [Common Workflows](#common-workflows)
6. [Troubleshooting](#troubleshooting)

---

## Migration Strategy

### Overview

A **migration** is a version-controlled snapshot of your database schema. Migrations ensure that:

- ✅ **Every developer** has the same database structure
- ✅ **Changes are tracked** in version control (git)
- ✅ **Rollbacks are possible** (revert to previous versions)
- ✅ **Production deployments are safe** (apply changes step-by-step)

Prisma stores migrations in `/prisma/migrations/` with both SQL files (database-agnostic) and manifest files.

### How Migrations Work in Prisma

```
Prisma Schema (prisma/schema.prisma)
        ↓
    Your Changes
        ↓
npx prisma migrate dev --name <migration_name>
        ↓
Prisma creates SQL in /prisma/migrations/<timestamp>_<name>/migration.sql
        ↓
SQL is executed against your local PostgreSQL
        ↓
prisma/migrations_lock.toml is updated (prevents conflicting migrations)
        ↓
Prisma Client is regenerated with updated types
```

### Naming Conventions

Migration names should be **lowercase**, **descriptive**, and use **underscores**:

| Good Examples | Poor Examples |
|---|---|
| `init_parent_child_wallet` | `AddModels`, `v1`, `test` |
| `add_transaction_model` | `TODO_fix`, `new_table_1`, `schema_v2` |
| `add_wallet_balance_index` | `Migration1`, `update`, `schema` |
| `modify_child_username_unique` | `MIGRATION_USER_NAME` |

**Pattern**: `<action>_<what>_<optional_detail>`

**Examples in this project**:
- `1_init_parent_model` - Initial Parent table
- `2_add_child_and_wallet_models` - Add Child and Wallet tables (already created)
- `3_add_transaction_model` - (future) Add Transaction table for audit trail
- `4_add_indexes_for_performance` - (future) Add database indexes

### Traceability Folder Structure

```
/prisma
  ├── migrations/
  │   ├── 20240101120000_1_init_parent_model/
  │   │   ├── migration.sql
  │   │   └── migration_lock.toml
  │   │
  │   ├── 20240115143000_2_add_child_and_wallet_models/
  │   │   ├── migration.sql
  │   │   └── migration_lock.toml
  │   │
  │   ├── 20240220090000_3_add_transaction_model/        (future)
  │   │   ├── migration.sql
  │   │   └── migration_lock.toml
  │   │
  │   └── migration_lock.toml
  │
  ├── schema.prisma
  └── seed.js
```

**Key**: Timestamped folders + descriptive names = Git-friendly version history

### Shadow Database (Safety Net)

A **shadow database** is a temporary, isolated PostgreSQL database used to validate migrations **before** applying them to your real development database.

**Benefits**:
- 🛡️ Test migrations without risking data loss
- 🚀 Detect conflicts early
- ✅ Verify schema correctness

**Setup Shadow Database**:

Add to `.env`:

```env
# Main development database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satsblox_dev"

# Shadow database (used for migration validation only)
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/satsblox_shadow"
```

Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")  // Add this line
}
```

**How to use**:

```bash
# Prisma automatically uses shadow DB during migrate dev
npx prisma migrate dev --name add_transaction_model

# Shadow DB is cleaned up automatically after validation
# If migration succeeds → changes applied to real DB
# If migration fails → real DB untouched, shadow DB discarded
```

---

## Seeding Strategy

### Overview

**Seeding** is populating your database with initial data. In SatsBlox, seeding provides:

- ✅ **Consistent test data** for all developers
- ✅ **Ready-to-use data** for frontend testing
- ✅ **Idempotent operation** (safe to run multiple times)

The seed script (`prisma/seed.js`) automatically runs when you execute:

```bash
npx prisma db seed
# OR
npm run seed
```

### Seed Script Responsibilities

Our `prisma/seed.js` handles:

1. **Database Cleaning** 🧹
   - Deletes all existing records (in reverse dependency order: Wallets → Children → Parents)
   - Prevents duplicate key errors on re-runs
   - Idempotent: safe to run 100 times

2. **Test Data Creation** 👤👶
   - Creates 1 Parent: `Charity Muigai` (charity.muigai@satsblox.dev)
   - Creates 2 Children with unique usernames
   - Links Children to Parent via foreign key

3. **Wallet Initialization** 💰
   - Each Child gets a Wallet
   - Initial balance: 500,000 satoshis (Child 1), 250,000 satoshis (Child 2)
   - Ready for balance testing

4. **Security** 🔐
   - Password hashed with bcrypt (not stored plain)
   - Salt rounds: 10 (industry standard)

5. **Logging** 📝
   - Clear console output with emojis
   - Each step visible: cleaning, creating, summary

### Test Data Included

```javascript
Parent Account:
├─ Email: charity.muigai@satsblox.dev
├─ Password: TestPassword123!
├─ Phone: +254712345678
└─ Full Name: Charity Muigai

Child 1:
├─ Username: amara-saving-goal
├─ Date of Birth: 2015-03-21
├─ Parent ID: (auto-generated)
└─ Wallet Balance: 500,000 satoshis

Child 2:
├─ Username: liam-treasure-hunt
├─ Date of Birth: 2018-07-15
├─ Parent ID: (auto-generated)
└─ Wallet Balance: 250,000 satoshis
```

### Customizing Seed Data

Edit `prisma/seed.js` → `TEST_DATA` object:

```javascript
const TEST_DATA = {
  parent: {
    fullName: 'Charity Muigai',           // ← Change parent name
    email: 'charity.muigai@satsblox.dev', // ← Change email
    phoneNumber: '+254712345678',         // ← Change phone
    plainPassword: 'TestPassword123!',    // ← Change password
  },
  children: [
    {
      username: 'amara-saving-goal',      // ← Change username
      dateOfBirth: new Date('2015-03-21'),// ← Change birth date
      initialBalance: 500000n,             // ← Change wallet balance
    },
    // Add more children here
  ],
};
```

---

## Local Development Workflow

### First-Time Setup

**Step 1: Start PostgreSQL Container**

```bash
docker compose up -d
```

Verify connection:

```bash
docker ps  # Should show "satsblox-postgres" running
```

**Step 2: Sync Database with Schema**

```bash
npx prisma migrate deploy
```

This applies all pending migrations to your database. You should see:

```
✓ Ran 2 migrations
```

**Step 3: Seed Initial Data**

```bash
npx prisma db seed
# OR
npm run seed
```

Expected output:

```
[SEED] 📌 Starting database seeding...
[SEED] 🧹 Cleaning database...
[SEED] 🔄 Deleted 2 wallets
[SEED] 🔄 Deleted 2 children
[SEED] 🔄 Deleted 1 parents
[SEED] 👤 Created: Charity Muigai
[SEED] 👶 Created Child: amara-saving-goal (ID: 1)
[SEED] 💰 Created Wallet: 500000 sats (ID: 1)
[SEED] ✅ Database seeding complete!
```

**Step 4: Start Development Server**

```bash
npm run dev
```

The server now connects to the seeded database with test data ready for frontend testing.

### Adding a New Migration

When you **modify** `prisma/schema.prisma`, you must create a migration:

**Example**: Add a `Transaction` model for audit trail

**Step 1: Update Schema**

Edit `prisma/schema.prisma` and add:

```prisma
model Transaction {
  id        Int       @id @default(autoincrement())
  type      String    @db.VarChar(50)  // "deposit" or "withdrawal"
  amount    BigInt
  walletId  Int
  wallet    Wallet    @relation(fields: [walletId], references: [id], onDelete: Cascade)
  createdAt DateTime  @default(now())
  
  @@map("transactions")
}
```

Add relationship to Wallet:

```prisma
model Wallet {
  // ... existing fields ...
  transactions Transaction[]
}
```

**Step 2: Create Migration**

```bash
npx prisma migrate dev --name add_transaction_model
```

Prisma will:
1. Compare your schema to the database
2. Prompt you for a migration name (if not provided)
3. Generate SQL in `/prisma/migrations/<timestamp>_add_transaction_model/`
4. Apply the migration to your local database
5. Regenerate Prisma Client types

**Step 3: Commit to Git**

```bash
git add prisma/migrations/
git commit -m "feat: add Transaction model for audit trail"
```

Now teammates can sync with:

```bash
npx prisma migrate deploy
```

---

## Production Deployment

### Safe Deployment Checklist

- [ ] All migrations are committed to git
- [ ] Migrations tested locally against shadow database
- [ ] Database backup created before applying migrations
- [ ] Migrations are applied in order (use `npx prisma migrate deploy`)
- [ ] Verify schema matches Prisma schema after migration
- [ ] Seed script is NOT run in production (seeds are for dev only)

### Deployment Steps

**On Production Server**:

```bash
# 1. Fetch latest code with migrations
git pull origin main

# 2. Apply pending migrations (in order)
npx prisma migrate deploy

# 3. Regenerate Prisma Client with production types
npx prisma generate

# 4. Restart application
pm2 restart satsblox-backend
# OR systemctl restart satsblox-backend
```

**Important**: NEVER run `npx prisma db seed` in production. Seeds are test data only.

### Rollback Strategy

To revert a migration in production (destructive operation, use with caution):

```bash
# List all migrations
npx prisma migrate status

# Reset database to a specific migration (THIS DELETES DATA!)
npx prisma migrate resolve --rolled-back <migration_name>

# Then apply remaining migrations
npx prisma migrate deploy
```

**Warning**: Rollbacks delete data. Always backup production database first.

---

## Common Workflows

### Workflow 1: Fresh Development Environment

You just cloned the repo and want to get started:

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Apply all migrations
npx prisma migrate deploy

# 4. Seed with test data
npm run seed

# 5. Start development server
npm run dev

# 6. Verify in browser
# Login at http://localhost:3000/api/auth with:
# Email: charity.muigai@satsblox.dev
# Password: TestPassword123!
```

### Workflow 2: Modify Schema and Create Migration

You added a new field to the Parent model:

```bash
# 1. Update prisma/schema.prisma (add field)
# 2. Create and apply migration
npx prisma migrate dev --name add_parent_avatar_url

# 3. Review generated SQL in /prisma/migrations/<timestamp>_add_parent_avatar_url/
# 4. Test your code against new schema
# 5. Commit migration
git add prisma/migrations/
git commit -m "feat: add avatar_url field to Parent model"
```

### Workflow 3: Sync with Teammates

Teammate pushed migrations:

```bash
# 1. Fetch latest code
git pull origin main

# 2. Apply their migrations to your local database
npx prisma migrate deploy

# 3. Regenerate Prisma Client with new types
npx prisma generate

# 4. Continue development
npm run dev
```

### Workflow 4: Reset Database (Development Only)

You want to start fresh:

```bash
# 1. Reset database (deletes all data)
npx prisma migrate reset

# This runs:
# - Drops the database
# - Recreates it
# - Applies all migrations
# - Automatically runs npx prisma db seed

# 2. Verify seeded data
npx prisma studio
```

### Workflow 5: Check Schema Drift

Verify your database matches your Prisma schema:

```bash
# This detects mismatches between schema.prisma and actual database
npx prisma db push

# If there's drift:
# 1. It will tell you what's different
# 2. Use `prisma migrate dev` to fix it properly
# 3. Never use `db push` in production
```

---

## Troubleshooting

### ❌ "Error: can't reach database server"

```
P1001: Can't reach database server at `localhost:5432`...
```

**Solution**:

```bash
# Is PostgreSQL running?
docker ps

# If not, start it:
docker compose up -d

# Check logs:
docker compose logs postgres
```

---

### ❌ "Error: P3012 The introspected database was empty"

```
The introspected database was empty: no tables found in the database.
```

**Solution**: No schema exists in the database. Apply migrations:

```bash
npx prisma migrate deploy
```

---

### ❌ "Error: PrismaClientKnownRequestError P2002"

```
Unique constraint failed on the fields: (`email`)
```

**Solution**: Unique constraint violation during seed. Clean up:

```bash
# Reset database (deletes all data and re-seeds)
npx prisma migrate reset

# OR manually delete data and re-seed
DELETE FROM wallets;
DELETE FROM children;
DELETE FROM parents;

npx prisma db seed
```

---

### ❌ "Migration file not found"

```
The migration "20240101120000_init" was not found...
```

**Solution**: Migration file was deleted or path is wrong.

```bash
# Reconcile migrations:
npx prisma migrate resolve --rolled-back 20240101120000_init

# Then re-apply:
npx prisma migrate deploy
```

---

### ❌ "Seeding fails silently"

**Solution**: Check for errors:

```bash
# Run seed with verbose error output
node prisma/seed.js

# Check Prisma Client generation:
npx prisma generate

# Verify bcrypt is installed:
npm list bcrypt
```

---

### ❌ "Cannot find module 'bcrypt'"

```
Error: Cannot find module 'bcrypt'
```

**Solution**: bcrypt not installed. Install it:

```bash
npm install bcrypt
```

---

### ❌ "Migration lock timeout"

```
Error: EEXIST: file already exists at migration_lock.toml
```

**Solution**: Migration lock is held. Clear it:

```bash
# Remove the lock file
rm prisma/migrations/migration_lock.toml

# Reinitialize migrations
npx prisma migrate deploy
```

---

## Best Practices

✅ **DO**:
- Commit migrations to git
- Use descriptive migration names
- Test migrations locally before production
- Run seed script in dev, not production
- Use shadow database for safety
- Keep schema.prisma updated with comments

❌ **DON'T**:
- Edit migration SQL files manually (recreate the migration instead)
- Run migrations manually with SQL
- Use `prisma db push` in production
- Skip migration names (use meaningful names)
- Seed production database
- Modify old migrations (they're historical records)

---

## References

- [Prisma Migrations Documentation](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)
- [Prisma Seeding Documentation](https://www.prisma.io/docs/orm/prisma-client/development/seeding)
- [PostgreSQL Best Practices](https://www.postgresql.org/docs/current/sql-syntax.html)

---

**Last Updated**: February 2026  
**Version**: 1.0  
**Status**: Production Ready
