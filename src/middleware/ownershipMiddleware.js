/**
 * src/middleware/ownershipMiddleware.js
 * 
 * Parental ownership verification middleware for family resources.
 * 
 * Purpose:
 *   - Enforce parental ownership of child accounts
 *   - Prevent Parent A from accessing Parent B's children
 *   - Validate resource ownership before controller logic runs
 *   - Protect sensitive child data (wallet balance, savings, etc.)
 * 
 * Architecture:
 *   - Applied to routes that access specific children
 *   - Runs after authentication middleware (req.user is available)
 *   - Queries database for child-parent relationship
 *   - Returns 403 Forbidden if parent doesn't own child
 * 
 * Usage Pattern:
 *   router.get(
 *     '/api/family/children/:childId',
 *     authenticate,              // Verify JWT token
 *     verifyParentalLink,         // Verify ownership
 *     childController.getChild    // Only runs if ownership is valid
 *   );
 * 
 * Security Model:
 *   - Assumes authMiddleware has already validated JWT
 *   - Checks parentId from token matches child's parentId in DB
 *   - Prevents both direct attacks and authorization bypass
 *   - Logs suspicious access attempts for audit trail
 */

const { prisma } = require('../config/db');

/**
 * Middleware factory function for verifying parental link.
 * 
 * Creates a reusable middleware function that accepts a parameter name
 * for the child ID in the request (usually from URL params or query).
 * 
 * Pattern:
 *   - Pass the request parameter name where childId is located
 *   - Middleware will extract it and verify ownership
 *   - Common use: 'childId' from /api/family/children/:childId
 * 
 * Flow:
 *   1. Extract childId from request params/query
 *   2. Get authenticated parent ID from JWT (req.user.id)
 *   3. Query database for child record
 *   4. Verify child exists and belongs to authenticated parent
 *   5. If valid, attach child to request and call next()
 *   6. If invalid, return 403 Forbidden with appropriate error
 * 
 * Error Cases:
 *   - 400 Bad Request: Missing childId parameter
 *   - 404 Not Found: Child doesn't exist (or doesn't belong to parent)
 *   - 403 Forbidden: Child exists but belongs to different parent (spoofing attempt)
 *   - 500 Server Error: Database query error
 * 
 * Security Notes:
 *   - Distinguishing 404 vs 403 can leak information (information disclosure)
 *   - Current approach: Returns 404 for all ownership mismatches
 *   - This prevents attackers from enumerating valid childIds
 *   - Trade-off: Less detailed error message, but better security
 * 
 * @param {string} paramName - Request parameter name containing childId (default: 'childId')
 * @returns {function} Express middleware function
 * 
 * @example
 *   // Use in routes
 *   router.get(
 *     '/children/:childId',
 *     authenticate,
 *     verifyParentalLink('childId'),
 *     controller.getChild
 *   );
 */
function verifyParentalLink(paramName = 'childId') {
  // Return the actual middleware function
  return async (req, res, next) => {
    try {
      // ---- Step 1: Extract childId from request ----
      // Support both URL params and query strings
      const childId = req.params[paramName] || req.query[paramName];

      if (!childId) {
        // Missing parameter - client error
        return res.status(400).json({
          message: `Missing required parameter: ${paramName}`,
        });
      }

      // Parse childId as integer (child IDs are integers in database)
      const childIdInt = parseInt(childId, 10);
      if (isNaN(childIdInt)) {
        // Invalid format (not a number)
        return res.status(400).json({
          message: `Invalid ${paramName} format. Must be a number.`,
        });
      }

      // ---- Step 2: Get authenticated parent ID from JWT ----
      // authMiddleware should have already verified the token
      // and attached user info to req.user
      const parentId = req.user?.id;

      if (!parentId) {
        // This shouldn't happen if authMiddleware is correctly applied
        // But checking defensively
        console.error('[OWNERSHIP] Missing parentId in authenticated request');
        return res.status(401).json({
          message: 'Authentication failed. Please re-authenticate.',
        });
      }

      // ---- Step 3: Query database for child record ----
      // Fetch child and verify parentId matches
      const child = await prisma.child.findUnique({
        where: { id: childIdInt },
        select: {
          id: true,
          parentId: true,
          username: true,
          dateOfBirth: true,
          createdAt: true,
          // Don't fetch wallet here to keep lightweight
          // The controller can fetch wallet if needed
        },
      });

      // ---- Step 4: Verify ownership ----
      // Return 404 for both "not found" and "not owned" cases
      // This prevents attackers from learning about other parents' children
      if (!child) {
        // Child doesn't exist in database
        console.warn(`[OWNERSHIP] Child not found: childId=${childIdInt}`);
        return res.status(404).json({
          message: 'Child not found',
        });
      }

      if (child.parentId !== parentId) {
        // Child exists but belongs to different parent (spoofing attempt)
        console.warn(
          `[OWNERSHIP] Unauthorized child access attempt: parent=${parentId}, childId=${childIdInt}, owner=${child.parentId}`
        );
        // Return 404 to prevent information disclosure (hide that child exists)
        return res.status(404).json({
          message: 'Child not found',
        });
      }

      // ---- Step 5: Success - attach child to request and proceed ----
      // Store child in request so controller doesn't need to fetch again
      req.child = child;
      
      // Proceed to next middleware/controller
      next();

    } catch (err) {
      // ---- Error Handling ----
      // Database errors or unexpected failures
      console.error('[OWNERSHIP] Error verifying parental link:', err.message, err.stack);
      
      return res.status(500).json({
        message: 'Failed to verify child ownership. Please try again.',
      });
    }
  };
}

/**
 * Direct middleware version (no parameter name needed).
 * 
 * Use this version for routes where the parameter is always 'childId'.
 * It's less flexible but simpler to use.
 * 
 * @returns {function} Express middleware function
 * 
 * @example
 *   router.get('/children/:childId', authenticate, verifyParentalLinkMiddleware, controller.getChild);
 */
const verifyParentalLinkMiddleware = verifyParentalLink('childId');

module.exports = {
  verifyParentalLink,      // Factory function (flexible)
  verifyParentalLinkMiddleware, // Direct middleware (simple)
};
