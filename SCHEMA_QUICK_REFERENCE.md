# SatsBlox Schema Quick Reference

## Data Model at a Glance

```
Parent (1) ──┬──→ Child (N) ──→ Wallet (1)
             │
             └──→ Child (N) ──→ Wallet (1)
             │
             └──→ Child (N) ──→ Wallet (1)

Cascade Delete: Parent ✗ → Children ✗ → Wallets ✗
```

---

## Models & Fields

### Parent

| Field | Type | Notes |
|-------|------|-------|
| `id` | Integer | Primary key (auto-increment) |
| `fullName` | String(255) | Legal name |
| `email` | String(255) | **UNIQUE**, case-insensitive |
| `phoneNumber` | String(20) | Format: `+2547XXXXXXXX` |
| `password` | String(255) | Bcrypt hash **[SENSITIVE]** |
| `createdAt` | DateTime | Account creation |
| `updatedAt` | DateTime | Last modified |

### Child

| Field | Type | Notes |
|-------|------|-------|
| `id` | Integer | Primary key (auto-increment) |
| `username` | String(100) | **UNIQUE** globally |
| `dateOfBirth` | DateTime | YYYY-MM-DD |
| `parentId` | Integer | FK → Parent (CASCADE DELETE) |
| `createdAt` | DateTime | Account creation |
| `updatedAt` | DateTime | Last modified |

### Wallet

| Field | Type | Notes |
|-------|------|-------|
| `id` | Integer | Primary key (auto-increment) |
| `balance` | BigInt | Satoshis, default 0, **>= 0** |
| `childId` | Integer | FK → Child (CASCADE DELETE, **UNIQUE**) |
| `createdAt` | DateTime | Wallet creation |
| `updatedAt` | DateTime | Last modified |

---

## Relationships

### One-to-Many: Parent → Children

```javascript
// Create parent with children
const parent = await prisma.parent.create({
  data: {
    fullName: "Charity",
    email: "charity@example.com",
    phoneNumber: "+254700000000",
    password: "$2b$10$...",
    children: {
      create: [
        { username: "amara", dateOfBirth: "2015-03-21" },
        { username: "liam", dateOfBirth: "2018-07-15" }
      ]
    }
  }
});

// Query: Get parent with all children
const parent = await prisma.parent.findUnique({
  where: { id: 1 },
  include: { children: true }
});
```

### One-to-One: Child → Wallet

```javascript
// Create child with wallet
const child = await prisma.child.create({
  data: {
    username: "amara",
    dateOfBirth: "2015-03-21",
    parentId: 1,
    wallet: {
      create: { balance: BigInt(500000) }
    }
  },
  include: { wallet: true }
});

// Query: Get child with wallet
const child = await prisma.child.findUnique({
  where: { id: 10 },
  include: { wallet: true }
});
```

---

## Constraints & Validation

| Constraint | Type | Enforced | Purpose |
|-----------|------|----------|---------|
| `Parent.email` UNIQUE | DB + App | ✓ Duplicate email check |
| `Child.username` UNIQUE | DB | ✓ Prevent identity conflicts |
| `Wallet.balance >= 0` | DB CHECK | ✓ No negative satoshis |
| `Child.parentId` FK | DB | ✓ Parent ownership |
| `Wallet.childId` FK UNIQUE | DB | ✓ One wallet per child |
| Cascade Delete | DB | ✓ Remove orphans |

---

## Common Queries

### Find Parent by Email
```javascript
const parent = await prisma.parent.findUnique({
  where: { email: "charity@example.com" }
});
```

### Get All Children of a Parent
```javascript
const children = await prisma.child.findMany({
  where: { parentId: 1 },
  include: { wallet: true }
});
```

### Update Child's Wallet Balance
```javascript
await prisma.wallet.update({
  where: { childId: 10 },
  data: {
    balance: { increment: BigInt(50000) }  // Add satoshis
  }
});
```

### Delete Parent (Cascades to Children & Wallets)
```javascript
await prisma.parent.delete({
  where: { id: 1 }
});
```

---

## Satoshi Reference

| Unit | Amount |
|------|--------|
| 1 Satoshi | 1 sat |
| 1,000 Satoshis | 0.00001 BTC |
| 100,000,000 Satoshis | 1 BTC |

**Examples**:
- 500,000 satoshis ≈ 0.005 BTC
- 250,000 satoshis ≈ 0.0025 BTC
- 10,000,000 satoshis ≈ 0.1 BTC

---

## Field Validation Rules

### Phone Number
- Format: `+2547XXXXXXXX`
- Examples:
  - ✓ `+254700000000`
  - ✓ `+254712345678`
  - ✗ `0712345678`
  - ✗ `+254812345678`

### Username
- Unique globally (prevents conflicts)
- URL-safe characters
- Examples: `amara-saver`, `liam_treasure`, `zara123`

### Password
- Minimum 8 characters
- Bcrypt hashed (never plain text)
- Cost factor: 10

### Email
- Valid email format (RFC 5322)
- Unique (no duplicates)
- Stored in lowercase

---

## Error Scenarios

### Cascade Delete
```
DELETE Parent (id=1)
  → Children with parentId=1 deleted
    → Wallets with childId from those children deleted
```

### Balance Violation
```
UPDATE wallets SET balance = -100 WHERE id = 1
→ ERROR: new row violates check constraint "balance >= 0"
```

### Duplicate Email
```
INSERT INTO parents (..., email='charity@example.com')
→ ERROR: duplicate key value violates unique constraint
```

### Foreign Key Violation
```
INSERT INTO children (..., parentId=999)
→ ERROR: insert or update on table violates foreign key
```

---

## Audit Trail

All models track timestamps:

```javascript
// Created: 2024-02-01T09:15:00Z
// Last updated: 2024-02-05T14:22:00Z

const parent = await prisma.parent.findUnique({
  where: { id: 1 }
});
// parent.createdAt → "2024-02-01T09:15:00Z"
// parent.updatedAt → "2024-02-05T14:22:00Z"
```

---

## Security Reminders

🔒 **Never expose**:
- `Parent.password` (hash only)

🔒 **Validate before storage**:
- Email format & uniqueness
- Phone format (Kenyan: `+2547XXXXXXXX`)
- Password strength (min 8 chars)
- Username availability (UNIQUE)

🔒 **Always use**:
- Prepared queries (Prisma does this)
- HTTPS/TLS in production
- JWT for authentication
- Rate limiting on sensitive endpoints

---

## Future Enhancements

```javascript
// Transactions (audit trail)
model Transaction {
  id, type, amount, walletId, createdAt
}

// Goals (savings targets)
model Goal {
  id, title, targetAmount, deadline, childId
}

// Achievements (gamification)
model Achievement {
  id, name, unlockedAt, childId
}

// Notifications (alerts)
model Notification {
  id, title, message, parentId, readAt
}
```

---

## File References

- **Full Documentation**: [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md)
- **Schema Definition**: [prisma/schema.prisma](./prisma/schema.prisma)
- **Migration SQL**: [prisma/migrations/](./prisma/migrations/)
- **API Guide**: [README.md](./README.md)

---

**Quick Links**:
- Prisma Docs: https://www.prisma.io/docs/
- PostgreSQL Docs: https://www.postgresql.org/docs/
- SatsBlox Schema: [SCHEMA_DOCUMENTATION.md](./SCHEMA_DOCUMENTATION.md)

Last Updated: February 17, 2026
