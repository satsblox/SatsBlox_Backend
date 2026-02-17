/**
 * src/middleware/authMiddleware.js
 * 
 * JWT authentication middleware for protecting private routes.
 * 
 * Purpose:
 *   - Verify JWT token in request headers
 *   - Extract and validate parent identity
 *   - Allow/deny access based on token validity
 *   - Attach parent info to request for use in protected endpoints
 * 
 * Usage:
 *   router.get('/api/parents/me', authenticate, parentController.getProfile);
 *   // authenticate middleware runs before getProfile handler
 * 
 * Client Integration:
 *   - Client includes JWT in "Authorization" header: "Bearer <token>"
 *   - Middleware extracts token and verifies signature/expiration
 *   - If valid, request proceeds; if invalid, returns 401
 * 
 * Token Location:
 *   - Extracted from "Authorization" header (required by OAuth 2.0 Bearer scheme)
 *   - Format: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   - Alternative: Could also support cookies (add-on feature)
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Express middleware to require valid JWT token.
 * 
 * Flow:
 *   1. Check if Authorization header exists
 *   2. Verify header format ("Bearer <token>")
 *   3. Extract and verify token signature and expiration
 *   4. If valid, attach user info to req.user and call next()
 *   5. If invalid, return 401 Unauthorized
 * 
 * Error Responses:
 *   - 400 Bad Request: Missing or malformed Authorization header
 *   - 401 Unauthorized: Invalid/expired token
 * 
 * Security Notes:
 *   - Token signature proves it hasn't been tampered with
 *   - Expiration time validates token is still fresh
 *   - Timing-safe comparison (just sign verification, no strings)
 * 
 * On Success:
 *   - req.user = { id: 123, email: "user@example.com", iat: 1234567890, exp: 1234567900 }
 *   - Next middleware/handler can access req.user
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function authenticate(req, res, next) {
  try {
    // ---- Step 1: Extract Authorization header ----
    const authHeader = req.headers.authorization;

    // Check header exists
    if (!authHeader) {
      console.warn('[AUTH] Missing authorization header');
      return res.status(400).json({
        message: 'Authorization header is required',
      });
    }

    // ---- Step 2: Parse Bearer token ----
    // OAuth 2.0 Bearer scheme: "Bearer <token>"
    // https://tools.ietf.org/html/rfc6750
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      // Header exists but doesn't match "Bearer <token>" format
      console.warn('[AUTH] Invalid authorization header format:', authHeader.substring(0, 20) + '...');
      return res.status(400).json({
        message: 'Authorization header must be in format: Bearer <token>',
      });
    }

    const token = parts[1];

    // ---- Step 3: Verify token ----
    // jwt.verify will throw if:
    //   - Signature is invalid (token was modified)
    //   - Token is expired
    //   - Secret key doesn't match
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (jwtErr) {
      // Token verification failed
      // Different error types for different failures (uncomment to differentiate)
      if (jwtErr.name === 'TokenExpiredError') {
        console.warn('[AUTH] Token expired:', jwtErr.message);
        return res.status(401).json({
          message: 'Token expired',
          error: 'TOKEN_EXPIRED',
        });
      } else if (jwtErr.name === 'JsonWebTokenError') {
        console.warn('[AUTH] Invalid token:', jwtErr.message);
        return res.status(401).json({
          message: 'Invalid token',
          error: 'INVALID_TOKEN',
        });
      } else {
        console.warn('[AUTH] Token verification error:', jwtErr.message);
        return res.status(401).json({
          message: 'Token verification failed',
        });
      }
    }

    // ---- Step 4: Attach user info to request ----
    // Now available in protected handlers as req.user
    req.user = {
      id: payload.id,
      email: payload.email,
      // Include token timestamps for logging/audit purposes
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
    };

    // ---- Step 5: Continue to next middleware/handler ----
    next();

  } catch (err) {
    // Unexpected error in middleware (not JWT-related)
    console.error('[AUTH] Authentication middleware error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Internal server error during authentication',
    });
  }
}

/**
 * Express middleware to optionally require JWT token.
 * 
 * Difference from authenticate():
 *   - authenticate: Returns 401 if no/invalid token
 *   - authenticateOptional: Sets req.user if token provided, but doesn't require it
 * 
 * Use Cases:
 *   - Public endpoints that show different data for authenticated users
 *   - Progressive enhancement (more features if authenticated)
 *   - Mixed public/private endpoints
 * 
 * Returns: req.user is set if valid token found, undefined otherwise
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
function authenticateOptional(req, res, next) {
  try {
    // ---- Step 1: Check for Authorization header (optional) ----
    const authHeader = req.headers.authorization;

    // No header? That's OK, continue as unauthenticated
    if (!authHeader) {
      return next();
    }

    // ---- Step 2: Parse Bearer token ----
    const parts = authHeader.split(' ');

    // Invalid format? Skip verification, continue as unauthenticated
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    // ---- Step 3: Try to verify token ----
    try {
      const payload = jwt.verify(token, env.jwtSecret);

      // Token is valid, set user
      req.user = {
        id: payload.id,
        email: payload.email,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: new Date(payload.exp * 1000),
      };

    } catch (jwtErr) {
      // Token verification failed, but that's OK
      // Just continue without user (don't set req.user)
      // Could log this for debugging if needed
      // console.debug('[AUTH] Optional token verification failed:', jwtErr.message);
    }

    // Continue with or without user
    next();

  } catch (err) {
    // Unexpected error, but don't block the request
    console.warn('[AUTH] Optional authentication error:', err.message);
    next();
  }
}

module.exports = {
  authenticate,
  authenticateOptional,
};
