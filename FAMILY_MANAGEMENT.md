# Family Management Module Documentation

**Module Name:** Family Management & Child Account System  
**Version:** 1.0  
**Status:** ✅ Complete  
**Created:** February 17, 2026  

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Endpoints](#api-endpoints)
4. [Security Model](#security-model)
5. [Data Flow](#data-flow)
6. [Implementation Details](#implementation-details)
7. [Testing Guide](#testing-guide)
8. [Error Handling](#error-handling)
9. [Future Enhancements](#future-enhancements)

---

## Overview

The Family Management module enables authenticated parents to:
- ✅ Create child accounts linked to their profile
- ✅ Automatically initialize Bitcoin wallets for each child
- ✅ List and retrieve their children's information
- ✅ Manage child account information securely

### Key Features

**Atomic Operations**
- Child and wallet are created together in a single transaction
- If wallet creation fails, the child account is automatically rolled back
- Guarantees no orphaned records in the database

**Security-First Design**
- Parent ID is extracted from JWT (never from request body)
- Parental ownership verified on every request
- Username global uniqueness enforced
- Age validation (children must be under 18)

**Data Consistency**
- One-to-One relationship between Child and Wallet
- Wallet balance initialized to 0 satoshis
- Ownership middleware prevents unauthorized access

---

## Architecture

### Folder Structure

```
src/
├── controllers/
│   ├── authController.js        # Auth endpoints (existing)
│   └── childController.js       # ✨ NEW: Child endpoints
├── routes/
│   ├── auth.js                  # Auth routes (existing)
│   └── childRoutes.js           # ✨ NEW: Family/child routes
├── middleware/
│   ├── authMiddleware.js        # JWT auth (existing)
│   ├── errorHandler.js          # Error handling (existing)
│   └── ownershipMiddleware.js   # ✨ NEW: Parental link verification
├── config/
│   ├── db.js                    # Prisma client (existing)
│   ├── env.js                   # Config validation (existing)
│   └── swagger.js               # API docs (existing)
├── services/                     # (Future: business logic layer)
└── utils/
    └── validators.js            # ✨ UPDATED: Child validators added
server.js                         # ✨ UPDATED: Routes mounted
```

### Request/Response Flow

```
HTTP Request with Bearer Token
    ↓
authMiddleware.authenticate
    ├─ Verify JWT signature
    ├─ Check expiration
    └─ Extract parentId → req.user
    ↓
ownershipMiddleware.verifyParentalLink (for reads/updates)
    ├─ Extract childId from request
    ├─ Query DB: verify childId belongs to parentId
    ├─ Return 404 if not owned (prevent info leak)
    └─ Attach child to req.child
    ↓
childController (handler)
    ├─ Access req.user (parent)
    ├─ Access req.child (if applicable)
    └─ Execute business logic
    ↓
↓ Re-throw error ↓
errorHandler middleware
    ├─ Format error response
    ├─ Set HTTP status
    └─ Send JSON response
    ↓
HTTP Response
```

### Middleware Dependency Order

**Important:** Middleware order matters! Always maintain this sequence:

1. **Express built-in**: `app.use(express.json())`
2. **Authentication**: `authMiddleware.authenticate` (verifies JWT)
3. **Authorization**: `ownershipMiddleware.verifyParentalLink` (verifies ownership)
4. **Controller handler** (business logic)
5. **Error handler**: Last middleware (catches all errors)

---

## API Endpoints

### 1. Create Child Account

**Endpoint:** `POST /api/family/children`  
**Authentication:** ✅ Required (Bearer token)  
**Authorization:** ✅ Own account only

#### Request

```javascript
// Headers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

// Body
{
  "username": "amara-savings",
  "dateOfBirth": "2015-03-21"
}
```

#### Response

**Success (201 Created)**
```javascript
{
  "message": "Child account created successfully",
  "child": {
    "id": 10,
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21T00:00:00.000Z",
    "parentId": 1,
    "createdAt": "2024-02-17T10:30:00.000Z"
  },
  "wallet": {
    "id": 100,
    "balance": "0",
    "childId": 10,
    "createdAt": "2024-02-17T10:30:00.000Z"
  }
}
```

**Validation Error (400 Bad Request)**
```javascript
{
  "message": "Child account validation failed",
  "errors": {
    "username": "Username must be at least 3 characters long",
    "dateOfBirth": "Date of birth must be in ISO format (YYYY-MM-DD)"
  }
}
```

**Username Conflict (409 Conflict)**
```javascript
{
  "message": "Username already taken. Please choose a different username.",
  "error": "USERNAME_EXISTS"
}
```

#### Validation Rules

| Field | Type | Rules |
|-------|------|-------|
| username | string | 3-100 chars, alphanumeric + hyphen/underscore, unique globally, lowercase |
| dateOfBirth | string | ISO format (YYYY-MM-DD), must be in past, under 18 years old |

#### Examples

```bash
# ✅ Valid request
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"liam-btc","dateOfBirth":"2018-07-15"}'

# ❌ Invalid: username too short
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"ab","dateOfBirth":"2015-03-21"}'

# ❌ Invalid: future date
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"future-child","dateOfBirth":"2026-12-31"}'
```

---

### 2. List My Children

**Endpoint:** `GET /api/family/children`  
**Authentication:** ✅ Required (Bearer token)  
**Authorization:** ✅ Own account only  
**Parameters:** None (returns authenticated parent's children)

#### Request

```javascript
// Headers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Response

**Success (200 OK)**
```javascript
{
  "message": "Children retrieved successfully",
  "count": 3,
  "children": [
    {
      "id": 10,
      "username": "amara-savings",
      "dateOfBirth": "2015-03-21T00:00:00.000Z",
      "parentId": 1,
      "createdAt": "2024-02-17T10:30:00.000Z"
    },
    {
      "id": 11,
      "username": "liam-btc",
      "dateOfBirth": "2018-07-15T00:00:00.000Z",
      "parentId": 1,
      "createdAt": "2024-02-17T10:35:00.000Z"
    }
  ]
}
```

**Empty List (200 OK)**
```javascript
{
  "message": "No children found",
  "count": 0,
  "children": []
}
```

#### Examples

```bash
curl -X GET http://localhost:3000/api/family/children \
  -H "Authorization: Bearer {token}"
```

---

### 3. Get Child Details

**Endpoint:** `GET /api/family/children/:childId`  
**Authentication:** ✅ Required (Bearer token)  
**Authorization:** ✅ Own account only (middleware verified)

#### Request

```javascript
// Headers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Path Parameters
:childId → 10 (numeric ID)
```

#### Response

**Success (200 OK)**
```javascript
{
  "message": "Child details retrieved successfully",
  "child": {
    "id": 10,
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21T00:00:00.000Z",
    "parentId": 1,
    "createdAt": "2024-02-17T10:30:00.000Z",
    "wallet": {
      "id": 100,
      "balance": "500000",
      "childId": 10,
      "createdAt": "2024-02-17T10:30:00.000Z",
      "updatedAt": "2024-02-17T11:45:00.000Z"
    }
  }
}
```

**Not Found (404 Not Found)**
```javascript
{
  "message": "Child not found"
}
```

Note: Returns 404 for both "child doesn't exist" and "child exists but doesn't belong to you" (prevents information disclosure).

#### Examples

```bash
# ✅ Get own child's details
curl -X GET http://localhost:3000/api/family/children/10 \
  -H "Authorization: Bearer {token}"

# ❌ Try to access another parent's child (returns 404)
curl -X GET http://localhost:3000/api/family/children/5 \
  -H "Authorization: Bearer {parent-2-token}"
# Response: 404 (whether child 5 exists or not, doesn't matter)
```

---

## Security Model

### Authentication Flow

```
Client                          Server
  │                               │
  ├─ POST /api/auth/login ────────→
  │                               ├─ Verify password
  │                               └─ Generate JWT
  ←──── {accessToken, ...} ────────┤
  │                               │
  ├─ GET /api/family/children ────→
  │  Header: Authorization: Bearer {token}
  │                               ├─ Verify JWT signature
  │                               ├─ Verify not expired
  │                               ├─ Extract parentId
  │                               └─ Attach to req.user
  │                               │
  ←─── {children[]} ──────────────┤
```

### Authorization Flow (Ownership Verification)

```
Client (Parent A)                Server
  │                               │
  ├─ GET /api/family/children/5 ──→
  │  Header: Bearer {parent-a-token}
  │                               ├─ Parse JWT → parentId = 1 (Parent A)
  │                               ├─ Extract from URL → childId = 5
  │                               ├─ Query: SELECT * FROM children WHERE id = 5
  │                               │
  │                               ├─ IF child.parentId == parentId (1):
  │                               │   ✅ Access granted
  │                               ├─ ELSE:
  │                               │   ❌ Return 404 (hide that child exists)
  │                               │
  ←─── {child with wallet} ───────┤
  
  Example: Parent B tries to access Parent A's child
  
  Client (Parent B)                Server
    │                               │
    ├─ GET /api/family/children/5 ──→
    │  Header: Bearer {parent-b-token}
    │                               ├─ Parse JWT → parentId = 2 (Parent B)
    │                               ├─ Extract from URL → childId = 5
    │                               ├─ Query: SELECT * FROM children WHERE id = 5
    │                               │  (child belongs to parentId = 1)
    │                               │
    │                               ├─ IF child.parentId (1) ≠ parentId (2):
    │                               │   ❌ Return 404 (don't leak that child exists)
    │                               │
    ←──── 404 Not Found ────────────┤
```

### JWT Claims & Validation

**Payload Structure:**
```javascript
{
  "id": 1,                    // Parent's database ID
  "email": "parent@example.com",
  "role": "PARENT",           // For RBAC (role-based access control)
  "iat": 1708080600,          // Issued at (timestamp)
  "exp": 1708080900           // Expires (timestamp, 7 min from iat)
}
```

**Token Validation Steps:**
1. ✅ Header exists: `Authorization: Bearer {token}`
2. ✅ Format valid: `Bearer ` prefix present
3. ✅ Signature valid: Matches `JWT_SECRET`
4. ✅ Not expired: `exp` > current timestamp
5. ✅ Payload valid: Contains `id`, `email`, `role`

**On Validation Failure:**
- 400 Bad Request: Missing or malformed header
- 401 Unauthorized: Invalid signature or expired

---

## Data Flow

### Complete Example: Create Child Account

**Scenario:** Parent with ID 1 creates a child account "amara-savings"

```
1. Client sends POST /api/family/children
   {
     "username": "amara-savings",
     "dateOfBirth": "2015-03-21"
   }
   Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

2. authMiddleware.authenticate
   ├─ Extract token from Authorization header
   ├─ Verify JWT signature with JWT_SECRET
   ├─ Check exp > now (not expired)
   ├─ Extract payload → {id: 1, email: "...", role: "PARENT"}
   └─ req.user = {id: 1, email: "...", role: "PARENT"}

3. childController.createChild
   ├─ Extract parentId = req.user.id = 1
   ├─ Validate username & dateOfBirth
   │  └─ validateCreateChildData()
   │     ├─ username: "amara-savings" ✅ 3-100 chars, valid chars
   │     └─ dateOfBirth: "2015-03-21" ✅ valid ISO, under 18
   │
   ├─ START PRISMA TRANSACTION
   │  ├─ CREATE child:
   │  │  INSERT INTO children (username, dateOfBirth, parentId)
   │  │  VALUES ('amara-savings', '2015-03-21', 1)
   │  │  RETURNING id, username, dateOfBirth, parentId, createdAt
   │  │  └─ Result: {id: 10, username: 'amara-savings', ...}
   │  │
   │  └─ CREATE wallet:
   │     INSERT INTO wallets (childId, balance)
   │     VALUES (10, 0)
   │     RETURNING id, balance, childId, createdAt
   │     └─ Result: {id: 100, balance: 0n, childId: 10, ...}
   │
   ├─ COMMIT TRANSACTION (both succeed)
   │  ├─ Database now contains:
   │  │  children: {id: 10, username: 'amara-savings', parentId: 1, ...}
   │  │  wallets: {id: 100, childId: 10, balance: 0n, ...}
   │  │
   │  └─ ONE-TO-ONE relationship established
   │
   └─ RETURN response:
      {
        "message": "Child account created successfully",
        "child": {id: 10, username: 'amara-savings', ...},
        "wallet": {id: 100, balance: "0", ...}
      }

4. HTTP 201 Created
   └─ Client displays success message and shows new child in UI
```

**Transaction Failure Scenario:**
```
If wallet creation FAILS (e.g., duplicate childId - shouldn't happen):

1. SQL: INSERT INTO wallets (...) values (...)
   → Error: UNIQUE constraint on (childId)
   
2. Prisma detects error within transaction
   
3. AUTOMATIC ROLLBACK:
   ├─ Undo: INSERT INTO children ... (rolled back)
   └─ Undo: INSERT INTO wallets ... (failed)
   
4. Result in database: No child, no wallet (clean state)
   
5. Return error to client: 500 Internal Server Error
```

---

## Implementation Details

### File-by-File Breakdown

#### 1. `src/utils/validators.js` (UPDATED)

**New Functions Added:**

```javascript
validateChildUsername(username)
  // Validates child username (3-100 chars, unique, proper chars)
  // Returns: {isValid: boolean, error?: string}

validateChildDateOfBirth(dateOfBirth)
  // Validates date of birth (ISO format, under 18, not future)
  // Returns: {isValid: boolean, error?: string}

validateCreateChildData(data)
  // Composite validator for POST /api/family/children
  // Returns: {isValid: boolean, errors: {field: message}}
```

**Example:**
```javascript
const validators = require('../utils/validators');

const validation = validators.validateCreateChildData({
  username: "amara",        // Error: too short
  dateOfBirth: "2026-01-01" // Error: future date
});

// Result:
{
  isValid: false,
  errors: {
    username: "Username must be at least 3 characters long",
    dateOfBirth: "Child cannot have a future date of birth"
  }
}
```

#### 2. `src/middleware/ownershipMiddleware.js` (NEW)

**Purpose:** Verify that a child belongs to the authenticated parent

**Key Functions:**

```javascript
verifyParentalLink(paramName = 'childId')
  // Middleware factory: creates middleware with configurable parameter name
  // Flow:
  //   1. Extract childId from req.params[paramName]
  //   2. Get parentId from req.user.id (from authMiddleware)
  //   3. Query DB: SELECT * FROM children WHERE id = childId
  //   4. Verify child.parentId == parentId
  //   5. If valid: req.child = child, call next()
  //   6. If invalid: return 404
  // Returns: middleware function

verifyParentalLinkMiddleware
  // Pre-configured middleware (always uses 'childId' parameter)
```

**Usage:**
```javascript
// In routes
router.get(
  '/:childId',
  authMiddleware.authenticate,
  verifyParentalLink('childId'),  // or verifyParentalLinkMiddleware
  childController.getChild
);
```

**Error Handling:**
```javascript
// 400 Bad Request - missing/invalid parameter
if (!childId) {
  return res.status(400).json({message: "Missing required parameter: childId"});
}

// 404 Not Found - child not found
if (!child) {
  return res.status(404).json({message: "Child not found"});
}

// 404 Not Found - child exists but not owned
if (child.parentId !== parentId) {
  return res.status(404).json({message: "Child not found"}); // Hide ownership
}

// 500 Server Error - database error
if (err) {
  return res.status(500).json({message: "Failed to verify child ownership"});
}
```

#### 3. `src/controllers/childController.js` (NEW)

**Exports:**

```javascript
createChild(req, res)
  // POST /api/family/children
  // Atomically creates child + wallet
  // Validates input, checks uniqueness, handles conflicts

listMyChildren(req, res)
  // GET /api/family/children
  // Returns all children for authenticated parent
  // Sorted by creation date

getChild(req, res)
  // GET /api/family/children/:childId
  // Ownership verified by middleware
  // Returns child with wallet details
```

**Key Implementation Detail - Atomic Transaction:**

```javascript
const { child, wallet } = await prisma.$transaction(async (tx) => {
  // Step 1: Create child
  const newChild = await tx.child.create({
    data: {
      username: username.toLowerCase().trim(),
      dateOfBirth: new Date(dateOfBirth),
      parentId: parentId
    }
  });

  // Step 2: Create wallet (using childId from step 1)
  const newWallet = await tx.wallet.create({
    data: {
      childId: newChild.id,
      balance: 0n  // BigInt for precision
    }
  });

  return { child: newChild, wallet: newWallet };
});

// If any step fails: ENTIRE transaction is rolled back
// Result: Either both succeed or both fail (no orphaned records)
```

#### 4. `src/routes/childRoutes.js` (NEW)

**Routes Defined:**

```javascript
POST /
  // Create child
  // Middleware: authenticate
  // Handler: childController.createChild

GET /
  // List my children
  // Middleware: authenticate
  // Handler: childController.listMyChildren

GET /:childId
  // Get child details
  // Middleware: authenticate → verifyParentalLink('childId')
  // Handler: childController.getChild
```

**Mounted in `src/server.js`:**
```javascript
app.use('/api/family/children', childRoutes);

// Routes become:
// POST /api/family/children
// GET /api/family/children
// GET /api/family/children/:childId
```

#### 5. `src/server.js` (UPDATED)

```javascript
// Added import:
const childRoutes = require('./routes/childRoutes');

// Added mount:
app.use('/api/family/children', childRoutes);
```

---

## Testing Guide

### Prerequisites

```bash
# 1. Start database
docker compose up -d

# 2. Apply migrations
npx prisma migrate deploy

# 3. Start server
npm start

# 4. Get auth token (register/login)
# See below for examples
```

### Test Cases

#### Test 1: Register Parent (for token)

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePass123!",
    "phoneNumber": "+254700000000"
  }'

# Response:
{
  "message": "Parent registered successfully",
  "parent": {...},
  "accessToken": "eyJhbGciOiJIUzI1...",
  "refreshToken": "eyJhbGciOiJIUzI1..."
}

# Save accessToken for subsequent tests
TOKEN="eyJhbGciOiJIUzI1..."
```

#### Test 2: Create Child (Success)

```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21"
  }'

# Expected: 201 Created
{
  "message": "Child account created successfully",
  "child": {
    "id": 1,
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21T00:00:00.000Z",
    "parentId": 1,
    "createdAt": "2024-02-17T..."
  },
  "wallet": {
    "id": 1,
    "balance": "0",
    "childId": 1,
    "createdAt": "2024-02-17T..."
  }
}
```

#### Test 3: Create Child (Username Too Short)

```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ab",
    "dateOfBirth": "2015-03-21"
  }'

# Expected: 400 Bad Request
{
  "message": "Child account validation failed",
  "errors": {
    "username": "Username must be at least 3 characters long"
  }
}
```

#### Test 4: Create Child (Username Already Exists)

```bash
# First child created (from Test 2)
# Try to create another with same username

curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "amara-savings",
    "dateOfBirth": "2016-05-10"
  }'

# Expected: 409 Conflict
{
  "message": "Username already taken. Please choose a different username.",
  "error": "USERNAME_EXISTS"
}
```

#### Test 5: Create Child (Future Date)

```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "future-child",
    "dateOfBirth": "2026-12-31"
  }'

# Expected: 400 Bad Request
{
  "message": "Child account validation failed",
  "errors": {
    "dateOfBirth": "Child cannot have a future date of birth"
  }
}
```

#### Test 6: List My Children

```bash
curl -X GET http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK
{
  "message": "Children retrieved successfully",
  "count": 1,
  "children": [
    {
      "id": 1,
      "username": "amara-savings",
      "dateOfBirth": "2015-03-21T00:00:00.000Z",
      "parentId": 1,
      "createdAt": "2024-02-17T..."
    }
  ]
}
```

#### Test 7: Get Child Details

```bash
curl -X GET http://localhost:3000/api/family/children/1 \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK
{
  "message": "Child details retrieved successfully",
  "child": {
    "id": 1,
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21T00:00:00.000Z",
    "parentId": 1,
    "createdAt": "2024-02-17T...",
    "wallet": {
      "id": 1,
      "balance": "0",
      "childId": 1,
      "createdAt": "2024-02-17T...",
      "updatedAt": "2024-02-17T..."
    }
  }
}
```

#### Test 8: Unauthorized Access (No Token)

```bash
curl -X GET http://localhost:3000/api/family/children

# Expected: 400 Bad Request
{
  "message": "Authorization header is required"
}
```

#### Test 9: Unauthorized Access (Invalid Token)

```bash
curl -X GET http://localhost:3000/api/family/children \
  -H "Authorization: Bearer invalid.token.here"

# Expected: 401 Unauthorized
{
  "message": "Invalid token"
}
```

#### Test 10: Ownership Verification (Cross-Parent)

```bash
# Create second parent (with different token)
TOKEN2="..."

# Try to access first parent's child with second parent's token
curl -X GET http://localhost:3000/api/family/children/1 \
  -H "Authorization: Bearer $TOKEN2"

# Expected: 404 Not Found (doesn't leak that child exists)
{
  "message": "Child not found"
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 201 | Created | Child + wallet successfully created |
| 200 | OK | Successfully retrieved data |
| 400 | Bad Request | Validation error, missing param, malformed input |
| 401 | Unauthorized | Missing/invalid token, token expired |
| 404 | Not Found | Child doesn't exist OR not owned (same response) |
| 409 | Conflict | Username already taken (unique constraint) |
| 500 | Server Error | Database error, unexpected failure |

### Error Response Format

**Validation Error (400):**
```javascript
{
  "message": "Child account validation failed",
  "errors": {
    "username": "Username must be at least 3 characters long",
    "dateOfBirth": "Date of birth must be in ISO format (YYYY-MM-DD)"
  }
}
```

**Conflict Error (409):**
```javascript
{
  "message": "Username already taken. Please choose a different username.",
  "error": "USERNAME_EXISTS"
}
```

**Not Found Error (404):**
```javascript
{
  "message": "Child not found"
}
```

**Server Error (500):**
```javascript
{
  "message": "Failed to create child account. Please try again later."
}
```

### Error Logging

All errors are logged to the console with context:

```javascript
// Validation error
[CHILD] Create validation failed: {
  username: "...",
  dateOfBirth: "..."
}

// Conflict
[CHILD] Username already exists: error message

// Database error
[CHILD] Create child error: error message, stack trace
```

---

## Future Enhancements

### Short Term (Priority: HIGH)

1. **Child Update Endpoint**
   - `PATCH /api/family/children/:childId`
   - Allow parent to update child details (username, date of birth)
   - Require parental verification

2. **Child Delete Endpoint**
   - `DELETE /api/family/children/:childId`
   - Cascade delete child and wallet
   - Require parental confirmation (email/SMS verification)

3. **Wallet Operations**
   - `GET /api/family/children/:childId/wallet`
   - Separate wallet endpoints for deposits/withdrawals
   - Transaction history

### Medium Term (Priority: MEDIUM)

4. **Pagination & Filtering**
   ```
   GET /api/family/children?page=1&limit=10&sort=createdAt
   GET /api/family/children?ageRange=5-12&active=true
   ```

5. **Wallet Summary**
   ```
   GET /api/family/children?includeWallet=true
   Returns children with wallet balance in single query
   ```

6. **Savings Goals**
   - Create savings goals for children
   - Track progress toward goals
   - Gamification/rewards system

7. **Activity Feed**
   - Track all actions (creation, updates, wallet changes)
   - Audit trail for security
   - Parent notifications

### Long Term (Priority: LOW)

8. **Multi-Level Authorization**
   - Different roles: Parent, Guardian, Child (read-only?)
   - Role-based access control (RBAC)
   - Invitation system for guardians

9. **Advanced Analytics**
   - Savings trends
   - Family savings goals
   - Bitcoin price correlation

10. **Mobile App Integration**
    - Push notifications for milestones
    - Biometric authentication
    - Offline sync

---

## Performance Considerations

### Database Indexes

The Prisma schema includes:

```
-- Automatically created by Prisma
- PRIMARY KEY: children(id)
- UNIQUE: children(username)  ← Prevents duplicate usernames
- FOREIGN KEY: children(parentId) → parents(id)

-- Could be added for large datasets
- INDEX: children(parentId)  ← Fast queries for "list my children"
```

### Query Performance

**Current Implementation:**
```javascript
// Linear O(n) - fine for typical family size (5-20 children)
const children = await prisma.child.findMany({
  where: { parentId: 1 }
});

// O(1) lookup by ID
const child = await prisma.child.findUnique({
  where: { id: 1 }
});

// Unique username check
const existing = await prisma.child.findUnique({
  where: { username: "amara-savings" }
});
```

**For Scaling (10M+ children):**
- Add index: `CREATE INDEX idx_child_parent ON children(parentId)`
- Implement pagination: `SELECT * FROM children WHERE parentId = 1 LIMIT 10 OFFSET 0`
- Consider caching parent's children list (Redis)

---

## Security & Compliance

### Data Privacy

- ✅ Children's data only visible to their parent
- ✅ Wallet balance (financial data) highly sensitive
- ✅ Birthday information not leaked to strangers
- ⚠️ Future: Parental consent for child data collection (COPPA compliance)

### Authentication & Authorization

- ✅ JWT-based auth with 7-minute expiration
- ✅ Parent ID from token (not request) prevents spoofing
- ✅ Ownership verification on sensitive reads
- ✅ Rate limiting (from auth module) prevents brute force

### SQL Injection Prevention

- ✅ Prisma ORM prevents injection attacks
- ✅ No raw SQL queries used
- ✅ Parameters always sanitized

---

## Troubleshooting

### Issue: "Child not found" when creating child

**Cause:** Parent account not found or deleted  
**Solution:** Re-authenticate (token refers to deleted account)

### Issue: "Username already taken" for new username

**Cause:** Username already in use globally  
**Solution:** Try a different username

### Issue: 401 Unauthorized on valid token

**Cause:** Token expired (7-minute limit)  
**Solution:** Use refresh endpoint to get new token

### Issue: 404 on GET /api/family/children/:childId

**Cause:** 
- Child doesn't exist, OR
- Child belongs to different parent

**Solution:** Verify childId is correct and belongs to authenticated parent

---

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
- [JSON Web Tokens (JWT)](https://jwt.io/)
- [REST API Best Practices](https://restfulapi.net/)
- [OWASP: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)

---

**Document Version:** 1.0  
**Last Updated:** February 17, 2026  
**Author:** GitHub Copilot  
**Status:** Complete and tested
