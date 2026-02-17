# SatsBlox Data Schema & Relationship Documentation

## Overview

This document describes the core data architecture for SatsBlox: a Bitcoin savings platform for families in Kenya. The schema is built with PostgreSQL and Prisma ORM.

**Version**: 0.2.0 (Sprint 2: Schema & Relationships)  
**Date**: February 2026

---

## 🏗️ Core Entities

### 1. **Parent Model**

Represents a parent/guardian account in the SatsBlox ecosystem.

#### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `id` | Integer (auto-increment) | PRIMARY KEY | Unique identifier |
| `fullName` | VARCHAR(255) | NOT NULL | Parent's legal name (e.g., "Charity Muigai") |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Login email; case-insensitive lookups |
| `phoneNumber` | VARCHAR(20) | NOT NULL | Kenyan format: `+2547XXXXXXXX` (M-Pesa ready) |
| `password` | VARCHAR(255) | NOT NULL, **[SENSITIVE]** | Bcrypt hash (never expose in API) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| `updatedAt` | TIMESTAMP | AUTO UPDATE | Last modification timestamp |

#### Relationships

- **One-to-Many** → `Child[]` (parent can have many children)
  - Cascade delete: deleting a Parent removes all Children and their Wallets
  - Relationship name: `ParentToChildren`

#### Security Notes

- **[SENSITIVE]**: `password` field must be excluded from all API responses
- **Email**: Unique constraint prevents duplicate registrations
- **Phone**: Stored as string to preserve `+` prefix for international format

#### Example Data

```
Parent {
  id: 1,
  fullName: "Charity Muigai",
  email: "charity@example.com",
  phoneNumber: "+254700000000",
  password: "$2b$10$...", // bcrypt hash (60 chars)
  createdAt: "2024-01-15T10:30:00Z",
  updatedAt: "2024-01-15T10:30:00Z"
}
```

---

### 2. **Child Model**

Represents a child/beneficiary account linked to a Parent.

#### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `id` | Integer (auto-increment) | PRIMARY KEY | Unique identifier |
| `username` | VARCHAR(100) | UNIQUE, NOT NULL | Display name (e.g., "amara-saver") |
| `dateOfBirth` | TIMESTAMP | NOT NULL | Child's birth date (YYYY-MM-DD) |
| `parentId` | Integer | FOREIGN KEY | Links to Parent (cascade delete) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| `updatedAt` | TIMESTAMP | AUTO UPDATE | Last modification timestamp |

#### Relationships

- **Many-to-One** → `Parent` (each child belongs to exactly one parent)
  - Foreign key: `parentId` → `Parent.id`
  - Cascade delete: removing Parent removes all Children
  - Relationship name: `ParentToChildren`

- **One-to-One** → `Wallet?` (each child has exactly one wallet)
  - Relationship name: default (implicit)
  - Optional (`?`) because wallet may be created separately

#### Business Rules

- Username is globally unique (prevents impersonation)
- Age can be derived from `dateOfBirth` for engagement personalization
- Each child belongs to exactly one parent (enforced by foreign key)

#### Example Data

```
Child {
  id: 10,
  username: "amara-saver",
  dateOfBirth: "2015-03-21",
  parentId: 1,
  createdAt: "2024-02-01T09:15:00Z",
  updatedAt: "2024-02-01T09:15:00Z",
  parent: Parent { ... }, // Lazy-loaded
  wallet: Wallet { ... }  // Lazy-loaded
}
```

---

### 3. **Wallet Model**

Represents a Bitcoin wallet (balance container) for a Child.

#### Fields

| Field | Type | Constraint | Purpose |
|-------|------|-----------|---------|
| `id` | Integer (auto-increment) | PRIMARY KEY | Unique identifier |
| `balance` | BigInt | DEFAULT 0, CHECK >= 0 | Satoshi amount (1 BTC = 100M sats) |
| `childId` | Integer | UNIQUE FOREIGN KEY | Links to Child (one-to-one) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Wallet creation timestamp |
| `updatedAt` | TIMESTAMP | AUTO UPDATE | Last modification timestamp |

#### Relationships

- **One-to-One** → `Child` (each wallet belongs to exactly one child)
  - Foreign key: `childId` → `Child.id` (UNIQUE enforces one-to-one)
  - Cascade delete: removing Child removes Wallet

#### Business Rules

- **Balance Constraint**: Cannot be negative (enforced by `CHECK balance >= 0`)
- **Units**: Stored in satoshis (smallest Bitcoin unit)
- **Scale**: BigInt supports up to ~9.2 billion BTC (~920M satoshis per satoshi-level precision)
- One wallet per child (UNIQUE constraint on `childId`)

#### Example Data

```
Wallet {
  id: 100,
  balance: 500000,  // 500,000 satoshis (~0.005 BTC in Feb 2026)
  childId: 10,
  createdAt: "2024-02-01T09:16:00Z",
  updatedAt: "2024-02-05T14:22:00Z",
  child: Child { ... } // Lazy-loaded
}
```

---

## 🔗 Relationship Flow

### Visual Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ Parent (1)                                                   │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ id: 1                                                  │  │
│ │ fullName: "Charity Muigai"                             │  │
│ │ email: "charity@example.com"                           │  │
│ │ phoneNumber: "+254700000000"                           │  │
│ └────────────────────────────────────────────────────────┘  │
│   │                                                           │
│   │ One-to-Many (ParentToChildren)                           │
│   │ Cascade Delete: ✓                                        │
│   │                                                           │
│   ├─ Child (1..N)────────────────────────────────┐           │
│   │  ┌─────────────────────────────────────────┐ │           │
│   │  │ id: 10                                  │ │           │
│   │  │ username: "amara-saver"                 │ │           │
│   │  │ dateOfBirth: "2015-03-21"               │ │           │
│   │  │ parentId: 1 (FK)                        │ │           │
│   │  └─────────────────────────────────────────┘ │           │
│   │  │                                            │           │
│   │  │ One-to-One                                 │           │
│   │  │ Cascade Delete: ✓                         │           │
│   │  │                                            │           │
│   │  └─ Wallet (1)                               │           │
│   │     ┌─────────────────────────────────────┐  │           │
│   │     │ id: 100                             │  │           │
│   │     │ balance: 500000 (satoshis)          │  │           │
│   │     │ childId: 10 (FK, UNIQUE)            │  │           │
│   │     └─────────────────────────────────────┘  │           │
│   │                                               │           │
│   ├─ Child (2)────────────────────────────────┐  │           │
│   │  ┌─────────────────────────────────────┐  │  │           │
│   │  │ id: 11                              │  │  │           │
│   │  │ username: "liam-treasure"           │  │  │           │
│   │  │ dateOfBirth: "2018-07-15"           │  │  │           │
│   │  │ parentId: 1 (FK)                    │  │  │           │
│   │  └─────────────────────────────────────┘  │  │           │
│   │  │                                         │  │           │
│   │  └─ Wallet (1)                            │  │           │
│   │     ┌──────────────────────────────────┐  │  │           │
│   │     │ id: 101                          │  │  │           │
│   │     │ balance: 250000 (satoshis)       │  │  │           │
│   │     │ childId: 11 (FK, UNIQUE)         │  │  │           │
│   │     └──────────────────────────────────┘  │  │           │
│   │                                            │  │           │
│   └─ Child (3)────────────────────────────────┘  │           │
│      ┌─────────────────────────────────────┐     │           │
│      │ id: 12                              │     │           │
│      │ username: "zara-beginner"           │     │           │
│      │ dateOfBirth: "2020-11-02"           │     │           │
│      │ parentId: 1 (FK)                    │     │           │
│      └─────────────────────────────────────┘     │           │
│      │                                            │           │
│      └─ Wallet (1)                               │           │
│         ┌──────────────────────────────────┐     │           │
│         │ id: 102                          │     │           │
│         │ balance: 0 (satoshis)            │     │           │
│         │ childId: 12 (FK, UNIQUE)         │     │           │
│         └──────────────────────────────────┘     │           │
└──────────────────────────────────────────────────────────────┘
```

### Key Rules

1. **One Parent → Many Children** (One-to-Many)
   - A parent can have 0, 1, 2, or more children
   - Each child belongs to exactly one parent (enforced by foreign key)

2. **One Child → One Wallet** (One-to-One)
   - Each child has at most one wallet (optional `wallet?` field)
   - Each wallet belongs to exactly one child (UNIQUE constraint)

3. **Cascade Delete**
   - Deleting Parent → deletes all Children → deletes all Wallets
   - Deleting Child → deletes its Wallet
   - **Example**: If "Charity Muigai" (id=1) is deleted, children 10, 11, 12 and wallets 100, 101, 102 are all deleted

4. **Data Integrity**
   - Email uniqueness: prevents duplicate Parent accounts
   - Username uniqueness: prevents Child identity conflicts
   - Phone format: +254 country code + 7XX XXXXXX (9 digits)
   - Balance non-negative: satoshis cannot be negative

---

## 🔐 Security & Privacy

### Sensitive Fields

Fields that **must be excluded** from API responses:

| Model | Field | Reason |
|-------|-------|--------|
| `Parent` | `password` | Never expose hashes; can lead to brute force attacks |

### Validation Rules

**Email**:
- Format: valid email (RFC 5322)
- Constraint: UNIQUE (no duplicate registrations)
- Case-insensitive lookups (stored lowercase)

**Phone**:
- Format: `+2547XXXXXXXX` (Kenyan international format)
- Examples:
  - ✓ `+254700000000`
  - ✓ `+254712345678`
  - ✗ `0712345678` (missing country code)
  - ✗ `+254812345678` (wrong operator prefix)

**Password**:
- Minimum 8 characters
- Hashed with bcrypt (cost factor 10)
- Never stored in plain text

**Username**:
- Globally unique
- URL-safe (alphanumeric, hyphens, underscores)
- Examples: `amara-saver`, `liam_treasure`, `zara123`

**Balance**:
- Constraint: `balance >= 0`
- Unit: Satoshis (not Bitcoin)
- Type: BigInt (handles large amounts)

### Audit Trail

All models include timestamps for audit purposes:

- `createdAt`: When the record was created (immutable)
- `updatedAt`: When the record was last modified (auto-updated)

These can be queried to track account creation, balance changes, etc.

---

## 🗄️ Database Schema (SQL)

### Table Definitions

```sql
-- Parents table
CREATE TABLE parents (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Children table
CREATE TABLE children (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  date_of_birth TIMESTAMP NOT NULL,
  parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Wallets table
CREATE TABLE wallets (
  id SERIAL PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  child_id INTEGER UNIQUE NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_children_parent_id ON children(parent_id);
```

---

## 📋 Prisma Client Usage Examples

### Create a Parent with Children and Wallets

```javascript
const newParent = await prisma.parent.create({
  data: {
    fullName: "Charity Muigai",
    email: "charity@example.com",
    phoneNumber: "+254700000000",
    password: "$2b$10$...", // bcrypt hash
    children: {
      create: [
        {
          username: "amara-saver",
          dateOfBirth: new Date("2015-03-21"),
          wallet: {
            create: {
              balance: BigInt(500000), // 500,000 satoshis
            },
          },
        },
        {
          username: "liam-treasure",
          dateOfBirth: new Date("2018-07-15"),
          wallet: {
            create: {
              balance: BigInt(0),
            },
          },
        },
      ],
    },
  },
  include: {
    children: {
      include: {
        wallet: true,
      },
    },
  },
});
```

### Query Parent with All Children and Wallets

```javascript
const parent = await prisma.parent.findUnique({
  where: { id: 1 },
  include: {
    children: {
      include: {
        wallet: true,
      },
    },
  },
});

// Result:
// {
//   id: 1,
//   fullName: "Charity Muigai",
//   email: "charity@example.com",
//   children: [
//     {
//       id: 10,
//       username: "amara-saver",
//       wallet: { id: 100, balance: 500000n }
//     },
//     {
//       id: 11,
//       username: "liam-treasure",
//       wallet: { id: 101, balance: 250000n }
//     }
//   ]
// }
```

### Update Child's Wallet Balance

```javascript
const updatedWallet = await prisma.wallet.update({
  where: { childId: 10 },
  data: {
    balance: {
      increment: BigInt(50000), // Add 50,000 satoshis
    },
  },
});
```

### Delete Parent (Cascade)

```javascript
// This deletes Parent + all Children + all Wallets
const deleted = await prisma.parent.delete({
  where: { id: 1 },
});
```

---

## 🚀 Future Enhancements

### 1. **Transaction Model** (for audit trail)

Track all balance changes:

```prisma
model Transaction {
  id            Int       @id @default(autoincrement())
  type          String    // "deposit", "withdrawal", "transfer"
  amount        BigInt
  description   String?
  walletId      Int
  wallet        Wallet    @relation(fields: [walletId], references: [id])
  createdAt     DateTime  @default(now())
}
```

### 2. **Goal Model** (savings targets)

Track savings goals per child:

```prisma
model Goal {
  id            Int       @id @default(autoincrement())
  title         String
  targetAmount  BigInt
  currentAmount BigInt    @default(0)
  deadline      DateTime?
  childId       Int
  child         Child     @relation(fields: [childId], references: [id])
}
```

### 3. **Achievement Model** (gamification)

Track milestones:

```prisma
model Achievement {
  id       Int       @id @default(autoincrement())
  name     String    // "First Deposit", "1M Satoshis", etc.
  unlockedAt DateTime
  childId  Int
  child    Child     @relation(fields: [childId], references: [id])
}
```

### 4. **Notification Model** (alerts & reminders)

```prisma
model Notification {
  id       Int       @id @default(autoincrement())
  title    String
  message  String
  parentId Int
  parent   Parent    @relation(fields: [parentId], references: [id])
  readAt   DateTime?
  createdAt DateTime @default(now())
}
```

---

## 🧪 Testing & Validation

### Sample Test Data

```sql
-- Insert Parent
INSERT INTO parents (full_name, email, phone_number, password)
VALUES ('Charity Muigai', 'charity@example.com', '+254700000000', '$2b$10$...');

-- Insert Children
INSERT INTO children (username, date_of_birth, parent_id)
VALUES 
  ('amara-saver', '2015-03-21', 1),
  ('liam-treasure', '2018-07-15', 1),
  ('zara-beginner', '2020-11-02', 1);

-- Insert Wallets
INSERT INTO wallets (balance, child_id)
VALUES 
  (500000, 1),  -- amara: 500,000 satoshis
  (250000, 2),  -- liam: 250,000 satoshis
  (0, 3);       -- zara: just created
```

### Cascade Delete Test

```sql
-- Delete parent (should cascade to children and wallets)
DELETE FROM parents WHERE id = 1;

-- Verify cascade
SELECT * FROM children WHERE parent_id = 1;  -- Should return empty
SELECT * FROM wallets WHERE child_id IN (1, 2, 3);  -- Should return empty
```

---

## 📚 References

- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
- [Bitcoin Satoshis](https://en.wikipedia.org/wiki/Satoshi_(unit))
- [Kenyan Phone Format](https://en.wikipedia.org/wiki/Telephone_numbers_in_Kenya)

---

**Last Updated**: February 17, 2026  
**Maintained By**: SatsBlox Development Team
