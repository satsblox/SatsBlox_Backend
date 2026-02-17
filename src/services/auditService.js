/**
 * src/services/auditService.js
 *
 * Security Audit Logging Service
 *
 * ============================================
 * AUDIT LOGGING ARCHITECTURE
 * ============================================
 *
 * What is Audit Logging?
 * =======================
 *
 * Audit logging is the practice of recording who did what, when, and from where.
 * Unlike regular application logs (for debugging), audit logs are for security:
 *   - Compliance: Prove you tracked sensitive actions (GDPR, PCI-DSS)
 *   - Investigation: If compromised, who accessed what data?
 *   - Forensics: Reconstruct sequence of events leading to incident
 *   - Alerts: Detect suspicious patterns in real-time
 *
 * SatsBlox Security Events to Log:
 *   1. Authentication Events
 *      - Successful login (parent email, timestamp, IP)
 *      - Failed login attempts (email, timestamp, IP, reason)
 *      - Account lockout (email, timestamp, attempt count)
 *      - Token refresh (parent ID, timestamp, old token invalidated)
 *      - Logout (parent ID, timestamp)
 *
 *   2. Authorization Events
 *      - Unauthorized access attempt (parent X tried to access child Y)
 *      - Role-based access denied (user tried ADMIN action with PARENT role)
 *
 *   3. Sensitive Data Operations
 *      - Child account created (parent ID, child ID, username, timestamp)
 *      - Child account deactivated (parent ID, child ID, reason)
 *      - Wallet balance changed (parent ID, child ID, amount, timestamp)
 *      - Child updated (what fields changed)
 *
 *   4. Account Changes
 *      - Parent profile updated (what fields, timestamp)
 *      - Password changed (parent ID, timestamp)
 *      - Phone number updated (parent ID, timestamp)
 *
 *   5. Encryption/Decryption Failures
 *      - Decryption integrity check failed (POTENTIAL TAMPERING)
 *      - Encryption key error (CRITICAL - system can't encrypt)
 *
 * ============================================
 * STORAGE STRATEGY
 * ============================================
 *
 * Current Implementation (MVP):
 *   - Logs to console (for local development/testing)
 *   - Future: Database table or external service
 *
 * Production Options:
 *   1. Database Table (auditLog)
 *      Pros:
 *        - Queryable (generate reports)
 *        - Transactional with business logic
 *      Cons:
 *        - If DB compromised, logs compromised
 *        - Need to archive old logs (table grows)
 *
 *   2. Sentry (Error Tracking SaaS)
 *      Pros:
 *        - Off-site storage (not compromised if DB breached)
 *        - Real-time alerts
 *        - Web UI for investigation
 *      Cons:
 *        - Third-party risk
 *        - Cost at scale
 *
 *   3. CloudWatch (AWS) or StackDriver (GCP)
 *      Pros:
 *        - Integrated with infrastructure
 *        - Immutable append-only logs
 *        - Long retention
 *      Cons:
 *        - Cloud vendor lock-in
 *        - Need AWS/GCP setup
 *
 *   4. ELK Stack (Elasticsearch + Logstash + Kibana)
 *      Pros:
 *        - Self-hosted (full control)
 *        - Powerful querying and visualization
 *      Cons:
 *        - Operational overhead
 *        - Requires separate infrastructure
 *
 * For SatsBlox MVP:
 *   - Start with console logging (development)
 *   - Add database table when ready for production
 *   - This service abstracts storage, so switching is easy
 *
 * ============================================
 * LOG RETENTION POLICY
 * ============================================
 *
 * Why Retention Matters:
 *   - GDPR: Must keep logs long enough to investigate incidents
 *   - Performance: Old log tables slow down queries
 *   - Storage: Disk space is limited
 *
 * Recommended Policy:
 *   - Real-time logs: Keep in memory/hot storage for 30 days
 *   - Archive: Move to cold storage for 7 years (regulatory compliance)
 *   - Critical events: Keep even longer (account creation, etc.)
 *
 * For SatsBlox:
 *   - Start with 90 days in primary database
 *   - Archive to separate table monthly
 *   - After 7 years, can delete (no regulatory requirement beyond that)
 *
 * ============================================
 * ALERT THRESHOLDS
 * ============================================
 *
 * Some audit events should trigger real-time alerts:
 *
 * CRITICAL (Immediate alert):
 *   - Encryption failures (EBADAUTH = potential tampering)
 *   - Multiple failed logins from same IP (brute force attempt)
 *   - Unauthorized access attempt (parent accessing child not theirs)
 *   - Role mismatch (attempted privilege escalation)
 *
 * HIGH (Within 1 hour):
 *   - Account lockout (user locked out = legitimate user impact)
 *   - Unusual login time (3 AM login from new location)
 *   - Bulk operations (large data exports)
 *
 * MEDIUM (Daily review):
 *   - Regular login events
 *   - Child account creation
 *   - Wallet transactions
 *
 * Implementation:
 *   - Severity field in log entry (CRITICAL, HIGH, MEDIUM, LOW)
 *   - Webhook notifications for CRITICAL
 *   - Daily email digest for HIGH/MEDIUM
 *
 * ============================================
 * DATA PRIVACY IN LOGS
 * ============================================
 *
 * Important: Don't log sensitive data in plaintext!
 *
 * Bad ❌:
 *   "Parent with email parent@example.com logged in"
 *   (Exposes email in production logs)
 *
 * Good ✅:
 *   "Parent ID 1 logged in from IP 192.168.1.1"
 *   (Uses opaque ID, doesn't expose email)
 *
 * PII Never Logged:
 *   ❌ Email addresses (directly)
 *   ❌ Phone numbers (directly)
 *   ❌ Names (in some contexts)
 *   ❌ Passwords or tokens
 *   ❌ Full IP addresses (use masked: 192.168.1.XXX)
 *
 * Safe to Log:
 *   ✅ User IDs (opaque identifiers)
 *   ✅ Action types (action: "LOGIN_SUCCESS")
 *   ✅ Timestamp (when)
 *   ✅ Result (success/failure)
 *   ✅ Generic error messages (not stack traces)
 *
 * For Encrypted Fields:
 *   - Never log encrypted content (it's binary gibberish)
 *   - Log: "phoneNumber field encrypted" (action, not value)
 *   - Log: "Decryption failed for phoneNumber" (issue, not content)
 *
 * ============================================
 * COMPLIANCE & STANDARDS
 * ============================================
 *
 * GDPR (General Data Protection Regulation):
 *   - Requires "appropriate security measures"
 *   - Audit logging demonstrates security
 *   - You can show who accessed what data when
 *   - Supports "accountability principle"
 *
 * Kenya Data Protection Act (KDPA):
 *   - Similar to GDPR, tailored for Kenya
 *   - Requires logging for handling personal data
 *   - M-Pesa phone numbers especially protected
 *
 * PCI-DSS (Payment Card Industry):
 *   - Recommends logging all access to cardholder data
 *   - Even though we don't store payment cards,
 *     principles apply to financial data (wallet balances)
 *
 * ISO 27001 (Information Security):
 *   - Requires audit logging for access control
 *   - Should have centralized log management
 *   - Logs must be protected from tampering
 *
 * ============================================
 * IMPLEMENTATION OPTIONS
 * ============================================
 *
 * Option 1: Centralized Audit Table
 * ===================================
 *
 * Pros:
 *   - All events in one queryable place
 *   - Can join with other tables
 *   - Supports complex queries and reports
 *
 * Cons:
 *   - If DB compromised, logs compromised
 *   - Needs archival strategy for old logs
 *   - Performance: Audit tables grow large
 *
 * Schema Example:
 *   CREATE TABLE auditLog (
 *     id SERIAL PRIMARY KEY,
 *     timestamp TIMESTAMP DEFAULT NOW(),
 *     userId INT,              -- NULL if unauthenticated
 *     action VARCHAR(255),     -- "LOGIN_SUCCESS", "CHILD_CREATED", etc.
 *     resourceType VARCHAR(100),   -- "parent", "child", "wallet"
 *     resourceId INT,          -- ID of resource affected
 *     severity VARCHAR(20),    -- "CRITICAL", "HIGH", "MEDIUM", "LOW"
 *     ipAddress VARCHAR(45),   -- IPv4 or IPv6
 *     result VARCHAR(20),      -- "SUCCESS", "FAILURE", "BLOCKED"
 *     details JSON,            -- Any additional context
 *     createdAt TIMESTAMP DEFAULT NOW(),
 *   );
 *
 * Option 2: Sentry Integration
 * =============================
 *
 * Pros:
 *   - Off-site (not compromised if our DB breached)
 *   - Real-time alerts
 *   - Web dashboard
 *   - Automatic error grouping
 *
 * Cons:
 *   - Third-party risk
 *   - Cost at scale
 *   - Must comply with Sentry privacy policy
 *
 * Usage:
 *   const Sentry = require("@sentry/node");
 *   Sentry.captureEvent({
 *     message: "Failed login attempt",
 *     level: "warning",
 *     tags: { action: "LOGIN_FAILED" },
 *     extra: { parentId, ipAddress },
 *   });
 *
 * Option 3: Structured Logging (Winston/Pino)
 * =============================================
 *
 * Pros:
 *   - Structured log output
 *   - Easy to parse and analyze
 *   - Plugins for Elasticsearch, CloudWatch, etc.
 *   - Can ship to multiple destinations
 *
 * Cons:
 *   - Need to set up log aggregation separately
 *   - Additional infrastructure
 *
 * Usage:
 *   const logger = require("winston");
 *   logger.info("Login successful", {
 *     timestamp: new Date(),
 *     parentId,
 *     ipAddress,
 *     action: "LOGIN_SUCCESS",
 *   });
 *
 * For SatsBlox:
 *   - Use this abstracted service layer
 *   - Can switch implementations without changing business logic
 *   - Start with console for MVP
 *   - Add database table for production
 */

// ============================================
// DEPENDENCIES
// ============================================

// No external dependencies required for MVP
// In production, could integrate with Sentry, Winston, or CloudWatch

// ============================================
// CONSTANTS
// ============================================

// Action types (security events to log)
const ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_ACCOUNT_LOCKED: 'LOGIN_ACCOUNT_LOCKED',
  TOKEN_REFRESH_SUCCESS: 'TOKEN_REFRESH_SUCCESS',
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  LOGOUT_SUCCESS: 'LOGOUT_SUCCESS',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',

  // Authorization
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
  ROLE_CHECK_FAILED: 'ROLE_CHECK_FAILED',
  OWNERSHIP_VERIFICATION_FAILED: 'OWNERSHIP_VERIFICATION_FAILED',

  // Child Management
  CHILD_CREATED: 'CHILD_CREATED',
  CHILD_DEACTIVATED: 'CHILD_DEACTIVATED',
  CHILD_UPDATED: 'CHILD_UPDATED',

  // Wallet Operations
  WALLET_CREATED: 'WALLET_CREATED',
  WALLET_DEPOSIT: 'WALLET_DEPOSIT',
  WALLET_WITHDRAWAL: 'WALLET_WITHDRAWAL',

  // Encryption/Decryption
  ENCRYPTION_FAILURE: 'ENCRYPTION_FAILURE',
  DECRYPTION_FAILURE: 'DECRYPTION_FAILURE',
  DECRYPTION_TAMPERING_DETECTED: 'DECRYPTION_TAMPERING_DETECTED',
};

// Severity levels for security events
const SEVERITY = {
  CRITICAL: 'CRITICAL', // Immediate action required (tampering, access attempts)
  HIGH: 'HIGH',         // Important (failed logins, account lockout)
  MEDIUM: 'MEDIUM',     // Noteworthy (legitimate operations)
  LOW: 'LOW',           // Informational (routine logins)
};

// Resource types affected by actions
const RESOURCE_TYPES = {
  PARENT: 'PARENT',
  CHILD: 'CHILD',
  WALLET: 'WALLET',
  AUTH: 'AUTH',
  ENCRYPTION: 'ENCRYPTION',
};

// Result codes
const RESULT = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  BLOCKED: 'BLOCKED',
};

// ============================================
// AUDIT LOG ENTRY CREATION
// ============================================

/**
 * Create and store an audit log entry
 *
 * This is the main entry point for security event logging.
 * In MVP: Logs to console
 * In Production: Store to database/Sentry/CloudWatch
 *
 * Security Event Structure:
 *   timestamp: When did this happen?
 *   action: What action occurred? (LOGIN_SUCCESS, CHILD_CREATED, etc.)
 *   userId: Who did it? (parentId, NULL if unauthenticated)
 *   resourceType: What resource was affected? (PARENT, CHILD, WALLET)
 *   resourceId: Which record? (e.g., childId=10, parentId=1)
 *   severity: How urgent? (CRITICAL, HIGH, MEDIUM, LOW)
 *   result: Did it succeed or fail? (SUCCESS, FAILURE, BLOCKED)
 *   ipAddress: Where did it come from? (IP address of client)
 *   userAgent: What device? (Browser, mobile app, API client)
 *   details: Additional context (JSON object)
 *
 * @param {object} options - Configuration object
 * @param {string} options.action - Action type (use ACTIONS constants)
 * @param {integer} options.userId - ID of user performing action (parentId)
 * @param {string} options.resourceType - Type of resource (use RESOURCE_TYPES)
 * @param {integer} options.resourceId - ID of affected resource
 * @param {string} options.severity - Severity level (use SEVERITY constants)
 * @param {string} options.result - SUCCESS, FAILURE, or BLOCKED
 * @param {string} options.ipAddress - Client IP address
 * @param {string} options.userAgent - Client user agent (browser, app, etc.)
 * @param {object} options.details - Additional context as JSON
 *
 * @returns {object} The audit log entry created
 *
 * @example
 * // User successfully logged in
 * logAuditEvent({
 *   action: ACTIONS.LOGIN_SUCCESS,
 *   userId: 1,
 *   resourceType: RESOURCE_TYPES.PARENT,
 *   resourceId: 1,
 *   severity: SEVERITY.LOW,
 *   result: RESULT.SUCCESS,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   details: {
 *     loginMethod: 'email_password',
 *     sessionDuration: 86400, // seconds
 *   },
 * });
 *
 * @example
 * // Unauthorized access attempt detected
 * logAuditEvent({
 *   action: ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
 *   userId: 1,
 *   resourceType: RESOURCE_TYPES.CHILD,
 *   resourceId: 20,  // Child that doesn't belong to parent 1
 *   severity: SEVERITY.CRITICAL,
 *   result: RESULT.BLOCKED,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   details: {
 *     reason: 'Child does not belong to parent',
 *     attemptedAccessPath: 'GET /api/family/children/20',
 *   },
 * });
 */
function logAuditEvent(options) {
  // ---- Validate required fields ----
  const required = ['action', 'resourceType', 'result', 'severity'];
  for (const field of required) {
    if (!options[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // ---- Build audit log entry ----
  const auditEntry = {
    // Timestamp when event occurred
    timestamp: new Date().toISOString(),

    // Action: What happened?
    action: options.action,

    // User: Who did it? (NULL if unauthenticated)
    userId: options.userId || null,

    // Resource: What was affected?
    resourceType: options.resourceType,
    resourceId: options.resourceId || null,

    // Severity: How urgent?
    severity: options.severity,

    // Result: Success or failure?
    result: options.result,

    // Client: Where from?
    ipAddress: options.ipAddress || 'UNKNOWN',
    userAgent: options.userAgent || 'UNKNOWN',

    // Context: Any additional info?
    details: options.details || {},

    // Environment
    environment: process.env.NODE_ENV || 'development',
  };

  // ---- Store/Send audit log ----
  // MVP: Log to console
  // Production: Store to database, send to Sentry, etc.

  // Different formatting based on severity
  if (auditEntry.severity === SEVERITY.CRITICAL) {
    // CRITICAL: Use console.error (highest visibility)
    console.error('[AUDIT_CRITICAL]', JSON.stringify(auditEntry, null, 2));
  } else if (auditEntry.severity === SEVERITY.HIGH) {
    // HIGH: Use console.warn
    console.warn('[AUDIT_HIGH]', JSON.stringify(auditEntry, null, 2));
  } else {
    // MEDIUM/LOW: Use console.log
    console.log('[AUDIT]', JSON.stringify(auditEntry));
  }

  // ---- Future: Send to external services ----
  // Example - Send CRITICAL events to Slack webhook:
  /*
  if (auditEntry.severity === SEVERITY.CRITICAL) {
    sendToSlack({
      text: `🚨 CRITICAL SECURITY EVENT: ${auditEntry.action}`,
      details: auditEntry,
    });
  }
  */

  // ---- Future: Store in database ----
  // Example - Save to auditLog table:
  /*
  await prisma.auditLog.create({
    data: auditEntry,
  });
  */

  return auditEntry;
}

// ============================================
// CONVENIENCE FUNCTIONS (SECURITY EVENT SHORTCUTS)
// ============================================

/**
 * Log successful login attempt
 *
 * @param {integer} parentId - Parent account ID
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - Client user agent
 */
function logLoginSuccess(parentId, ipAddress, userAgent) {
  return logAuditEvent({
    action: ACTIONS.LOGIN_SUCCESS,
    userId: parentId,
    resourceType: RESOURCE_TYPES.AUTH,
    resourceId: parentId,
    severity: SEVERITY.LOW,
    result: RESULT.SUCCESS,
    ipAddress,
    userAgent,
    details: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log failed login attempt
 *
 * @param {string} email - Email address attempted
 * @param {string} reason - Why it failed (invalid_password, account_locked, etc.)
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - Client user agent
 * @param {integer} failureCount - How many failures so far?
 */
function logLoginFailure(email, reason, ipAddress, userAgent, failureCount = 1) {
  return logAuditEvent({
    action: ACTIONS.LOGIN_FAILED,
    userId: null, // Not authenticated yet
    resourceType: RESOURCE_TYPES.AUTH,
    severity: failureCount >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    result: RESULT.FAILURE,
    ipAddress,
    userAgent,
    details: {
      email, // Masked or hashed in production
      reason,
      failureCount,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log account lockout (after too many failed attempts)
 *
 * @param {string} email - Email of locked account
 * @param {integer} failureCount - Number of failures before lockout
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - Client user agent
 */
function logAccountLockout(email, failureCount, ipAddress, userAgent) {
  return logAuditEvent({
    action: ACTIONS.LOGIN_ACCOUNT_LOCKED,
    userId: null,
    resourceType: RESOURCE_TYPES.AUTH,
    severity: SEVERITY.HIGH,
    result: RESULT.BLOCKED,
    ipAddress,
    userAgent,
    details: {
      email,
      failureCount,
      lockDuration: '15 minutes',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log successful token refresh
 *
 * @param {integer} parentId - Parent account ID
 * @param {string} ipAddress - Client IP
 */
function logTokenRefreshSuccess(parentId, ipAddress) {
  return logAuditEvent({
    action: ACTIONS.TOKEN_REFRESH_SUCCESS,
    userId: parentId,
    resourceType: RESOURCE_TYPES.AUTH,
    severity: SEVERITY.LOW,
    result: RESULT.SUCCESS,
    ipAddress,
    details: {
      parentId,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log unauthorized access attempt
 *
 * @param {integer} parentId - Parent trying to access
 * @param {integer} targetChildId - Child they're trying to access
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - Client user agent
 */
function logUnauthorizedAccessAttempt(parentId, targetChildId, ipAddress, userAgent) {
  return logAuditEvent({
    action: ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
    userId: parentId,
    resourceType: RESOURCE_TYPES.CHILD,
    resourceId: targetChildId,
    severity: SEVERITY.CRITICAL, // This is a security threat
    result: RESULT.BLOCKED,
    ipAddress,
    userAgent,
    details: {
      parentId,
      targetChildId,
      reason: 'Parent attempted to access child not belonging to them',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log child account creation
 *
 * @param {integer} parentId - Parent creating child
 * @param {integer} childId - New child ID
 * @param {string} childUsername - Child username
 */
function logChildCreated(parentId, childId, childUsername) {
  return logAuditEvent({
    action: ACTIONS.CHILD_CREATED,
    userId: parentId,
    resourceType: RESOURCE_TYPES.CHILD,
    resourceId: childId,
    severity: SEVERITY.MEDIUM,
    result: RESULT.SUCCESS,
    details: {
      parentId,
      childId,
      childUsername,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log child account deactivation
 *
 * @param {integer} parentId - Parent deactivating
 * @param {integer} childId - Child being deactivated
 * @param {string} childUsername - Child username
 */
function logChildDeactivated(parentId, childId, childUsername) {
  return logAuditEvent({
    action: ACTIONS.CHILD_DEACTIVATED,
    userId: parentId,
    resourceType: RESOURCE_TYPES.CHILD,
    resourceId: childId,
    severity: SEVERITY.MEDIUM,
    result: RESULT.SUCCESS,
    details: {
      parentId,
      childId,
      childUsername,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log encryption failure (data protection issue)
 *
 * @param {string} fieldType - What field failed (PHONE, NAME, etc.)
 * @param {Error} error - The error
 */
function logEncryptionFailure(fieldType, error) {
  return logAuditEvent({
    action: ACTIONS.ENCRYPTION_FAILURE,
    resourceType: RESOURCE_TYPES.ENCRYPTION,
    severity: SEVERITY.CRITICAL, // Encryption failure is serious
    result: RESULT.FAILURE,
    details: {
      fieldType,
      errorMessage: error.message,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log decryption failure (potential tampering)
 *
 * @param {string} fieldType - What field failed
 * @param {Error} error - The error
 */
function logDecryptionFailure(fieldType, error) {
  // Check if it's a tamper alert
  const isTampering = error.message.includes('BADAUTH');

  return logAuditEvent({
    action: isTampering
      ? ACTIONS.DECRYPTION_TAMPERING_DETECTED
      : ACTIONS.DECRYPTION_FAILURE,
    resourceType: RESOURCE_TYPES.ENCRYPTION,
    severity: isTampering ? SEVERITY.CRITICAL : SEVERITY.HIGH,
    result: RESULT.FAILURE,
    details: {
      fieldType,
      isTampering,
      errorMessage: error.message,
      implication: isTampering
        ? 'Possible data tampering or wrong encryption key'
        : 'Decryption failed',
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log logout
 *
 * @param {integer} parentId - Parent logging out
 * @param {string} ipAddress - Client IP
 */
function logLogoutSuccess(parentId, ipAddress) {
  return logAuditEvent({
    action: ACTIONS.LOGOUT_SUCCESS,
    userId: parentId,
    resourceType: RESOURCE_TYPES.AUTH,
    severity: SEVERITY.LOW,
    result: RESULT.SUCCESS,
    ipAddress,
    details: {
      parentId,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log role check failure (authorization failure)
 *
 * @param {integer} parentId - User attempting action
 * @param {string} requiredRole - What role was required (PARENT, ADMIN, etc.)
 * @param {string} userRole - What role they actually have
 * @param {string} ipAddress - Client IP
 */
function logRoleCheckFailed(parentId, requiredRole, userRole, ipAddress) {
  return logAuditEvent({
    action: ACTIONS.ROLE_CHECK_FAILED,
    userId: parentId,
    resourceType: RESOURCE_TYPES.AUTH,
    severity: SEVERITY.HIGH, // Authorization failure is concerning
    result: RESULT.BLOCKED,
    ipAddress,
    details: {
      parentId,
      requiredRole,
      userRole,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main logging function
  logAuditEvent,

  // Convenience functions for common events
  logLoginSuccess,
  logLoginFailure,
  logAccountLockout,
  logTokenRefreshSuccess,
  logUnauthorizedAccessAttempt,
  logChildCreated,
  logChildDeactivated,
  logEncryptionFailure,
  logDecryptionFailure,
  logLogoutSuccess,
  logRoleCheckFailed,

  // Constants for use in application
  ACTIONS,
  SEVERITY,
  RESOURCE_TYPES,
  RESULT,
};
