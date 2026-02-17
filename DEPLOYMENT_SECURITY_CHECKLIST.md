# Deployment & Production Security Checklist

## Pre-Deployment Verification

### Environment Variables

- [ ] **JWT_SECRET** set and validated
  ```bash
  # Verify: Must be 64 hex characters
  echo $JWT_SECRET | wc -c  # Should output: 65 (64 chars + newline)
  # Generate if missing:
  export JWT_SECRET=$(openssl rand -hex 32)
  ```

- [ ] **ENCRYPTION_KEY** set and validated
  ```bash
  # Verify: Must be 64 hex characters
  echo $ENCRYPTION_KEY | wc -c  # Should output: 65
  # Generate if missing:
  export ENCRYPTION_KEY=$(openssl rand -hex 32)
  ```

- [ ] **DATABASE_URL** set and tested
  ```bash
  # Verify connection:
  node -e "const db = require('./src/config/db'); console.log('✓ DB connected')"
  ```

- [ ] **NODE_ENV** set to `production`
  ```bash
  export NODE_ENV=production
  ```

- [ ] All credentials in secure vault (not in code or git)
  - Use: AWS Secrets Manager, HashiCorp Vault, environment variables
  - Never: Hardcode in source files, commit to git

### Code Verification

- [ ] All security middleware present
  ```bash
  # Check for presence of:
  grep -r "authMiddleware.authenticate" src/routes/
  grep -r "authorizeRoles" src/routes/
  grep -r "rateLimitMiddleware" src/routes/
  grep -r "verifyParentalLink" src/routes/
  ```

- [ ] All routes protected with appropriate middleware
  ```javascript
  // Template: Auth endpoints
  router.post('/login', loginRateLimiter, authController.login);
  
  // Template: Protected endpoints
  router.get('/family/children', 
    authMiddleware.authenticate,
    authorizeRoles('PARENT'),
    childController.listMyChildren
  );
  ```

- [ ] No plaintext passwords in logs or error messages
  ```bash
  # Verify: Search for "password:" in code
  grep -r '"password":' src/ || echo "✓ No password literals found"
  ```

- [ ] No PII in console.log or error messages
  ```bash
  # Verify: Check logged data
  grep -r "console.log.*phone\|email\|address" src/ | grep -v "// " || echo "✓ OK"
  ```

- [ ] Encryption and decryption calls integrated
  ```bash
  grep -r "encryptionService.encryptField" src/ | wc -l
  # Should show at least 1-2 encryption calls (registration, login)
  ```

- [ ] Audit logging integrated
  ```bash
  grep -r "auditService\." src/ | wc -l
  # Should show multiple audit logging calls
  ```

### Database Verification

- [ ] Schema matches deployment requirements
  ```sql
  -- Verify Parent table fields
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'Parent' 
  ORDER BY column_name;
  
  -- Required fields:
  -- ✓ id (PRIMARY KEY)
  -- ✓ email (UNIQUE, indexed)
  -- ✓ password (bcrypt hash)
  -- ✓ phoneNumber (encrypted)
  -- ✓ failedLoginAttempts (integer, default 0)
  -- ✓ lockedUntil (timestamp nullable)
  -- ✓ lastFailedLoginAttempt (timestamp nullable)
  -- ✓ refreshToken (string nullable)
  ```

- [ ] Indexes exist for performance
  ```sql
  -- Check indexes
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Parent';
  
  -- Should have indexes on:
  -- ✓ email (for login queries)
  -- ✓ id (automatic for PRIMARY KEY)
  ```

- [ ] Foreign keys configured
  ```sql
  -- Verify Child.parentId → Parent.id
  SELECT constraint_name, table_name, column_name 
  FROM information_schema.key_column_usage 
  WHERE constraint_type = 'FOREIGN KEY' AND table_name = 'Child';
  ```

- [ ] Cascade delete policies configured
  ```sql
  -- Example: Deactivate children when parent deleted (not cascading)
  ALTER TABLE "Child" 
  ADD CONSTRAINT parent_fk 
  FOREIGN KEY ("parentId") REFERENCES "Parent"(id) 
  ON DELETE RESTRICT;
  ```

### Dependencies Security

- [ ] All packages at current versions
  ```bash
  npm audit
  # Fix critical/high vulnerabilities
  npm audit fix
  ```

- [ ] No vulnerable dependencies
  ```bash
  npm ci
  npm audit
  # Should show: "0 vulnerabilities" or only low/info
  ```

- [ ] Lock file committed
  ```bash
  git ls-files | grep package-lock.json
  # Should show: package-lock.json in git
  ```

### Build & Testing

- [ ] All tests passing
  ```bash
  npm test
  # Should show: All tests passed, 0 failures
  ```

- [ ] No console errors/warnings on startup
  ```bash
  npm start
  # Should show: "✓ Server running on port 3000"
  # Should NOT show: warnings or errors
  ```

- [ ] Syntax validation
  ```bash
  node -c src/server.js
  node -c src/services/authService.js
  node -c src/middleware/authorizeRoles.js
  # All should exit with code 0 (no output)
  ```

---

## Production Deployment Steps

### Step 1: Pre-Flight Checks

```bash
# 1.1 Verify all tests pass
npm test
# Expected: All tests passing

# 1.2 Verify no security vulnerabilities
npm audit
# Expected: 0 vulnerabilities (or only low/info severity)

# 1.3 Verify code syntax
npm run lint || echo "No linter configured"
```

### Step 2: Environment Configuration

```bash
# 2.1 Set environment variables (use secret manager in production)
export NODE_ENV=production
export JWT_SECRET=<64-hex-random-string>
export ENCRYPTION_KEY=<64-hex-random-string>
export DATABASE_URL=postgresql://...
export PORT=3000

# 2.2 Verify configuration loaded correctly
node -e "const env = require('./src/config/env'); console.log('✓ Config OK')"

# 2.3 Test encryption service startup
node -e "const enc = require('./src/services/encryptionService'); console.log('✓ Encryption OK')"
```

### Step 3: Database Preparation

```bash
# 3.1 Run migrations
npm run migrate || npx prisma migrate deploy

# 3.2 Verify schema
node scripts/verify-schema.js

# 3.3 Backup existing data
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Step 4: Application Deployment

```bash
# 4.1 Install fresh dependencies
rm -rf node_modules package-lock.json
npm install --production

# 4.2 Start application with process manager
pm2 start ecosystem.config.js --env production

# 4.3 Verify application is running
curl http://localhost:3000/api/health || echo "Health check endpoint not configured"
```

### Step 5: Monitoring & Verification

```bash
# 5.1 Check application logs
pm2 logs

# 5.2 Verify encryption working
npm run test:encryption

# 5.3 Verify rate limiting working
npm run test:rate-limit

# 5.4 Verify RBAC working
npm run test:rbac
```

---

## Post-Deployment Verification

### Functionality Tests

- [ ] Registration endpoint working
  ```bash
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Test User",
      "email": "test@example.com",
      "password": "SecurePassword123",
      "phoneNumber": "+254700000000"
    }'
  # Expected: 201 Created with tokens
  ```

- [ ] Login endpoint working
  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "SecurePassword123"
    }'
  # Expected: 200 OK with tokens
  ```

- [ ] Protected endpoints require authentication
  ```bash
  curl http://localhost:3000/api/family/children
  # Expected: 401 Unauthorized (no token)
  
  curl -H "Authorization: Bearer $TOKEN" \
    http://localhost:3000/api/family/children
  # Expected: 200 OK (with valid token)
  ```

### Security Tests

- [ ] Brute-force attack protection working
  ```bash
  # Try 6 failed logins (should lock on 5th)
  for i in {1..6}; do
    curl -X POST http://localhost:3000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"test@example.com","password":"wrong"}'
  done
  # Expected: First 5 return 401, 6th returns 429
  ```

- [ ] Encryption working end-to-end
  ```bash
  # Register user
  RESPONSE=$(curl -X POST http://localhost:3000/api/auth/register ...)
  PHONE=$(echo $RESPONSE | jq -r '.parent.phoneNumber')
  # Expected: $PHONE = "+254700000000" (decrypted for client)
  
  # Check database
  psql $DATABASE_URL -c "SELECT phoneNumber FROM \"Parent\" LIMIT 1"
  # Expected: Shows hex format "iv:tag:ciphertext" (encrypted in DB)
  ```

- [ ] RBAC rejection working
  ```bash
  # Create token with non-PARENT role
  TOKEN=$(sign_jwt_with_role 'GUEST')
  
  curl -H "Authorization: Bearer $TOKEN" \
    http://localhost:3000/api/family/children
  # Expected: 403 Forbidden
  ```

- [ ] Ownership verification working
  ```bash
  # Parent A gets token, tries to access Parent B's child
  curl -H "Authorization: Bearer $TOKEN_A" \
    http://localhost:3000/api/family/children/$CHILD_B_ID
  # Expected: 404 Not Found (no information disclosure)
  ```

### Monitoring Setup

- [ ] Logs are being written
  ```bash
  pm2 logs | head -50
  # Should show: startup messages, request logs
  ```

- [ ] Errors are being logged with severity
  ```bash
  # Trigger an error and check logs
  curl http://localhost:3000/api/invalid-endpoint
  # Should see in logs: [WARN] or [ERROR]
  ```

- [ ] Performance metrics acceptable
  ```bash
  # Check response times under normal load
  ab -n 100 -c 10 http://localhost:3000/api/health
  # Expected: Requests per second > 10, failures = 0
  ```

---

## HTTPS & TLS Configuration

### Required Setup

- [ ] SSL certificate obtained
  ```bash
  # Using Let's Encrypt (recommended)
  certbot certonly --standalone -d yourdomain.com
  # Certs stored: /etc/letsencrypt/live/yourdomain.com/
  ```

- [ ] Express configured for HTTPS
  ```javascript
  // src/server.js
  const https = require('https');
  const fs = require('fs');
  
  const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
  };
  
  https.createServer(options, app).listen(443, () => {
    console.log('✓ HTTPS server running on 443');
  });
  ```

- [ ] HTTP redirects to HTTPS
  ```javascript
  // Redirect all HTTP to HTTPS
  app.use((req, res, next) => {
    if (!req.secure && process.env.NODE_ENV === 'production') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
  ```

- [ ] Security headers configured
  ```javascript
  // Use helmet.js for secure headers
  const helmet = require('helmet');
  app.use(helmet());
  
  // This sets:
  // - Strict-Transport-Security (HSTS)
  // - X-Frame-Options (clickjacking protection)
  // - X-Content-Type-Options (MIME sniffing protection)
  // - Content-Security-Policy
  // - And more...
  ```

---

## Secrets Management

### Production Secret Storage

- [ ] **Never** store secrets in code or `.env` files (excluded from git)
- [ ] **Always** use a secure vault for production:

#### Option 1: AWS Secrets Manager
```bash
# Store secret
aws secretsmanager create-secret \
  --name prod/satsblox/jwt-secret \
  --secret-string $JWT_SECRET

# Retrieve in application
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

const secret = await secretsManager.getSecretValue({
  SecretId: 'prod/satsblox/jwt-secret'
}).promise();

process.env.JWT_SECRET = JSON.parse(secret.SecretString).jwt_secret;
```

#### Option 2: HashiCorp Vault
```bash
# Store secret
vault kv put secret/satsblox/prod jwt_secret=$JWT_SECRET

# Retrieve in application
const client = require('node-vault')({
  endpoint: 'https://vault.company.com',
  token: process.env.VAULT_TOKEN
});

const secret = await client.read('secret/satsblox/prod');
process.env.JWT_SECRET = secret.data.data.jwt_secret;
```

#### Option 3: Environment Variables (Simpler)
```bash
# In production environment (e.g., Docker, Heroku)
# Set via platform UI or CLI:
heroku config:set JWT_SECRET=$JWT_SECRET
heroku config:set ENCRYPTION_KEY=$ENCRYPTION_KEY

# Access in application
const jwtSecret = process.env.JWT_SECRET;
```

### Secret Rotation Schedule

- **Quarterly** (every 3 months):
  - Rotate JWT_SECRET
  - Rotate ENCRYPTION_KEY
  - Rotate database password

- **Immediately** if:
  - Secret is exposed or suspected compromised
  - Employee leaves team
  - Security incident occurs

---

## Monitoring & Alerting

### Recommended Alerts

| Alert | Threshold | Severity | Action |
|-------|-----------|----------|--------|
| **Brute-Force Attack** | >10 LOGIN_FAILURE in 1 min | CRITICAL | Page on-call, block IPs |
| **Account Lockout Spike** | >5 ACCOUNT_LOCKOUT in 1 hour | HIGH | Review logs for patterns |
| **Decryption Failures** | >1 failure | CRITICAL | Check encryption key, data integrity |
| **Error Rate High** | >1% 5xx errors | HIGH | Check logs, restart if needed |
| **Response Time Slow** | >1000ms P95 | MEDIUM | Check DB performance, scale up |
| **Authentication Failures** | >50/min | MEDIUM | DDoS detection, rate limiting check |

### Sentry Configuration (Example)

```javascript
// src/config/sentry.js
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
});

// Capture audit events as Breadcrumbs
auditService.logAuditEvent = function(options) {
  Sentry.captureMessage(`[${options.severity}] ${options.action}`, 'log');
};

// Alert on critical events
if (options.severity === 'CRITICAL') {
  Sentry.captureException(new Error(`CRITICAL: ${options.action}`));
}
```

### CloudWatch Configuration (AWS Example)

```javascript
// src/config/cloudwatch.js
const CloudWatchTransport = require('winston-cloudwatch');
const winston = require('winston');

const logger = winston.createLogger({
  transports: [
    new CloudWatchTransport({
      logGroupName: '/aws/satsblox/production',
      logStreamName: 'app-logs',
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION
    })
  ]
});

// Log important events
auditService.logAuditEvent = function(options) {
  logger.log({
    level: options.severity.toLowerCase(),
    message: `${options.action}: ${options.details}`,
    metadata: {
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      timestamp: new Date().toISOString()
    }
  });
};
```

---

## Incident Response

### If Brute-Force Attack Detected

```bash
# 1. Identify attacker IP
tail -f logs/ | grep LOGIN_FAILURE

# 2. Block IP at firewall/WAF
ufw insert 1 deny from 192.168.1.100

# 3. Monitor continued attempts
watch -n 1 'grep LOGIN_FAILURE logs/ | tail -5'

# 4. If persists: Rate limit more aggressively
# Reduce ATTEMPTS from 5 to 3, WINDOW from 15 to 10 minutes

# 5. Customer notification (if breach suspected)
# Send email: "We detected unusual activity on your account"
```

### If Database Breach Suspected

```bash
# 1. Assume worst case: attacker has database dump
# 2. Check if they also have ENCRYPTION_KEY
# 3. If YES:
#    - Rotate ENCRYPTION_KEY immediately
#    - Force password reset for all users
#    - Notify customers
# 4. If NO:
#    - PII is encrypted (phone numbers useless)
#    - Monitor for further disclosures
#    - Passwords hashed with bcrypt (safe)
```

### If JWT_SECRET Compromised

```bash
# 1. Generate new JWT_SECRET
NEW_SECRET=$(openssl rand -hex 32)

# 2. Deploy new secret
export JWT_SECRET=$NEW_SECRET
npm restart

# 3. All existing tokens become invalid
#    Users will need to re-login
# 4. Send notification email to all users (optional)
```

---

## Compliance & Auditing

### GDPR Compliance

- [ ] Data retention policy implemented
  - Delete inactive account data after 1 year
  - Allow users to request data export
  - Permanent delete on user request

- [ ] Audit logs for data access requests
  ```sql
  -- Query: Who accessed this user's data?
  SELECT * FROM audit_logs 
  WHERE resourceType = 'PARENT' AND resourceId = 123 
  ORDER BY timestamp DESC;
  ```

- [ ] Audit logs never deleted (retain 7 years minimum)

### PCI-DSS Compliance (if processing payments)

- [ ] No plaintext passwords stored
  - ✓ Bcrypt hashing implemented

- [ ] Network segmentation
  - ✓ Database on separate network from web server
  - ✓ API only accessible via HTTPS

- [ ] Access control implemented
  - ✓ RBAC middleware enforced
  - ✓ Ownership verification implemented
  - ✓ Audit logging for all access

### ISO 27001 Compliance

- [ ] Information Security Policy documented
- [ ] Access control implemented (RBAC + Ownership)
- [ ] Encryption implemented (Field-level + HTTPS)
- [ ] Audit logging implemented
- [ ] Incident response procedures documented
- [ ] Backup and recovery procedures documented
- [ ] Annual security awareness training for team

---

## Rollback Procedure

### If Deployment Fails

```bash
# 1. Identify issue in logs
pm2 logs

# 2. Stop current deployment
pm2 stop all

# 3. Restore previous version
git checkout HEAD~1
npm install

# 4. Restart with previous version
pm2 start ecosystem.config.js

# 5. Investigate issue
# Don't redeploy until root cause identified
```

### If Security Issue Discovered Post-Deployment

```bash
# 1. Immediate action:
# - If critical: Stop application
# - If high: Implement workaround, plan fix
# - If medium: Schedule fix for next release

# 2. Notify security team
# - Describe issue
# - Estimate blast radius (users affected)
# - Timeline for fix

# 3. Communication:
# - Notify customers if data exposed
# - Timeline: Within 72 hours of discovery (GDPR)

# 4. Remediation:
# - Develop fix
# - Test thoroughly
# - Deploy with monitoring
# - Follow up: Verify fix effective
```

---

## Maintenance & Updates

### Weekly Tasks

- [ ] Review error logs for anomalies
- [ ] Check rate limiting stats (false positive locks?)
- [ ] Monitor database performance

### Monthly Tasks

- [ ] Review security audit logs
- [ ] Check for newly disclosed vulnerabilities (`npm audit`)
- [ ] Update dependencies if critical updates available
- [ ] Backup database verification

### Quarterly Tasks

- [ ] Rotate secrets (JWT_SECRET, ENCRYPTION_KEY)
- [ ] Security penetration test (internal)
- [ ] Disaster recovery drill
- [ ] Team security training update

### Annually

- [ ] Full security audit by external firm
- [ ] Compliance review (GDPR, PCI-DSS, ISO 27001)
- [ ] Incident response plan review and update

---

**Last Updated**: 2024-02-17
**Next Review**: 2024-05-17 (quarterly)
**Maintained By**: DevOps & Security Team
