/**
 * src/middleware/authorizeRoles.js
 *
 * Role-Based Access Control (RBAC) Middleware
 *
 * ============================================
 * ROLE-BASED ACCESS CONTROL (RBAC) ARCHITECTURE
 * ============================================
 *
 * What is RBAC?
 * ==============
 *
 * RBAC is an authorization model that assigns users to roles, and roles to permissions.
 *
 * Traditional Permission Model (Fragile):
 *   User → Permission
 *   - "John can DELETE_CHILD"
 *   - "Sarah can DELETE_CHILD"
 *   - "Ahmed can DELETE_CHILD"
 *   Problem: If you want to revoke DELETE_CHILD, must update 3 users
 *   Problem: Doesn't scale (100 users × 50 permissions = 5000 rules to manage)
 *
 * RBAC Model (Scalable):
 *   User → Role → Permissions
 *   - Role "ADMIN" has permissions: [DELETE_CHILD, VIEW_REPORTS, etc.]
 *   - John has role "ADMIN"
 *   - Sarah has role "ADMIN"
 *   - Ahmed has role "ADMIN"
 *   Benefit: Change ADMIN permissions once, affects all ADMIN users
 *   Benefit: Can have unlimited users in each role
 *
 * ============================================
 * SATSBLOX ROLE STRUCTURE
 * ============================================
 *
 * Current Roles (MVP):
 *
 * 1. PARENT
 *    Permissions:
 *      - Create child accounts (POST /api/family/children)
 *      - View own children (GET /api/family/children)
 *      - View own child details (GET /api/family/children/:childId)
 *      - Deactivate own child (PATCH /api/family/children/:childId/deactivate)
 *      - View family dashboard (GET /api/family/children/dashboard)
 *      - Logout (POST /api/auth/logout)
 *    Cannot:
 *      - View other parents' children
 *      - Delete children (only soft-delete/deactivate)
 *      - Access ADMIN functions
 *
 * Future Roles (Not MVP):
 *
 * 2. CHILD (Future)
 *    Permissions:
 *      - View own wallet balance
 *      - View transaction history
 *      - Submit withdrawal requests
 *    Cannot:
 *      - Create other child accounts
 *      - Delete accounts
 *      - Access parent functions
 *
 * 3. ADMIN (Future)
 *    Permissions:
 *      - View all parents' data
 *      - View all children's data
 *      - Delete users
 *      - Unlock accounts
 *      - Generate reports
 *      - Access system logs
 *    Security: Ultra-restricted, multi-factor auth required
 *
 * ============================================
 * JWT ROLE CLAIM
 * ============================================
 *
 * JWT Token Structure:
 * {
 *   "sub": "parent@example.com",   // Subject (user identifier)
 *   "id": 1,                       // User ID
 *   "role": "PARENT",              // Role claim ← checked by this middleware
 *   "iat": 1613000000,             // Issued at
 *   "exp": 1613100000,             // Expiration
 * }
 *
 * Role Claim:
 *   - Added during login (authService.generateTokens)
 *   - Included in JWT signed data
 *   - Cannot be modified without valid signing key (tamper-proof)
 *   - Verified by authMiddleware, checked by authorizeRoles
 *
 * Security Implication:
 *   - Client cannot simply claim to be ADMIN
 *   - Even if attacker modifies their local token,
 *     server will reject it (signature invalid)
 *   - Server only trusts roles in JWT signed by server key
 *
 * ============================================
 * AUTHORIZATION FLOW
 * ============================================
 *
 * Example: Parent tries to DELETE /api/family/children
 *
 * 1. Request arrives: DELETE /api/family/children/10
 *    Headers: { Authorization: "Bearer TOKEN123..." }
 *
 * 2. authMiddleware runs (first):
 *    - Validates JWT signature (is token from our server?)
 *    - Extracts payload: { id: 1, role: "PARENT" }
 *    - Attaches to req.user: { id: 1, role: "PARENT" }
 *
 * 3. authorizeRoles runs (second):
 *    - This middleware!
 *    - Checks: Does this role have permission?
 *    - If YES: Continue to route handler
 *    - If NO: Return 403 Forbidden (don't show error details)
 *
 * 4. Handler runs (third):
 *    - Further checks ownership (verifyParentalLink)
 *    - Executes business logic
 *
 * If any step fails:
 *   - authMiddleware: 401 Unauthorized
 *   - authorizeRoles: 403 Forbidden
 *   - verifyParentalLink: 404 Not Found (info hiding)
 *
 * ============================================
 * PERMISSION RESOLUTION
 * ============================================
 *
 * Method 1: Permission Strings (Simple)
 * ======================================
 *
 * authorizeRoles(['DELETE_CHILD', 'EDIT_CHILD'])(req, res, next)
 *
 * Pros:
 *   - Simple to understand
 *   - Fine-grained control
 *
 * Cons:
 *   - Need to enumerate all permissions
 *   - Hard to maintain permission list
 *   - Easy to miss a permission
 *
 * Method 2: Role-Based (This Implementation)
 * ==========================================
 *
 * authorizeRoles(['PARENT', 'ADMIN'])(req, res, next)
 *
 * Pros:
 *   - Easier to manage (fewer roles than permissions)
 *   - Roles are semantic (PARENT meaningful than DELETE_CHILD)
 *   - Can assign multiple roles to user
 *
 * Cons:
 *   - Each route needs to specify allowed roles
 *   - Must maintain role→permission mapping
 *
 * Current Implementation:
 *   - Role-based (check if user has required role)
 *   - Simple PARENT vs. ADMIN split
 *   - Easy to extend for CHILD, GUARDIAN, etc.
 *
 * Future: Permission Matrix
 *   Could build more sophisticated model:
 *   const rolePermissions = {
 *     PARENT: ['CREATE_CHILD', 'VIEW_CHILD', 'LOGOUT'],
 *     CHILD: ['VIEW_OWN_WALLET', 'REQUEST_WITHDRAWAL'],
 *     ADMIN: ['*'], // All permissions
 *   };
 *
 * ============================================
 * ERROR HANDLING & INFORMATION HIDING
 * ============================================
 *
 * Bad ❌:
 *   "User with role PARENT cannot DELETE_CHILD"
 *   (Reveals exact permission structure)
 *
 * Good ✅:
 *   "Forbidden (403)"
 *   (Generic message, attacker learns nothing)
 *
 * Principle of Least Information:
 *   - Don't tell attacker what permissions exist
 *   - Don't tell attacker what role they have
 *   - Don't tell attacker what permissions they're missing
 *   - Generic 403 response for all authorization failures
 *
 * For Debugging:
 *   - Log details server-side (console/audit log)
 *   - Send generic message to client
 *
 * ============================================
 * MULTIPLE ROLES SUPPORT
 * ============================================
 *
 * Users Can Have Multiple Roles:
 *   - Parent who is also an admin (PARENT + ADMIN)
 *   - Child who is also a tutor (CHILD + TUTOR)
 *
 * JWT Can Store Array:
 * {
 *   "id": 1,
 *   "roles": ["PARENT", "ADMIN"],  ← Array of roles
 *   "exp": 1613100000,
 * }
 *
 * Middleware Checks:
 * if (allowedRoles.some(role => userRoles.includes(role))) {
 *   // User has at least one required role
 *   next();
 * }
 *
 * Example:
 *   Route requires: authorizeRoles(['PARENT', 'ADMIN'])
 *   User has: ['PARENT']
 *   Result: ALLOWED (has PARENT)
 *
 *   Route requires: authorizeRoles(['ADMIN'])
 *   User has: ['PARENT']
 *   Result: BLOCKED (doesn't have ADMIN)
 *
 * Current Implementation:
 *   - Supports single role (req.user.role)
 *   - Easy to extend to multiple roles
 *   - JWT structure set in authService.generateTokens
 *
 * ============================================
 * OWNERSHIP + ROLE SEPARATION
 * ============================================
 *
 * Important Distinction:
 *
 * Role-Based Access Control (RBAC):
 *   - Answers: "Can this user type do this action?"
 *   - Example: "Can PARENT access /api/family/children?"
 *   - Answer: YES (any parent can)
 *   - Checked by: authorizeRoles middleware
 *
 * Ownership Verification:
 *   - Answers: "Can THIS parent access THEIR children?"
 *   - Example: "Can Parent#1 access Child#10?"
 *   - Answer: Only if they own Child#10
 *   - Checked by: verifyParentalLink middleware
 *
 * Layered Security:
 *   1. Is user authenticated? (authMiddleware)
 *   2. Does user's role allow this action? (authorizeRoles)
 *   3. Does user own this specific resource? (verifyParentalLink)
 *
 * Example Flow:
 *   Request: GET /api/family/children/10
 *   User: Parent#1 (role: PARENT)
 *   Child#10 ownership: Parent#2
 *
 *   Check 1: Authenticated? YES (valid JWT)
 *   Check 2: PARENT role can GET /api/family/children/:id? YES
 *   Check 3: Parent#1 owns Child#10? NO
 *   Result: 404 Not Found (return while lying about child existence)
 *
 * ============================================
 * PRIVILEGE ESCALATION PREVENTION
 * ============================================
 *
 * Threat: User tries to claim higher role
 * Attack Vectors:
 *
 * Vector 1: Modify JWT (Defeated by Signature)
 * ============================================
 * Attacker: "I'll change my role to ADMIN"
 * Payload:  {
 *   "id": 1,
 *   "role": "ADMIN",
 *   "iat": 1613000000,
 * }
 * Signature: HMACSHA256(base64header + base64payload, SECRET)
 *
 * Result: Signature is now INVALID (attacker doesn't have SECRET)
 * Response: 401 Unauthorized (invalid token)
 * Prevention: JWT signature verification (authMiddleware does this)
 *
 * Vector 2: Send Old Token with ADMIN Role (Defeated by Expiration)
 * ==================================================================
 * Attacker: "I once had ADMIN access, here's old token"
 * Problem: Old token might have ADMIN claim but be expired
 * Check 1: Is token expired? YES → 401 Unauthorized
 * Prevention: JWT expiration validation (authMiddleware does this)
 *
 * Vector 3: Token Replay Attack (Defeated by HTTPS + Token Rotation)
 * ===================================================================
 * Attacker: "I'll steal user's token and use it as them"
 * Problem: Attacker can indeed use token
 * Mitigations:
 *   - HTTPS: Encrypts token in transit
 *   - Short expiration: Token only valid 15 minutes
 *   - Token rotation: Each refresh gets new token
 *   - Refresh token rotation: Can't reuse old refresh token
 * Prevention: These implemented in authService
 *
 * Vector 4: Role Claim Injection (Defeated by Secure Processing)
 * ================================================================
 * Attacker: "What if server doesn't properly verify JWT?"
 * Problem: If authMiddleware doesn't verify, attacker wins
 * Defense: Strict JWT verification with validated library
 * Prevention: Implemented in authMiddleware
 *
 * ============================================
 * AUDIT LOGGING INTEGRATION
 * ============================================
 *
 * This middleware should log authorization checks:
 *   - When user lacks required role
 *   - Repeated failures from same IP (potential brute force)
 *   - Specific pattern checks (e.g., ADMIN access attempts by PARENT)
 *
 * Logged Information:
 *   - User ID
 *   - Required role
 *   - User's actual role
 *   - Endpoint attempted
 *   - IP address
 *   - Timestamp
 *
 * Integration with auditService:
 *   - logRoleCheckFailed() function already exists
 *   - Call it when authorization fails
 *   - Helps detect privilege escalation attempts
 */

// ============================================
// DEPENDENCIES
// ============================================

// For audit logging
const auditService = require('../services/auditService');

// ============================================
// CONSTANTS
// ============================================

// HTTP Status Codes
const HTTP_STATUS = {
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

// ============================================
// ROLE CONSTANTS
// ============================================

// Roles in SatsBlox
const ROLES = {
  PARENT: 'PARENT',      // Parent/Guardian
  CHILD: 'CHILD',        // Child account (future)
  ADMIN: 'ADMIN',        // System administrator (future)
  GUARDIAN: 'GUARDIAN',  // Grandparent/other guardian (future)
};

// ============================================
// AUTHORIZATION RULES
// ============================================

// Define which roles can access which endpoints
// Used as reference for understanding the system
// Each route explicitly specifies allowed roles via middleware
const ROLE_PERMISSIONS = {
  [ROLES.PARENT]: [
    'POST /api/family/children',           // Create child
    'GET /api/family/children',            // List children
    'GET /api/family/children/:childId',   // View child details
    'PATCH /api/family/children/:childId/deactivate', // Deactivate child
    'GET /api/family/children/dashboard',  // View family dashboard
    'POST /api/auth/logout',               // Logout
    'POST /api/auth/refresh',              // Refresh token
  ],
  [ROLES.CHILD]: [
    // Future: Child-specific endpoints
  ],
  [ROLES.ADMIN]: [
    // All endpoints (admin can do everything)
  ],
};

// ============================================
// RBAC MIDDLEWARE FACTORY
// ============================================

/**
 * Create an authorization middleware that enforces role-based access control
 *
 * This is a HIGHER-ORDER MIDDLEWARE (middleware that returns middleware).
 * It allows dynamic configuration of allowed roles per route.
 *
 * How It Works:
 *   1. authorizeRoles(['PARENT']) returns a middleware function
 *   2. Express calls that middleware for each request
 *   3. Middleware checks: Does user have required role?
 *   4. If YES: Call next() to continue
 *   5. If NO: Send 403 Forbidden and stop
 *
 * Why Higher-Order?
 *   - Allows different routes to require different roles
 *   - Clean route configuration: app.get('/api/admin', authorizeRoles(['ADMIN']))
 *   - Avoids repeating role-check logic in every handler
 *
 * @param {string|string[]} allowedRoles - Role or list of roles that can access this route
 *                                          User must have at least one of these roles
 *
 * @returns {function} Middleware function that checks roles
 *
 * @example
 * // Allow only PARENT role
 * app.post(
 *   '/api/family/children',
 *   authMiddleware.authenticate,           // Check authentication first
 *   authorizeRoles('PARENT'),              // Then check role
 *   childController.createChild
 * );
 *
 * @example
 * // Allow PARENT or ADMIN
 * app.get(
 *   '/api/reports',
 *   authMiddleware.authenticate,
 *   authorizeRoles(['PARENT', 'ADMIN']),   // Multiple roles
 *   reportController.generateReport
 * );
 */
function authorizeRoles(allowedRoles) {
  // ---- Normalize input ----
  // If single string provided, convert to array
  // If already array, use as-is
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  // ---- Return the middleware function ----
  // This function is what Express calls for each request
  return (req, res, next) => {
    // ---- Check if user is authenticated ----
    // This middleware assumes authMiddleware ran first and populated req.user
    // If req.user doesn't exist: user is not authenticated
    if (!req.user) {
      // ---- User not authenticated ----
      // Return 401 Unauthorized (not 403)
      // 401 = "you must log in"
      // 403 = "you're logged in but don't have permission"
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        message: 'Authentication required. Please log in.',
        error: 'UNAUTHENTICATED',
      });
    }

    // ---- Extract user's role from JWT ----
    // During login (authService.generateTokens), role is added to JWT
    // authMiddleware extracts JWT and attaches req.user
    // req.user.role should contain: "PARENT", "ADMIN", "CHILD", etc.
    const userRole = req.user.role;

    // ---- Validate user has role claim ----
    // If no role in JWT: Suspicious (shouldn't happen)
    // Might indicate tampered token or incomplete login
    if (!userRole) {
      console.warn('[RBAC] User has no role claim in JWT:', {
        userId: req.user.id,
        ip: req.ip,
        endpoint: req.path,
      });

      // Return 403 Forbidden (don't mention role issue to client)
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Forbidden',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // ---- Check if user's role is in allowed roles ----
    // If user has required role: Allow
    // If not: Deny
    if (!roles.includes(userRole)) {
      // ---- Role check failed ----
      // Log for audit trail and security monitoring
      auditService.logRoleCheckFailed(
        req.user.id,
        roles.join(', '), // Required roles
        userRole,         // User's actual role
        req.ip            // Client IP
      );

      // Log to console for (RBAC violations are suspicious)
      console.warn('[RBAC] Role check failed:', {
        userId: req.user.id,
        userRole,
        requiredRoles: roles,
        endpoint: req.path,
        method: req.method,
        ip: req.ip,
      });

      // ---- Return 403 Forbidden ----
      // Info hiding principle: Don't tell attacker what role they have
      // Don't tell them what role is required
      // Just: "You don't have permission"
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: 'Forbidden',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // ---- Role check passed ----
    // User has required role, continue to next middleware/handler
    // Note: Further checks might fail (e.g., ownership verification)
    // But from RBAC perspective, this user is authorized

    // Optional: Log successful authorization (for analytics)
    // Commented out to reduce log noise (only log failures)
    // console.log('[RBAC] Role check passed:', {
    //   userId: req.user.id,
    //   userRole,
    //   endpoint: req.path,
    // });

    // Continue to next middleware
    next();
  };
}

// ============================================
// SHORTHAND MIDDLEWARE FUNCTIONS
// ============================================

/**
 * Require PARENT role
 *
 * Usage: app.get('/endpoint', requireParent, handler)
 */
const requireParent = authorizeRoles(ROLES.PARENT);

/**
 * Require ADMIN role
 *
 * Usage: app.delete('/endpoint', requireAdmin, handler)
 */
const requireAdmin = authorizeRoles(ROLES.ADMIN);

/**
 * Require PARENT or ADMIN role
 *
 * Usage: app.get('/endpoint', requireParentOrAdmin, handler)
 */
const requireParentOrAdmin = authorizeRoles([ROLES.PARENT, ROLES.ADMIN]);

// ============================================
// ROLE UTILITY FUNCTIONS
// ============================================

/**
 * Check if a string is a valid role
 *
 * Useful for validation or debugging
 *
 * @param {string} role - Role to check
 * @returns {boolean} True if valid role
 *
 * @example
 * if (isValidRole(req.body.role)) {
 *   // Safe to use this role
 * }
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Get description of a role
 *
 * For APIs, admin interfaces, etc.
 *
 * @param {string} role - Role identifier
 * @returns {object} Description of role, or null
 *
 * @example
 * const desc = getRoleDescription(ROLES.PARENT);
 * // Returns: { name: "Parent", permissions: [...], description: "..." }
 */
function getRoleDescription(role) {
  const descriptions = {
    [ROLES.PARENT]: {
      id: ROLES.PARENT,
      name: 'Parent/Guardian',
      description: 'Can create child accounts, view family data, manage wallets',
      permissions: ROLE_PERMISSIONS[ROLES.PARENT],
    },
    [ROLES.CHILD]: {
      id: ROLES.CHILD,
      name: 'Child',
      description: 'Can view own wallet and savings goals (future)',
      permissions: ROLE_PERMISSIONS[ROLES.CHILD],
    },
    [ROLES.ADMIN]: {
      id: ROLES.ADMIN,
      name: 'Administrator',
      description: 'Full system access for managing platform',
      permissions: ROLE_PERMISSIONS[ROLES.ADMIN],
    },
  };

  return descriptions[role] || null;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main middleware factory
  authorizeRoles,

  // Shorthand middleware
  requireParent,
  requireAdmin,
  requireParentOrAdmin,

  // Utilities
  isValidRole,
  getRoleDescription,

  // Constants
  ROLES,
  ROLE_PERMISSIONS,
};
