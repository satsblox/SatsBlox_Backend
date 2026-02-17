# SatsBlox Security Architecture

## Executive Summary

SatsBlox implements a **defense-in-depth security architecture** with 7 interconnected layers protecting parent-child-wallet hierarchies. This document describes the complete security model, threat mitigation strategies, and deployment requirements.

**Core Philosophy**: Never trust user input, verify ownership at every level, encrypt PII at rest, audit all security-sensitive operations.

---

## Table of Contents

1. [Security Layers](#security-layers)
2. [Threat Model](#threat-model)
3. [Implementation Details](#implementation-details)
4. [Deployment Checklist](#deployment-checklist)
5. [Testing & Verification](#testing--verification)
6. [Response to Security Incidents](#response-to-security-incidents)

---

## Security Layers

### Layer 1: Password Security

**Goal**: Prevent unauthorized account access through password attacks.

**Implementation**:
- **Algorithm**: bcrypt with 10 salt rounds
- **Storage**: Never store plaintext passwords; only bcrypt hashes stored in database
- **Validation**: Timing-safe comparison (`bcrypt.compare()`) to prevent timing attacks

**How It Works**:
```javascript
// Registration
const hashedPassword = await bcrypt.hash(password, 10);
// Login
const isValid = await bcrypt.compare(password, hashedPassword);
```

**Protection Against**:
- ✅ Dictionary attacks (infeasible - bcrypt = ~100ms per attempt)
- ✅ Rainbow tables (infeasible - unique salt per hash)
- ✅ Timing attacks (bcrypt.compare is constant-time)
- ✅ GPU acceleration (bcrypt algorithm resists GPU optimization)

**Deployment Requirement**:
- Ensure passwords are minimum 8 characters (enforced by validators)
- Monitor failed login attempts (tracked in `Parent.failedLoginAttempts`)

---

### Layer 2: Token Management

**Goal**: Implement stateless session management with minimal revocation overhead.

**Implementation**:
- **Access Token**: JWT, 7-minute expiry
- **Refresh Token**: JWT, 7-day expiry
- **Token Payload**: Contains `id`, `email`, `role` claim (for RBAC)
- **Signature**: HMAC-SHA256 using `JWT_SECRET` environment variable

**Token Structure**:
```javascript
// Payload (verified via JWT signature)
{
  id: 1,                          // Parent ID (tamper-proof)
  email: "parent@example.com",    // Email (tamper-proof)
  role: "PARENT",                 // Role claim for RBAC
  iat: 1707816600,                // Issued at (Unix timestamp)
  exp: 1707817020                 // Expiration (Unix timestamp)
}
```

**Token Lifecycle**:
1. **Registration**: Generate both tokens, parent immediately logged in
2. **Login**: Generate new tokens for each login (rotation)
3. **Refresh**: Issue new access token when old token expires (or both tokens via Option B)
4. **Logout**: Invalidate refresh token by setting `Parent.refreshToken = null`

**Expiration Strategy**:
- **Short-lived access token (7 min)**: Reduces window if token is compromised
- **Long-lived refresh token (7 days)**: Improves user experience (fewer reauthentications)

**Token Rotation Options**:
- **Option A (Current)**: Refresh endpoint issues new access token only
  - Pro: Simpler implementation
  - Con: If refresh token is leaked, attacker has 7 days to use it
- **Option B (Available)**: Refresh endpoint issues both new access AND new refresh token
  - Pro: Limits compromise window if tokens are leaked
  - Con: Client must handle token rotation + server must track invalidated tokens

**Deployment Requirement**:
- Set `JWT_SECRET` environment variable to a cryptographically secure random value
- Use HTTPS for all token transmission (prevents man-in-the-middle attacks)

---

### Layer 3: Rate Limiting & Account Lockout

**Goal**: Prevent brute-force password attacks and credential enumeration.

**Implementation**:
- **Strategy**: Database-tracked failed login attempts + IP-based rate limiting
- **Threshold**: 5 failed attempts → 15-minute account lockout
- **Storage**: `Parent.failedLoginAttempts`, `Parent.lockedUntil`, `Parent.lastFailedLoginAttempt`
- **IP Tracking**: In-memory map (`rateLimitMiddleware.js`) for additional layer

**How It Works**:

1. **Failed Login Attempt**:
   - Increment `failedLoginAttempts++`
   - Record `lastFailedLoginAttempt = now`
   - If attempts >= 5: Set `lockedUntil = now + 15 minutes`

2. **Successful Login**:
   - Reset `failedLoginAttempts = 0`
   - Clear `lastFailedLoginAttempt = null`
   - Clear `lockedUntil = null` (unlock if was locked)

3. **Auto-unlock**:
   - Automatic: After 15 minutes, account automatically unlocked
   - On login attempt, middleware checks: `if (lockedUntil < now) → unlock`

**Protection Against**:
- ✅ Brute-force password attacks (limited to ~6 attempts per 15 min per IP)
- ✅ Credential packing attacks (account locked until timeout)
- ✅ Dictionary attacks (same protections as brute-force)

**Deployment Requirement**:
- Monitor `Parent.failedLoginAttempts` field for indicators of attacks
- Consider admin endpoint to manually unlock locked accounts
- Rate limiting thresholds can be adjusted in `rateLimitMiddleware.js`

---

### Layer 4: Role-Based Access Control (RBAC)

**Goal**: Ensure users can only access resources appropriate to their role.

**Implementation**:
- **Role Claim**: JWT payload includes `role: "PARENT"` (verified by JWT signature)
- **Middleware**: `authorizeRoles()` factory checks role before executing handler
- **Responses**: 403 Forbidden (generic message - no role disclosure)

**How It Works**:

```javascript
// Route definition
router.get('/family/children', 
  authMiddleware.authenticate,        // Verify token signature
  authorizeRoles('PARENT'),            // Check role claim
  childController.listMyChildren      // Business logic
);

// Middleware implementation
function authorizeRoles(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user.role;   // From verified JWT
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
```

**Current Roles**:
- `PARENT`: Can create/manage children, view wallets, manage app settings
- `CHILD` (future): Can view own wallet, initiate transactions (pending parent approval)
- `ADMIN` (future): Can manage users, view audit logs, override settings

**Information Hiding**:
- Don't reveal which role is required (prevents attacker from enumerating roles)
- Return generic 403 for all role violations

**Deployment Requirement**:
- All family/child endpoints must have `authorizeRoles('PARENT')` middleware
- Regular audits to ensure no unguarded endpoints exist

---

### Layer 5: Ownership Verification

**Goal**: Ensure users can only access resources they own (child-parent relationships).

**Implementation**:
- **Middleware**: `verifyParentalLink()` in `ownershipMiddleware.js`
- **Verification**: Checks `Child.parentId === req.user.id` before handler executes
- **Response**: 404 Not Found (doesn't reveal whether child exists or is unowned)

**How It Works**:

```javascript
// Route definition
router.get('/children/:childId',
  authMiddleware.authenticate,           // Verify token
  authorizeRoles('PARENT'),              // Check role
  verifyParentalLink('childId'),         // Verify ownership
  childController.getChild               // Business logic
);

// Middleware: Ensures child belongs to parent
// If not: Returns 404 (same response as "child not found")
// This prevents information disclosure
```

**Protection Against**:
- ✅ Vertical privilege escalation (access parent's own data)
- ✅ Horizontal privilege escalation (access sibling's data)
- ✅ Resource enumeration (can't determine which children exist)

**Deployment Requirement**:
- All child/wallet endpoints must have `verifyParentalLink()` middleware
- Regular audits to ensure ownership checks don't have bypass logic

---

### Layer 6: Field-Level Encryption

**Goal**: Protect PII (Personally Identifiable Information) if database is compromised.

**Implementation**:
- **Algorithm**: AES-256-GCM (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode)
- **Key Source**: `ENCRYPTION_KEY` environment variable (64 hex characters = 32 bytes)
- **IV (Initialization Vector)**: 12 random bytes for each encryption (prevents frequency analysis)
- **Auth Tag**: 16-byte HMAC (detects tampering/corruption)
- **Encrypted Fields**: `Parent.phoneNumber` (extensible to other PII)

**Encryption Process**:

```javascript
// Storage (encryption)
const encryptedPhone = encryptionService.encryptField(
  "+254700000000",  // Plaintext phone
  "PHONE"           // Field type (determines IV/tag handling)
);
// Stored in DB as: hex-encoded "iv:authTag:ciphertext"

// Retrieval (decryption)
const plainPhone = encryptionService.decryptField(
  encryptedPhone,   // From database
  "PHONE"
);
// Returns: "+254700000000" (or throws if tampered)
```

**AES-256-GCM Details**:
- **AES-256**: 256-bit key provides quantum-resistant security
- **GCM**: Authenticated encryption (detects tampering)
- **IV**: 12 random bytes per encryption (prevents pattern analysis)
- **Auth Tag**: 16 bytes HMAC prevents: forgery, bit-flips, partial decryption attacks

**Key Management**:
- **Derivation**: `ENCRYPTION_KEY` = 64 hex chars → 32-byte buffer
- **Validation**: Server crashes on startup if key is missing or invalid format
- **Rotation** (not implemented in MVP): Can implement without code changes via key versioning

**Protection Against**:
- ✅ Database breach (PII remains encrypted/useless to attacker)
- ✅ Backup theft (same protection as database)
- ✅ Tampering (auth tag detects any modifications)
- ✅ Frequency analysis (random IV for each encryption)

**Deployment Requirement**:
- Set `ENCRYPTION_KEY` environment variable: 64 hex characters
- Generation: `openssl rand -hex 32`
- Never log or transmit the key
- Treat key like: database credentials >> JWT_SECRET >> API keys

---

### Layer 7: Audit Logging

**Goal**: Track all security-sensitive events for forensics, compliance, and threat detection.

**Implementation**:
- **Service**: `src/services/auditService.js` with 11 convenience functions
- **Events Logged**: Login success/failure, account lockout, logout, token refresh, role check failures
- **Current Output**: Console (extensible to Sentry, CloudWatch, database)
- **Severity Levels**: CRITICAL, HIGH, MEDIUM, LOW
- **Privacy**: Never logs PII directly (uses IDs instead)

**Events Logged**:

| Event | Severity | Trigger | Details Logged |
|-------|----------|---------|----------------|
| LOGIN_SUCCESS | MEDIUM | Valid credentials accepted | parentId, email |
| LOGIN_FAILURE | HIGH | Invalid password or account not found | email, reason |
| ACCOUNT_LOCKOUT | CRITICAL | 5+ failed login attempts | email, attempt count |
| LOGOUT | LOW | Refresh token invalidated | parentId |
| TOKEN_REFRESH | LOW | New access token issued | parentId |
| UNAUTHORIZED_ACCESS | HIGH | Role check failed | userId, resourceType |
| ENCRYPTION_FAILURE | CRITICAL | Field encryption failed | fieldType, errorCode |
| DECRYPTION_FAILURE | CRITICAL | Field decryption failed (tampering?) | fieldType, errorCode |
| CHILD_CREATED | MEDIUM | New child account created | childId, parentId |
| CHILD_DEACTIVATED | MEDIUM | Child soft-deleted | childId, parentId |
| ROLE_CHECK_FAILED | HIGH | RBAC authorization rejected | userId, requiredRole, userRole |

**Audit Log Format**:
```javascript
{
  timestamp: "2024-02-17T10:30:45.123Z",
  action: "LOGIN_SUCCESS",
  severity: "MEDIUM",
  resourceType: "PARENT",
  resourceId: 1,
  details: "Parent 1 logged in successfully from IP 192.168.1.100",
  userAgent: "Mozilla/5.0...",
  ipAddress: "192.168.1.100"
}
```

**Privacy Compliance**:
- **GDPR**: Logs don't contain plaintext PII (uses IDs)
- **Retention**: Currently indefinite (configure retention policy)
- **Access Control**: Admin-only access to audit logs
- **Encryption**: Logs should be encrypted at rest and in transit

**Future Enhancements**:
- Ship logs to external SIEM (Sentry, CloudWatch, ELK)
- Implement alert thresholds (e.g., 3+ lockouts in 1 hour → page SRE)
- Generate compliance reports (ISO 27001, SOC 2, GDPA readiness)

**Deployment Requirement**:
- Verify audit logging calls in all security-sensitive code paths
- Set up log aggregation service (Sentry, CloudWatch, etc.)
- Configure alerts for CRITICAL severity events

---

## Threat Model

### Attacker Profiles

| Profile | Capabilities | Threat | Mitigation |
|---------|-----------|--------|-----------|
| **Script Kiddie** | Runs automated tools (SQLi, XSS, Brute Force) | Brute-force attacks, injection attacks | Rate limiting, input validation, parameterized queries |
| **Opportunistic Attacker** | Exploits public CVEs, low reconnaissance | Zero-day exploits, unpatched libraries | Regular dependency updates, Web Application Firewall |
| **Insider Threat** | Has database/code access | Reads encrypted data, modifies audit logs | Encryption, access control, key separation |
| **Nation State** | Advanced techniques, quantum computers | All attacks + cryptanalysis | Quantum-resistant crypto (AES-256 suitable) |

### Attack Vectors & Mitigations

#### 1. Brute-Force Password Attack
**Attack**: Attacker tries thousands of password combinations
- Layer 3: **Rate Limiting** → 5 attempts per 15 minutes locks account
- Layer 1: **bcrypt** → Each attempt takes ~100ms, infeasible to crack

#### 2. Privilege Escalation
**Attack**: Normal user tries to act as admin/parent

**Vertical Escalation** (CHILD → PARENT):
- Layer 4: **RBAC** → Role claim in JWT verified by signature
- Layer 2: **JWT Signature** → Can't forge role claim (would need JWT_SECRET)

**Horizontal Escalation** (PARENT A → PARENT B):
- Layer 5: **Ownership Check** → Each endpoint verifies `child.parentId === req.user.id`

#### 3. Database Breach
**Attack**: Attacker gains SQL access and dumps database

**Without Encryption**: Passwords compromised
- Layer 1: **bcrypt** → Even if hash stolen, infeasible to crack

**With Encryption**: PII protected
- Layer 6: **AES-256-GCM** → Phone numbers unreadable without ENCRYPTION_KEY
- Attacker needs: database dump + ENCRYPTION_KEY (separate)

#### 4. Token Compromise
**Attack**: Attacker steals JWT (via XSS, network sniff, etc.)

**Short Live Window**:
- Layer 2: **7-min access token** → Attacker has limited time to use token
- After 7 minutes, token is useless (signature verified with exp claim)

**Mitigation if Stolen**:
- Layer 2: **Logout** → Parent can invalidate refresh token immediately
- After logout, refresh token is null (can't issue new access tokens)
- Old access token still valid until 7-min expiry (by design)

#### 5. SQL Injection
**Attack**: Attacker injects SQL code via API input

**Mitigations**:
- **Prisma ORM**: Parameterized queries (no plain SQL concatenation)
- **Input Validation**: `validators.js` ensures email format, password length
- **Type Checking**: Database schema defines allowed types

#### 6. Man-in-the-Middle (MITM)
**Attack**: Attacker intercepts HTTPS traffic and steals tokens

**Mitigations**:
- **HTTPS**: All traffic encrypted in transit (TLS 1.3)
- **HSTS Headers**: Forces HTTPS for all requests
- **Certificate Pinning** (optional): Mobile apps pin certificate

#### 7. Replay Attack
**Attack**: Attacker captures a request and replays it multiple times

**Example**: Capture "TRANSFER 100 BTC to attacker" and replay 1000 times

**Mitigations**:
- **Token Expiration**: Each token expires; old tokens not accepted
- **Nonce System** (future): Each request gets unique nonce; replay detected
- **Idempotency Keys** (future): Client provides unique key; duplicate requests rejected

#### 8. Denial of Service (DoS)
**Attack**: Attacker sends massive requests to crash service

**Mitigations**:
- **Rate Limiting**: Layer 3 limits requests per IP
- **Connection Limits**: Infrastructure level (nginx, AWS WAF)
- **Auto-scaling**: Service scales to handle traffic spikes

---

## Implementation Details

### File Structure

```
src/
├── services/
│   ├── authService.js              # Auth logic + token generation
│   ├── encryptionService.js        # AES-256-GCM encryption/decryption
│   └── auditService.js             # Security event logging
├── middleware/
│   ├── authMiddleware.js           # JWT verification
│   ├── authorizeRoles.js           # RBAC (role checking)
│   ├── rateLimitMiddleware.js      # IP-based rate limiting
│   ├── ownershipMiddleware.js      # Parental link verification
│   └── errorHandler.js             # Centralized error handling
├── routes/
│   ├── auth.js                     # Auth endpoints + middleware
│   └── childRoutes.js              # Family endpoints + RBAC
├── controllers/
│   ├── authController.js           # HTTP request handling
│   └── childController.js          # Family controller
├── utils/
│   └── validators.js               # Input validation
└── config/
    ├── db.js                       # Database connection
    ├── env.js                      # Environment variables
    └── swagger.js                  # API documentation
```

### Dependency Chain

```
HTTP Request
    ↓
[1] authMiddleware.authenticate ← Verify JWT signature
    ↓
[2] authorizeRoles('PARENT') ← Check role claim
    ↓
[3] rateLimitMiddleware ← Rate limit (login only)
    ↓
[4] ownershipMiddleware.verifyParentalLink ← Verify child.parentId == parent.id
    ↓
[5] Controller → Service
    ↓
[6] encryptionService ← Encrypt/decrypt PII
    ↓
[7] auditService ← Log security events
    ↓
[8] Prisma ORM ← Parameterized queries to database
    ↓
Database
```

### Environment Variables

**Required for Security**:

```bash
# JWT Token Signing (generate: openssl rand -hex 32)
JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Field-Level Encryption (generate: openssl rand -hex 32)
ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/satsblox

# Optional: Audit Log Destination
# SENTRY_DSN=https://xxxx@sentry.io/xxxx
# CLOUDWATCH_LOG_GROUP=satsblox-logs
```

### Configuration Constants

**Password Security** (`authService.js`):
- `SALT_ROUNDS = 10` → bcrypt cost factor (adjust for performance/security trade-off)

**Rate Limiting** (`rateLimitMiddleware.js`):
- `MAX_ATTEMPTS = 5` → Failed attempts before lockout
- `WINDOW = 15 * 60 * 1000` → Rate limit window (15 minutes)
- `LOCKOUT_DURATION = 15 * 60 * 1000` → Account lockout duration (15 minutes)

**Token Expiration** (`authService.js`):
- `ACCESS_TOKEN_EXPIRY = '7m'` → Access token lifetime
- `REFRESH_TOKEN_EXPIRY = '7d'` → Refresh token lifetime

**Encryption** (`encryptionService.js`):
- `ALGORITHM = 'aes-256-gcm'` → Encryption algorithm
- `IV_LENGTH = 12` → Initialization vector length (bytes)
- `AUTH_TAG_LENGTH = 16` → Authentication tag length (bytes)

---

## Deployment Checklist

### Pre-Deployment

- [ ] All security middleware present (`authMiddleware`, `authorizeRoles`, `rateLimitMiddleware`, `ownershipMiddleware`)
- [ ] All routes protected with appropriate middleware chain
- [ ] Audit logging integrated into auth service
- [ ] Encryption integrated into registration/login
- [ ] Environment variables defined (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL)
- [ ] Secrets stored in secure vault (not in code/git)
- [ ] All dependencies at current versions (run `npm audit`)

### Environment Configuration

1. Generate secrets:
   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

2. Verify environment setup:
   ```bash
   node -e "const env = require('./src/config/env'); console.log('✓ Config loaded')"
   ```

3. Test encryptionService initialization:
   ```bash
   node -e "const enc = require('./src/services/encryptionService'); console.log('✓ Encryption ready')"
   ```

### Database Verification

- [ ] `Parent` table has fields: `failedLoginAttempts`, `lockedUntil`, `lastFailedLoginAttempt`, `refreshToken`, `phoneNumber`
- [ ] `Child` table has `parentId` foreign key to `Parent`
- [ ] `Wallet` table has `childId` foreign key to `Child`
- [ ] Indexes exist on: `Parent(email)`, `Parent(id)`, `Child(parentId)`, `Wallet(childId)`

### Code Review

- [ ] No plaintext passwords in logs
- [ ] No PII in console.log or error messages
- [ ] No credentials in code (all from environment)
- [ ] All RBAC checks present (`authorizeRoles`)
- [ ] All ownership checks present (`verifyParentalLink`)
- [ ] All rate limiting present on auth endpoints

### Security Testing

- [ ] Test 1: Brute-force account lockout
  ```bash
  # 5 failed logins → 15-min lockout
  curl -X POST /api/auth/login -d '{"email":"test@example.com","password":"wrong"}' # × 5
  curl -X POST /api/auth/login -d '{"email":"test@example.com","password":"correct'} # 429 Too Many Requests
  ```

- [ ] Test 2: Phone number encryption
  ```bash
  # Register → phone encrypted in DB
  # Get details → phone shows decrypted to client
  # Database dump → phone appears as hex-encoded "iv:tag:ciphertext"
  ```

- [ ] Test 3: RBAC enforcement
  ```bash
  # Create token with role: "GUEST"
  # Hit /api/family/children
  # Expect: 403 Forbidden
  ```

- [ ] Test 4: Ownership verification
  ```bash
  # Parent A creates Child A
  # Parent B tries to access Child A via /api/family/children/{childAId}
  # Expect: 404 Not Found (doesn't reveal child exists)
  ```

- [ ] Test 5: Logout invalidation
  ```bash
  # Login → get refresh token
  # Logout → refresh token set to null
  # Try /api/auth/refresh with old token
  # Expect: 401 Unauthorized (token invalid)
  ```

### Production Hardening

- [ ] Enable HTTPS/TLS 1.3
- [ ] Set secure HTTP headers (HSTS, CSP, X-Frame-Options)
- [ ] Enable CORS restrictions (only allow frontend domain)
- [ ] Set up log aggregation (Sentry, CloudWatch)
- [ ] Enable database backups with encryption
- [ ] Set up secrets rotation schedule (quarterly)
- [ ] Document incident response procedures

---

## Testing & Verification

### Unit Tests (Recommended)

```javascript
// test/authService.test.js
describe('authService', () => {
  test('registerParent should encrypt phoneNumber', async () => {
    const parent = await registerParent({...});
    expect(parent.phoneNumber).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // hex:hex:hex
  });

  test('loginParent should reset failed attempts on success', async () => {
    await loginParent('test@example.com', 'correct');
    const parent = await prisma.parent.findUnique({where: {email: 'test@example.com'}});
    expect(parent.failedLoginAttempts).toBe(0);
  });

  test('loginParent should lock account after 5 failures', async () => {
    for (let i = 0; i < 5; i++) {
      try { await loginParent('test@example.com', 'wrong'); } catch {}
    }
    const parent = await prisma.parent.findUnique({where: {email: 'test@example.com'}});
    expect(parent.lockedUntil).toBeOutside(Date.now()); // Locked until future time
  });
});

// test/encryptionService.test.js
describe('encryptionService', () => {
  test('encryptField should produce different output for same input (due to random IV)', () => {
    const enc1 = encryptField('+254700000000', 'PHONE');
    const enc2 = encryptField('+254700000000', 'PHONE');
    expect(enc1).not.toBe(enc2); // Different due to different IVs
  });

  test('decryptField should detect tampering', () => {
    const encrypted = encryptField('+254700000000', 'PHONE');
    const tampered = encrypted.slice(0, -3) + 'xxx'; // Corrupt last 3 chars
    expect(() => decryptField(tampered, 'PHONE')).toThrow('EBADAUTH');
  });
});

// test/rbac.test.js
describe('RBAC', () => {
  test('authorizeRoles should reject non-PARENT users', async () => {
    const token = jwt.sign({role: 'GUEST'}, JWT_SECRET); // Non-PARENT role
    const res = await request.get('/api/family/children')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// test/rateLimit.test.js
describe('Rate Limiting', () => {
  test('should allow 5 failed attempts then return 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/auth/login')
        .send({email: 'test@example.com', password: 'wrong'});
      if (i < 4) expect(res.status).toBe(401);
    }
    const res6 = await request.post('/api/auth/login')
      .send({email: 'test@example.com', password: 'wrong'});
    expect(res6.status).toBe(429); // Too Many Requests
  });
});
```

### Integration Tests (Recommended)

```javascript
// test/integration/auth.test.js
describe('Auth Flow', () => {
  test('Full auth flow: register → login → refresh → logout', async () => {
    // Register
    const reg = await request.post('/api/auth/register').send({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'SecurePassword123',
      phoneNumber: '+254700000000'
    });
    expect(reg.status).toBe(201);
    expect(reg.body.parent.phoneNumber).toBe('+254700000000'); // Decrypted for client
    const {accessToken, refreshToken} = reg.body;

    // Make authenticated request
    const res = await request.get('/api/family/children')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    // Refresh token after expiry
    const refresh = await request.post('/api/auth/refresh').send({refreshToken});
    expect(refresh.status).toBe(200);
    const {accessToken: newToken} = refresh.body;

    // Logout
    const logout = await request.post('/api/auth/logout')
      .set('Authorization', `Bearer newToken`);
    expect(logout.status).toBe(200);

    // Old refresh token should be invalid now
    const refresh2 = await request.post('/api/auth/refresh').send({refreshToken});
    expect(refresh2.status).toBe(401);
  });
});
```

### Manual Verification

1. **Check encryption in database**:
   ```sql
   SELECT id, email, phoneNumber FROM "Parent" WHERE id = 1;
   -- Should see: id=1, email="test@example.com", phoneNumber="iv:tag:ciphertext" (hex)
   ```

2. **Verify JWT claims**:
   ```bash
   # Decode token JWT at jwt.io
   # Header: { "alg": "HS256", "typ": "JWT" }
   # Payload: { "id": 1, "email": "test@example.com", "role": "PARENT", "iat": ..., "exp": ... }
   ```

3. **Check audit logs**:
   ```bash
   # Should see in console/logs:
   # [AUTH] Login success for user 1
   # [FAMILY] Child 10 created for parent 1
   # [AUDIT] ACCOUNT_LOCKOUT: parent@example.com after 5 attempts
   ```

---

## Response to Security Incidents

### Incident: Suspected Brute-Force Attack
1. Check logs for pattern: multiple LOGIN_FAILURE events for same email within short time
2. Verify: `Parent.failedLoginAttempts >= 5` and `Parent.lockedUntil > now`
3. Action: Account auto-locked for 15 min. Monitor for repeat attempts.
4. Admin Action: If legitimate user, admin can reset `failedLoginAttempts = 0`

### Incident: Unauthorized Access to Child Data
1. Check logs: UNAUTHORIZED_ACCESS event with mismatched `parentId` and `childId`
2. Verify: ownershipMiddleware correctly rejects cross-parent access
3. Action: Block attacker IP at firewall. Audit all requests from that IP.
4. Alert: Check if this was targeted attack or random scanning

### Incident: Encryption Key Compromise
1. **Immediate**: Generate new ENCRYPTION_KEY
2. **Short-term**: Deploy new key; old data stays encrypted with old key
3. **Medium-term**: Re-encrypt all PII with new key (batch job)
4. **Long-term**: Implement key versioning to support multiple keys simultaneously

### Incident: Database Dump/Backup Breach
1. **Assessment**: Did attacker get BOTH database AND ENCRYPTION_KEY?
   - Database only: PII still encrypted (useless without key)
   - Database + Key: PII compromised, rotate key immediately
2. **Notification**: Inform users if PII was exposed (legally required)
3. **Action**: Rotate ENCRYPTION_KEY; force password reset for all users

### Incident: JWT_SECRET Compromise
1. **Immediate**: Generate new JWT_SECRET
2. **Effect**: All existing tokens become invalid (users must re-login)
3. **Communication**: Send outage notice; plan maintenance window
4. **Remediation**: 
   - Deploy new secret
   - Invalidate all existing tokens (DB maintenance)
   - Force users to re-authenticate

### Monitoring & Alerting (Future Implementation)

```javascript
// Recommended thresholds
const ALERTS = {
  'LOGIN_FAILURE_RATE > 10/min': 'CRITICAL - Possible brute-force attack',
  'ACCOUNT_LOCKOUT_RATE > 5/hour': 'HIGH - Multiple accounts being attacked',
  'UNAUTHORIZED_ACCESS > 20/hour': 'HIGH - Multiple privilege escalation attempts',
  'DECRYPTION_FAILURE > 1': 'CRITICAL - Possible tampering or corruption',
  'ERROR_RATE > 1%': 'MEDIUM - Service instability detected'
};
```

---

## Compliance & Standards

### Standards Implemented
- **OWASP Top 10**: Addresses A1 (Broken Auth), A2 (Broken Access Control), A3 (Injection)
- **NIST Cybersecurity Framework**: Govern, Identify, Protect, Detect, Respond, Recover
- **ISO 27001**: Information security management (access control, encryption, audit logs)

### Regulations Supported
- **GDPR**: Data protection (encryption of PII, audit logs for data requests)
- **KDPA** (Kenya): Data protection similar to GDPR
- **PCI-DSS** (if processing payments): Secure password storage, rate limiting, audit trails
- **SOC 2 Type II** (if audited): Encryption, access controls, monitoring/logging

---

## Future Enhancements

### Phase 2: Advanced Token Rotation
- Implement Option B: Refresh endpoint rotates both access + refresh token
- Track invalidated refresh tokens to prevent replay

### Phase 3: Denylist/Blacklist
- Token revocation denylist for immediate logout
- Background job to clean expired tokens from denylist

### Phase 4: Biometric Authentication
- Fingerprint/Face ID for children's wallets
- Multi-factor authentication for parents

### Phase 5: Advanced Threat Detection
- ML-based anomaly detection (unusual login times, locations)
- Behavioral analysis (spending patterns, device usage)

### Phase 6: Compliance Automation
- Auto-generate compliance reports (GDPR, SOC 2, PCI-DSS)
- Audit log export for regulatory submissions

---

## References

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- NIST Digital Identity Guidelines: https://pages.nist.gov/800-63-3/
- CWE Top 25: https://cwe.mitre.org/top25/
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- AES-256-GCM: https://csrc.nist.gov/publications/detail/sp/800-38d/final

---

**Last Updated**: 2024-02-17
**Next Review**: 2024-05-17 (quarterly)
**Maintained By**: Security Team
