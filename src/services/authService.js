/**
 * src/services/authService.js
 * 
 * Business logic layer for authentication operations.
 * 
 * Purpose:
 *   - Encapsulate all auth-related business operations
 *   - Keep controllers focused on HTTP request/response handling
 *   - Enable code reuse across different interfaces (REST, GraphQL, etc.)
 *   - Maintain clear separation of concerns
 * 
 * Architecture Pattern: The Service Layer Pattern
 *   Controller → Service → Prisma ORM → Database
 * 
 * This layer handles:
 *   - Password hashing and verification
 *   - JWT token generation and rotation
 *   - Database operations (create user, find user, update tokens)
 *   - Business rule validation and error handling
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');
const env = require('../config/env');
const encryptionService = require('./encryptionService');
const auditService = require('./auditService');

// ============================================
// Configuration Constants
// ============================================

/**
 * Number of salt rounds for bcrypt hashing.
 * 
 * Security Explanation:
 *   - Each round doubles the computation time
 *   - 10 rounds = ~100ms on modern hardware (optimal balance)
 *   - Protects against brute-force attacks even if password hash is stolen
 *   - Recommended by industry: https://github.com/kelektiv/node.bcrypt.js
 * 
 * Trade-off: Higher = More Secure but Slower
 * 9 rounds = ~50ms (acceptable for high-traffic)
 * 12 rounds = ~300ms (very secure but slower)
 */
const SALT_ROUNDS = 10;

/**
 * Access token expiration time.
 * 
 * Security Rationale:
 *   - Short-lived (7 minutes) reduces window if token is compromised
 *   - Requires refresh token to get new access token
 *   - Balances security with user experience (not too many refresh calls)
 */
const ACCESS_TOKEN_EXPIRY = '7m';

/**
 * Refresh token expiration time.
 * 
 * Security Rationale:
 *   - Long-lived (7 days) allows extended user session
 *   - Can be revoked/rotated if suspicious activity detected
 *   - User must re-authenticate if token expires or is revoked
 */
const REFRESH_TOKEN_EXPIRY = '7d';

// ============================================
// Service Functions
// ============================================

/**
 * Register a new parent account.
 * 
 * Workflow:
 *   1. Check if email already exists (prevent duplicates)
 *   2. Hash password using bcrypt (never store plain text)
 *   3. Create parent record in database
 *   4. Generate access and refresh tokens
 *   5. Return tokens (parent is immediately logged in)
 * 
 * Error Handling:
 *   - Throws specific error types that controller can handle appropriately
 *   - Does not catch general errors (let controller decide HTTP response)
 * 
 * @param {object} userData - Registration data { fullName, email, password, phoneNumber }
 * @returns {Promise<object>} { parent, accessToken, refreshToken }
 * @throws {Error} with code property for error type identification
 */
async function registerParent(userData) {
  const { fullName, email, password, phoneNumber } = userData;

  try {
    // ---- Step 1: Check for existing email ----
    const existingParent = await prisma.parent.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingParent) {
      // Create custom error with type identifier
      const error = new Error('Email already registered');
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    // ---- Step 2: Hash password ----
    // bcrypt.hash is async and takes time (by design, for security)
    // This prevents GPU/specialized hardware from accelerating brute-force attacks
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // ---- Step 3: Create parent record ----
    // Encrypt the phone number before storage (AES-256-GCM field-level encryption)
    const encryptedPhoneNumber = encryptionService.encryptField(
      phoneNumber.trim(),
      'PHONE'
    );

    const parent = await prisma.parent.create({
      data: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phoneNumber: encryptedPhoneNumber, // Store encrypted
        password: hashedPassword,
        // Initialize rate-limiting fields to secure defaults
        failedLoginAttempts: 0, // No failed attempts yet
        refreshToken: null, // No token until first login
        lastFailedLoginAttempt: null,
        lockedUntil: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true, // Will be encrypted in DB
        createdAt: true,
        // Note: Intentionally excluding password and sensitive fields from response
      },
    });

    // Decrypt phone number for response (so client sees readable phone)
    const decryptedParent = {
      ...parent,
      phoneNumber: encryptionService.decryptField(parent.phoneNumber, 'PHONE'),
    };
    const { accessToken, refreshToken } = generateTokens(parent.id, parent.email);

    // ---- Step 5: Log successful registration (audit trail) ----
    // Note: Logging is informational, doesn't block registration if it fails
    try {
      auditService.logAuditEvent({
        action: auditService.ACTIONS.PARENT_REGISTRATION,
        severity: auditService.SEVERITY.MEDIUM,
        resourceType: auditService.RESOURCE_TYPES.PARENT,
        resourceId: parent.id,
        details: `Parent account created: ${parent.email}`,
      });
    } catch (logErr) {
      console.warn('[AUTH] Audit logging failed during registration:', logErr.message);
      // Don't throw - registration should succeed even if audit log fails
    }

    // ---- Step 6: Return result ----
    return {
      parent: decryptedParent, // Return decrypted phone number
      accessToken,
      refreshToken,
    };

  } catch (err) {
    // Re-throw errors to be handled by controller
    throw err;
  }
}

/**
 * Authenticate a parent with email and password.
 * 
 * Workflow:
 *   1. Find parent by email (case-insensitive)
 *   2. Check if account is locked (rate-limiting)
 *   3. Compare provided password with hashed password in database
 *   4. If mismatch: increment failed attempts and check if should lock
 *   5. If match: reset failed attempts and generate new tokens
 *   6. Store new refresh token in database
 *   7. Return tokens and parent data
 * 
 * Rate Limiting Strategy:
 *   - Track failed login attempts in database
 *   - After 5 failed attempts: lock account for 15 minutes
 *   - Automatic unlock: after 15-minute lockout period expires
 *   - Manual unlock: admin can reset failedLoginAttempts
 *   - Prevents: brute-force password attacks (dictionary attacks)
 * 
 * Security Notes:
 *   - Use intentionally vague error message ("Invalid credentials")
 *   - Prevents email enumeration attacks (attacker can't determine if email exists)
 *   - Bcrypt comparison is timing-safe (protects against timing attacks)
 *   - Rate-limiting happens AFTER email lookup (timing attack possible)
 *     - Alternative: Always do bcrypt work (constant time) regardless of email
 *     - Current approach: Simpler and adequate for MVP
 * 
 * Token Rotation:
 *   - Each login generates new refresh token
 *   - Reduces window if old token is compromised
 *   - Refresh token stored in database for logout/revocation support
 * 
 * @param {string} email - Parent's email address
 * @param {string} password - Parent's password (plain text)
 * @returns {Promise<object>} { parent, accessToken, refreshToken }
 * @throws {Error} with code 'INVALID_CREDENTIALS' or 'ACCOUNT_LOCKED' if auth fails
 */
async function loginParent(email, password) {
  try {
    // ---- Step 1: Find parent by email ----
    const parent = await prisma.parent.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Note: We check parent existence before password comparison
    // (could also skip this and use bcrypt comparison result as single source of truth)
    if (!parent) {
      // Log failed login attempt (email not found)
      try {
        auditService.logLoginFailure(
          email,
          'EMAIL_NOT_FOUND',
          '' // IP will be added by middleware
        );
      } catch (logErr) {
        console.warn('[AUTH] Audit logging failed:', logErr.message);
      }

      const error = new Error('Invalid credentials');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ---- Step 2: Check if account is locked (rate-limiting) ----
    // If lockedUntil is set and in the future, account is locked
    if (parent.lockedUntil && parent.lockedUntil > new Date()) {
      const error = new Error('Account temporarily locked due to too many failed login attempts. Please try again later.');
      error.code = 'ACCOUNT_LOCKED';
      error.lockedUntil = parent.lockedUntil;
      throw error;
    }

    // ---- Step 3: Compare passwords ----
    // bcrypt.compare is timing-safe (protects against timing attacks)
    // Returns true/false without revealing which part differs
    const isPasswordValid = await bcrypt.compare(password, parent.password);

    if (!isPasswordValid) {
      // ---- Failed Login: Increment attempt counter ----
      // Track consecutive failed attempts for rate-limiting
      const updatedFailedAttempts = parent.failedLoginAttempts + 1;
      
      // Security threshold: lock after 5 failed attempts
      const MAX_FAILED_ATTEMPTS = 5;
      const LOCKOUT_MINUTES = 15;
      
      let lockoutData = {
        failedLoginAttempts: updatedFailedAttempts,
        lastFailedLoginAttempt: new Date(),
      };

      // If exceeded threshold, lock the account
      if (updatedFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutData.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);

        // Log account lockout event
        try {
          auditService.logAccountLockout(
            email,
            updatedFailedAttempts,
            '' // IP will be added by middleware
          );
        } catch (logErr) {
          console.warn('[AUTH] Audit logging failed for lockout:', logErr.message);
        }
      } else {
        // Log failed login attempt (not yet locked)
        try {
          auditService.logLoginFailure(
            email,
            'INVALID_PASSWORD',
            '' // IP will be added by middleware
          );
        } catch (logErr) {
          console.warn('[AUTH] Audit logging failed:', logErr.message);
        }
      }

      // Update database with failed attempt tracking
      await prisma.parent.update({
        where: { id: parent.id },
        data: lockoutData,
      });

      const error = new Error('Invalid credentials');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // ---- Successful Login: Reset failed attempts and generate tokens ----
    // Reset security fields for successful authentication
    const { accessToken, refreshToken } = generateTokens(parent.id, parent.email);

    // Update parent: store refresh token and reset failed attempts
    const updatedParent = await prisma.parent.update({
      where: { id: parent.id },
      data: {
        refreshToken, // Store for logout/revocation support
        failedLoginAttempts: 0, // Reset to 0 on successful login
        lastFailedLoginAttempt: null, // Clear failed attempt timestamp
        lockedUntil: null, // Unlock account (if was locked)
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        createdAt: true,
        // Intentionally exclude sensitive fields
      },
    });

    // Decrypt phone number for response
    const decryptedParent = {
      ...updatedParent,
      phoneNumber: encryptionService.decryptField(updatedParent.phoneNumber, 'PHONE'),
    };

    // Log successful login
    try {
      auditService.logLoginSuccess(
        parent.id,
        email,
        '' // IP will be added by middleware
      );
    } catch (logErr) {
      console.warn('[AUTH] Audit logging failed for login success:', logErr.message);
    }

    return {
      parent: decryptedParent,
      accessToken,
      refreshToken,
    };

  } catch (err) {
    throw err;
  }
}

/**
 * Refresh/rotate the access token using a valid refresh token.
 * 
 * Workflow:
 *   1. Verify the refresh token (check signature and expiration)
 *   2. Extract parent ID from token payload
 *   3. Verify parent still exists in database
 *   4. Generate new access token (short-lived)
 *   5. Optionally rotate refresh token (generate new one)
 *   6. Return new tokens
 * 
 * Token Rotation Strategy:
 *   - Current: Issue new access token only (refresh token stays same)
 *   - Alternative: Issue both new access and refresh token (maximum security)
 *   - See commented "Option B" below for max-rotation strategy
 * 
 * Security Considerations:
 *   - Prevents attackers from using stolen access token indefinitely
 *   - Limits damage if refresh token is compromised
 *   - Can implement blacklist to revoke tokens
 * 
 * @param {string} refreshToken - JWT refresh token from client
 * @returns {Promise<object>} { accessToken, refreshToken }
 * @throws {Error} if token is invalid, expired, or parent not found
 */
async function refreshAccessToken(refreshToken) {
  try {
    // ---- Step 1: Verify token signature and expiration ----
    // jwt.verify throws if token is invalid or expired
    let payload;
    try {
      payload = jwt.verify(refreshToken, env.jwtSecret);
    } catch (err) {
      // Token verification failed (invalid signature, expired, etc.)
      const error = new Error('Invalid or expired refresh token');
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    // ---- Step 2: Extract parent ID from payload ----
    const parentId = payload.id;
    const parentEmail = payload.email;

    // ---- Step 3: Verify parent still exists ----
    // Prevents issuing tokens for deleted accounts
    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      select: { id: true, email: true, createdAt: true },
    });

    if (!parent) {
      const error = new Error('Parent account not found');
      error.code = 'PARENT_NOT_FOUND';
      throw error;
    }

    // ---- Step 4 & 5: Generate new tokens ----
    // Option A: Rotate only access token (current implementation)
    const newAccessToken = jwt.sign(
      { id: parent.id, email: parent.email },
      env.jwtSecret,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Option B: Maximum rotation (both tokens) - uncomment to implement
    // const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens(parent.id, parent.email);
    // return { accessToken: newAccessToken, refreshToken: newRefreshToken };

    // ---- Step 6: Log token refresh for audit trail ----
    try {
      auditService.logAuditEvent({
        action: auditService.ACTIONS.TOKEN_REFRESH,
        severity: auditService.SEVERITY.LOW,
        resourceType: auditService.RESOURCE_TYPES.PARENT,
        resourceId: parent.id,
        details: `New access token issued for ${parent.email}`,
      });
    } catch (logErr) {
      console.warn('[AUTH] Audit logging failed for token refresh:', logErr.message);
      // Don't throw - token refresh should succeed even if audit log fails
    }

    // ---- Return new access token ----
    return {
      accessToken: newAccessToken,
      refreshToken, // Reuse existing refresh token (Option A)
    };

  } catch (err) {
    throw err;
  }
}

/**
 * Logout a parent by invalidating their refresh token.
 * 
 * Workflow:
 *   1. Find parent by ID
 *   2. Set their refreshToken to null (invalidates current token)
 *   3. Reset failed login attempts (clean slate for next login)
 *   4. Clear account lock (lockedUntil = null)
 *   5. Return confirmation
 * 
 * Security Considerations:
 *   - Invalidates the stored refresh token so client can't use it again
 *   - Even if old token is leaked, it's no longer valid after logout
 *   - IMPORTANT: Access token cannot be revoked (it's stateless)
 *     - Access tokens are short-lived (7 minutes) for this reason
 *     - After logout, client should discard access token
 *     - If access token is still valid, user could use it until expiration
 * 
 * Token Revocation Strategy:
 *   - Refresh Token: Stored in DB, can be revoked immediately ✓
 *   - Access Token: Stateless, cannot be revoked
 *     - Future enhancement: Implement token blacklist/denylist
 *     - For now: Client should clear token after logout
 * 
 * @param {number} parentId - Parent's ID from JWT/database
 * @returns {Promise<object>} { message: "Logout successful" }
 * @throws {Error} if parent not found
 */
async function logoutParent(parentId) {
  try {
    // ---- Step 1: Find parent and invalidate refresh token ----
    // Set refreshToken to null so the old token can't be used
    // Also reset security fields for clean slate
    const parent = await prisma.parent.update({
      where: { id: parentId },
      data: {
        refreshToken: null, // Invalidates current refresh token
        failedLoginAttempts: 0, // Reset failed attempts counter
        lastFailedLoginAttempt: null, // Clear failed attempt timestamp
        lockedUntil: null, // Unlock account (if locked)
      },
      select: {
        id: true,
        email: true,
      },
    });

    // ---- Step 2: Log logout for audit trail ----
    try {
      auditService.logAuditEvent({
        action: auditService.ACTIONS.LOGOUT,
        severity: auditService.SEVERITY.LOW,
        resourceType: auditService.RESOURCE_TYPES.PARENT,
        resourceId: parent.id,
        details: `Parent ${parent.email} logged out and invalidated refresh token`,
      });
    } catch (logErr) {
      console.warn('[AUTH] Audit logging failed for logout:', logErr.message);
      // Don't throw - logout should succeed even if audit log fails
    }

    return {
      message: 'Logout successful',
      parentId: parent.id,
    };

  } catch (err) {
    // Convert Prisma errors to standard error format
    if (err.code === 'P2025') {
      // P2025 = record not found
      const error = new Error('Parent account not found');
      error.code = 'PARENT_NOT_FOUND';
      throw error;
    }
    throw err;
  }
}

/**
 * Verify a JWT token and extract its payload.
 * 
 * Purpose:
 *   - Used by auth middleware to validate incoming requests
 *   - Ensures token hasn't been tampered with (signature verified)
 *   - Ensures token hasn't expired
 * 
 * Returns payload on success, throws on failure.
 * Middleware should catch and return 401 Unauthorized.
 * 
 * @param {string} token - JWT token to verify
 * @returns {object} Token payload { id, email, iat, exp }
 * @throws {Error} if token is invalid or expired
 */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return payload;
  } catch (err) {
    // jwt.verify throws:
    //   - TokenExpiredError: if token has expired
    //   - JsonWebTokenError: if signature is invalid
    // Let middleware handle these (convert to 401 response)
    throw err;
  }
}

/**
 * Generate both access and refresh tokens for a parent.
 * 
 * Helper function to centralize token generation logic.
 * 
 * Tokens include:
 *   - id: Parent's unique identifier (needed for database lookups)
 *   - email: Parent's email (useful for logging, display)
 *   - role: 'PARENT' (supports future RBAC - Role-Based Access Control)
 *   - iat: Issued-at timestamp (automatically added by jwt.sign)
 *   - exp: Expiration timestamp (based on expiresIn)
 * 
 * Note: These are self-contained (stateless) tokens.
 * Server doesn't need to store them; signature proves authenticity.
 * 
 * The 'role' claim enables future authorization checks:
 *   - Middleware can verify role before allowing endpoint access
 *   - Different endpoints can require specific roles
 *   - Supports multi-role systems (PARENT, CHILD, ADMIN, etc.)
 * 
 * @param {number} parentId - Parent's ID from database
 * @param {string} email - Parent's email address
 * @returns {object} { accessToken, refreshToken }
 */
function generateTokens(parentId, email) {
  // Payload includes role for RBAC support
  const payload = {
    id: parentId,
    email,
    role: 'PARENT', // Reserved for future feature: fine-grained authorization
  };

  // Generate short-lived access token (7 minutes)
  // Used for API authentication; must be included in Authorization header
  const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });

  // Generate long-lived refresh token (7 days)
  // Used only to refresh access token; should be stored securely (httpOnly cookie)
  const refreshToken = jwt.sign(payload, env.jwtSecret, { expiresIn: REFRESH_TOKEN_EXPIRY });

  return { accessToken, refreshToken };
}

module.exports = {
  registerParent,
  loginParent,
  logoutParent,
  refreshAccessToken,
  verifyToken,
  generateTokens,
};
