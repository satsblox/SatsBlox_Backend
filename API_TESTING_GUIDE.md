# SatsBlox API Testing Guide - Complete Workflow

This guide walks through real-world scenarios for testing all implemented endpoints.

---

## Test Scenario: Complete Family Setup

### Prerequisites
```bash
# Start server
npm start

# Server running on: http://localhost:3000
# Swagger docs: http://localhost:3000/api-docs
```

---

## Phase 1: Parent Registration & Login

### Test 1.1: Register Parent Account
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

**Expected Response** (201 Created):
```json
{
  "message": "Parent registered successfully",
  "parent": {
    "id": 1,
    "email": "charity@example.com",
    "fullName": "Charity Muigai",
    "phoneNumber": "+254700000000",
    "createdAt": "2024-02-17T10:30:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Verify:**
- [ ] Status 201 (Created)
- [ ] accessToken and refreshToken returned
- [ ] phoneNumber decrypted in response (readable format)
- [ ] Parent ID assigned (should be 1 for first user)
- [ ] Save tokens for next tests

### Test 1.2: Login Parent Account
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "SecurePassword123"
  }'
```

**Expected Response** (200 OK):
```json
{
  "message": "Login successful",
  "parent": {
    "id": 1,
    "email": "charity@example.com",
    "fullName": "Charity Muigai",
    "phoneNumber": "+254700000000",
    "createdAt": "2024-02-17T10:30:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Verify:**
- [ ] Status 200 (OK)
- [ ] New tokens generated
- [ ] phoneNumber decrypted
- [ ] Save new accessToken for next tests

---

## Phase 2: Create Child Accounts

### Test 2.1: Create First Child (Atomic Transaction Test)
```bash
# Use accessToken from login response
TOKEN="<accessToken_from_login>"

curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21"
  }'
```

**Expected Response** (201 Created):
```json
{
  "message": "Child account created successfully",
  "child": {
    "id": 10,
    "username": "amara-savings",
    "dateOfBirth": "2015-03-21T00:00:00.000Z",
    "avatar": null,
    "colorTheme": null,
    "parentId": 1,
    "isActive": true,
    "createdAt": "2024-02-17T10:30:00.000Z"
  },
  "wallet": {
    "id": 100,
    "balance": "0",
    "childId": 10,
    "createdAt": "2024-02-17T10:30:00.000Z",
    "updatedAt": "2024-02-17T10:30:00.000Z"
  }
}
```

**Verify:**
- [ ] Status 201 (Created)
- [ ] Child record created with correct parentId (1)
- [ ] Child ID assigned (should be 10 for first child)
- [ ] Wallet auto-created with childId matching child ID
- [ ] Wallet balance initialized to "0" (string format for precision)
- [ ] Both resources have createdAt timestamp
- [ ] Save childId for next tests

**Atomic Transaction Verification:**
- [ ] Check database: Child record exists
  ```sql
  SELECT * FROM "Child" WHERE id = 10;
  -- Should show: id=10, username='amara-savings', parentId=1, isActive=true
  ```
- [ ] Check database: Wallet record exists
  ```sql
  SELECT * FROM "Wallet" WHERE childId = 10;
  -- Should show: balance=0, childId=10
  ```

### Test 2.2: Create Second Child
```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "james-growth",
    "dateOfBirth": "2017-08-15"
  }'
```

**Expected Response** (201 Created):
```json
{
  "message": "Child account created successfully",
  "child": {
    "id": 11,
    "username": "james-growth",
    ...
  },
  "wallet": {
    "id": 101,
    "balance": "0",
    "childId": 11,
    ...
  }
}
```

**Verify:**
- [ ] Second child created successfully
- [ ] Child ID = 11 (auto-incremented)
- [ ] Wallet ID = 101 (auto-incremented)
- [ ] Balance = "0" for new wallet

### Test 2.3: Duplicate Username Rejection
```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "amara-savings",
    "dateOfBirth": "2018-06-12"
  }'
```

**Expected Response** (409 Conflict):
```json
{
  "message": "Username already taken. Please choose a different username.",
  "error": "USERNAME_EXISTS"
}
```

**Verify:**
- [ ] Status 409 (Conflict)
- [ ] Error code: USERNAME_EXISTS
- [ ] Message indicates duplicate username

### Test 2.4: Invalid Input Validation
```bash
curl -X POST http://localhost:3000/api/family/children \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ab",
    "dateOfBirth": "2025-01-01"
  }'
```

**Expected Response** (400 Bad Request):
```json
{
  "message": "Child account validation failed",
  "errors": {
    "username": "Username must be at least 3 characters long",
    "dateOfBirth": "Child must be at least 1 year old"
  }
}
```

**Verify:**
- [ ] Status 400 (Bad Request)
- [ ] Specific validation errors returned
- [ ] Both username and age validations working

---

## Phase 3: Family Dashboard

### Test 3.1: Get Family Dashboard (Aggregation Test)
```bash
curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (200 OK):
```json
{
  "message": "Dashboard retrieved successfully",
  "parent": {
    "id": 1,
    "email": "charity@example.com",
    "fullName": "Charity Muigai",
    "createdAt": "2024-02-17T10:30:00.000Z"
  },
  "summary": {
    "totalChildren": 2,
    "activeChildren": 2,
    "totalSatoshis": "0",
    "averageBalance": "0"
  },
  "children": [
    {
      "id": 10,
      "username": "amara-savings",
      "dateOfBirth": "2015-03-21T00:00:00.000Z",
      "avatar": null,
      "colorTheme": null,
      "createdAt": "2024-02-17T10:30:00.000Z",
      "wallet": {
        "id": 100,
        "balance": "0",
        "createdAt": "2024-02-17T10:30:00.000Z",
        "updatedAt": "2024-02-17T10:30:00.000Z"
      }
    },
    {
      "id": 11,
      "username": "james-growth",
      "dateOfBirth": "2017-08-15T00:00:00.000Z",
      "avatar": null,
      "colorTheme": null,
      "createdAt": "2024-02-17T10:30:00.000Z",
      "wallet": {
        "id": 101,
        "balance": "0",
        "createdAt": "2024-02-17T10:30:00.000Z",
        "updatedAt": "2024-02-17T10:30:00.000Z"
      }
    }
  ]
}
```

**Verify:**
- [ ] Status 200 (OK)
- [ ] Parent data included
- [ ] Summary stats calculated:
  - [ ] totalChildren = 2
  - [ ] activeChildren = 2
  - [ ] totalSatoshis = "0" (sum of all wallets)
  - [ ] averageBalance = "0" (total / count)
- [ ] Both children listed in array
- [ ] Each child has wallet with balance
- [ ] Wallet balance is string (preserves precision)
- [ ] No soft-deleted children in response

**Performance Verification:**
```bash
# This should be a single database query (no N+1 problem)
# Verify in server logs: Should see single SELECT with JOIN
```

---

## Phase 4: Access Control & Security Tests

### Test 4.1: Unauthorized Access (No Token)
```bash
curl -X GET http://localhost:3000/api/family/dashboard
```

**Expected Response** (401 Unauthorized):
```json
{
  "message": "Unauthorized. No token provided."
}
```

**Verify:**
- [ ] Status 401 (Unauthorized)
- [ ] Request rejected without token

### Test 4.2: Invalid Token
```bash
curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer invalid.token.here"
```

**Expected Response** (401 Unauthorized):
```json
{
  "message": "Invalid or expired token"
}
```

**Verify:**
- [ ] Status 401 (Unauthorized)
- [ ] Invalid token rejected

### Test 4.3: Expired Token
```bash
# Use token that has expired
EXPIRED_TOKEN="<token_from_hours_ago>"

curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer $EXPIRED_TOKEN"
```

**Expected Response** (401 Unauthorized):
```json
{
  "message": "Invalid or expired token"
}
```

**Verify:**
- [ ] Status 401
- [ ] Expired token rejected
- [ ] User needs to refresh or re-login

### Test 4.4: RBAC Protection (Non-PARENT Role)
```bash
# Manual test: Create JWT with role='GUEST' instead of role='PARENT'
# (Requires signing JWT with test key)

curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer <guest_token>"
```

**Expected Response** (403 Forbidden):
```json
{
  "message": "Forbidden"
}
```

**Verify:**
- [ ] Status 403 (Forbidden)
- [ ] Non-PARENT roles blocked
- [ ] Generic error message (no role leakage)

### Test 4.5: Ownership Verification (Cross-Family Access)
```bash
# Scenario: Parent B tries to access Parent A's child
# Use Parent B's token + Parent A's childId

PARENT_B_TOKEN="<parent_b_token>"
PARENT_A_CHILD_ID=10

curl -X GET http://localhost:3000/api/family/children/$PARENT_A_CHILD_ID \
  -H "Authorization: Bearer $PARENT_B_TOKEN"
```

**Expected Response** (404 Not Found):
```json
{
  "message": "Child not found"
}
```

**Verify:**
- [ ] Status 404 (Not Found)
- [ ] Parent B cannot see Parent A's children
- [ ] No disclosure that child exists (information hiding)
- [ ] Same 404 response as "child doesn't exist" (can't enumerate)

---

## Phase 5: Rate Limiting & Brute-Force Protection

### Test 5.1: Successful Login (Reset Counter)
```bash
# Before any failed attempts
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "SecurePassword123"
  }'
```

**Expected Response** (200 OK):
- [ ] Tokens returned
- [ ] failedLoginAttempts counter reset to 0 (in database)

### Test 5.2: Failed Login Attempt #1-4
```bash
# Attempt 1: Wrong password
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "WrongPassword"
  }'
```

**Expected Response** (401 Unauthorized):
- [ ] Status 401
- [ ] Message: "Invalid credentials"
- [ ] failedLoginAttempts = 1 (in database)

Repeat attempts 2-4...

**Verify:**
- [ ] Each failed attempt increments counter
- [ ] Attempts 1-4 return 401 (Unauthorized)

### Test 5.3: Fifth Failed Attempt (Account Lock Triggers)
```bash
# Attempt 5: Wrong password again
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "WrongPassword"
  }'
```

**Expected Response** (401 Unauthorized):
```json
{
  "message": "Invalid credentials"
}
```

**Verify:**
- [ ] Status 401
- [ ] failedLoginAttempts = 5 (in database)
- [ ] lockedUntil = now + 15 minutes (in database)

### Test 5.4: Sixth Attempt (Rate Limited)
```bash
# Attempt 6: Right after account locked
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "SecurePassword123"
  }'
```

**Expected Response** (429 Too Many Requests):
```json
{
  "message": "Account temporarily locked due to too many failed login attempts. Please try again later."
}
```

**Verify:**
- [ ] Status 429 (Too Many Requests)
- [ ] Even with correct password, account locked
- [ ] lockout message shown
- [ ] Headers include Retry-After

**Database Check:**
```sql
SELECT failedLoginAttempts, lockedUntil FROM "Parent" WHERE id = 1;
-- Should show: failedLoginAttempts=5, lockedUntil=<future timestamp>
```

### Test 5.5: Auto-Unlock After 15 Minutes
```bash
# Simulate 15+ minutes passing
-- In database: UPDATE "Parent" SET lockedUntil = now - interval '1 minute' WHERE id = 1

# Then try login again
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charity@example.com",
    "password": "SecurePassword123"
  }'
```

**Expected Response** (200 OK):
```json
{
  "message": "Login successful",
  ...
}
```

**Verify:**
- [ ] Status 200
- [ ] Account auto-unlocked after 15 minutes
- [ ] failedLoginAttempts reset to 0
- [ ] lockedUntil cleared

---

## Phase 6: Token Refresh & Lifecycle

### Test 6.1: Token Refresh (Extend Session)
```bash
# Get refreshToken from registration/login response
REFRESH_TOKEN="<refreshToken>"

curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "'$REFRESH_TOKEN'"
  }'
```

**Expected Response** (200 OK):
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Verify:**
- [ ] Status 200 (OK)
- [ ] New accessToken issued (7-minute expiry)
- [ ] RefreshToken returned (same or rotated)
- [ ] Old token no longer works

### Test 6.2: Logout & Token Invalidation
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected Response** (200 OK):
```json
{
  "message": "Logout successful",
  "parentId": 1
}
```

**Verify:**
- [ ] Status 200
- [ ] Refresh token invalidated in database
- [ ] failedLoginAttempts reset to 0

### Test 6.3: Refresh with Invalidated Token
```bash
# After logout, try to refresh with old token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "'$OLD_REFRESH_TOKEN'"
  }'
```

**Expected Response** (401 Unauthorized):
```json
{
  "message": "Invalid or expired refresh token"
}
```

**Verify:**
- [ ] Status 401
- [ ] Old refresh token invalid
- [ ] Cannot extend session after logout

---

## Phase 7: Encryption Verification

### Test 7.1: Check Phone Number Encryption in Database
```bash
# Get parent ID from login response (should be 1)
psql $DATABASE_URL -c "SELECT email, phoneNumber FROM \"Parent\" WHERE id = 1;"
```

**Expected Output:**
```
email         | phoneNumber
--------------|-----------------------------------------------
charity@...   | 4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d:deadbeef...:cafebabe...
(encrypted format: iv:authTag:ciphertext in hex)
```

**Verify:**
- [ ] Phone number NOT readable in plaintext
- [ ] Stored as hex-encoded iv:authTag:ciphertext format
- [ ] Decrypted when returned to client

### Test 7.2: Tampering Detection
```bash
# Corrupt the encrypted value
psql $DATABASE_URL -c "UPDATE \"Parent\" SET phoneNumber = '4a5b6c7d8e9f:deadbeef:cafebabefff' WHERE id = 1;"

# Then try to retrieve parent
curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (500 Server Error or specific error):
```json
{
  "message": "Failed to retrieve dashboard data"
}
```

**Verify:**
- [ ] Tampered encryption detected
- [ ] Error returned (decryption fails)
- [ ] Audit log shows tampering attempt

---

## Phase 8: Audit Logging Verification

### Test 8.1: Check Audit Logs
```bash
# Monitor logs/console while running tests
npm start 2>&1 | grep -i "audit\|login\|lockout"
```

**Expected Log Output:**
```
[AUTH] Login success for parent 1
[AUTH] Child created: childId=10, parentId=1
[AUDIT] ACCOUNT_LOCKOUT: charity@example.com after 5 attempts
[AUDIT] TOKEN_REFRESH: New access token issued for parent 1
[AUDIT] LOGOUT: Parent 1 logged out
```

**Verify:**
- [ ] LOGIN_SUCCESS logged on successful login
- [ ] LOGIN_FAILURE logged on wrong password
- [ ] ACCOUNT_LOCKOUT logged on 5th attempt
- [ ] CHILD_CREATED logged when child created
- [ ] TOKEN_REFRESH logged on token refresh
- [ ] LOGOUT logged on logout

---

## Phase 9: Data Privacy & Isolation

### Test 9.1: Parent A Can Only See Their Children
```bash
# Register Parent B
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Parent B",
    "email": "parentb@example.com",
    "password": "SecurePassword123",
    "phoneNumber": "+254700000001"
  }'
# Save Parent B's token and dashboard shows 0 children

# Parent A checks dashboard (should show 2 children)
curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer $PARENT_A_TOKEN"
# Verify: Shows 2 children (amara, james)

# Parent B checks dashboard (should show 0 children)
curl -X GET http://localhost:3000/api/family/dashboard \
  -H "Authorization: Bearer $PARENT_B_TOKEN"
# Verify: Shows 0 children (only Parent B's children)
```

**Verify:**
- [ ] Parent A dashboard shows only their 2 children
- [ ] Parent B dashboard shows 0 children (empty)
- [ ] No data crossing between parents
- [ ] Each JWT's parentId used in query

### Test 9.2: Parent A Cannot Delete Parent B's Child
```bash
# Parent A tries to deactivate Parent B's child (with Parent B's first child ID)
PARENT_B_CHILD_ID=12  # Hypothetical child of Parent B

curl -X PATCH http://localhost:3000/api/family/children/$PARENT_B_CHILD_ID/deactivate \
  -H "Authorization: Bearer $PARENT_A_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

**Expected Response** (404 Not Found):
```json
{
  "message": "Child not found"
}
```

**Verify:**
- [ ] Status 404
- [ ] Parent A blocked from accessing Parent B's child
- [ ] No information disclosed that child exists

---

## Summary Checklist

### Authentication & Authorization ✅
- [ ] Parent registration works
- [ ] Parent login successful
- [ ] JWT tokens generated
- [ ] Invalid tokens rejected
- [ ] Expired tokens rejected
- [ ] RBAC enforces PARENT role
- [ ] Non-PARENT roles blocked

### Child Management ✅
- [ ] Child created atomically with wallet
- [ ] Duplicate username rejected
- [ ] Invalid input validated
- [ ] Child linked to correct parent
- [ ] Wallet auto-created with 0 balance
- [ ] Child ID assigned incrementally

### Dashboard & Querying ✅
- [ ] Dashboard returns parent + all children + wallets
- [ ] Aggregation stats calculated correctly
- [ ] Soft-deleted children excluded
- [ ] Single database query (no N+1)
- [ ] Balance returned as string (precision)

### Security ✅
- [ ] Ownership verified (404 for unauthorized)
- [ ] Parent A can't access Parent B's children
- [ ] Information hiding prevents enumeration
- [ ] Phone number encrypted in database
- [ ] All events audited

### Rate Limiting ✅
- [ ] 5 failed attempts lock account
- [ ] 6th attempt returns 429
- [ ] Auto-unlock after 15 minutes
- [ ] Successful login resets counter

### Encryption ✅
- [ ] Phone numbers encrypted at rest
- [ ] Decrypted for client response
- [ ] Tampering detected
- [ ] AES-256-GCM algorithm

### Audit Logging ✅
- [ ] Login events logged
- [ ] Lockout events logged
- [ ] Child creation logged
- [ ] Logs have severity levels

---

**Total Test Cases**: 35+
**Estimated Testing Time**: 30-45 minutes
**Status**: Ready for manual testing and QA

