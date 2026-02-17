/**
 * src/controllers/authController.js
 * 
 * HTTP Request/Response handlers for authentication endpoints.
 * 
 * Purpose:
 *   - Handle HTTP request parsing and validation
 *   - Delegate business logic to service layer
 *   - Format and return HTTP responses (status codes, JSON)
 *   - Log requests for monitoring/debugging
 * 
 * Architecture Pattern: MVC Controllers
 *   HTTP Request → Controller → Service → Database → Response
 * 
 * Responsibilities:
 *   - Extract request data (body, params, headers)
 *   - Call service functions
 *   - Transform service results into HTTP responses
 *   - Handle and respond to errors appropriately
 * 
 * Note: Controllers should NOT contain business logic.
 * If logic would be useful in multiple contexts, move it to services.
 */

const authService = require('../services/authService');
const validators = require('../utils/validators');

// ============================================
// Controller Functions
// ============================================

/**
 * Handle POST /api/auth/register request.
 * 
 * HTTP Semantics:
 *   - Verb: POST (create new resource)
 *   - Status 201: Resource created successfully
 *   - Status 400: Bad request (validation error)
 *   - Status 409: Conflict (resource already exists)
 *   - Status 500: Server error
 * 
 * Request Body:
 *   {
 *     fullName: "Charity Muigai",
 *     email: "charity@example.com",
 *     password: "SecurePassword123",
 *     phoneNumber: "+254700000000"
 *   }
 * 
 * Success Response (201):
 *   {
 *     message: "Parent registered successfully",
 *     parent: { id, email, fullName, phoneNumber, createdAt },
 *     accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *     refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * 
 * Error Response (400):
 *   {
 *     message: "Validation error",
 *     errors: { email: "Invalid email format", password: "Too short" }
 *   }
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function register(req, res) {
  try {
    const { fullName, email, password, phoneNumber } = req.body;

    // ---- Step 1: Validate request body ----
    const validation = validators.validateRegistrationData({
      fullName,
      email,
      password,
      phoneNumber,
    });

    if (!validation.isValid) {
      // Return 400 Bad Request with validation errors
      // Client should display these to the user for correction
      return res.status(400).json({
        message: 'Registration validation failed',
        errors: validation.errors,
      });
    }

    // ---- Step 2: Call service to register parent ----
    // Service layer handles database operations and business logic
    const { parent, accessToken, refreshToken } = await authService.registerParent({
      fullName,
      email,
      password,
      phoneNumber,
    });

    // ---- Step 3: Return success response ----
    // 201 Created: Standard HTTP status for successful resource creation
    return res.status(201).json({
      message: 'Parent registered successfully',
      parent,
      accessToken,
      refreshToken,
    });

  } catch (err) {
    // ---- Error Handling ----
    // This is where we map service layer errors to appropriate HTTP responses

    if (err.code === 'EMAIL_EXISTS') {
      // 409 Conflict: Resource already exists (email taken)
      console.warn('[AUTH] Registration failed: Email already exists:', err.message);
      return res.status(409).json({
        message: 'Email already registered',
        error: 'EMAIL_EXISTS',
      });
    }

    // Any other error: 500 Server Error
    // Log full error for debugging (but don't send details to client)
    console.error('[AUTH] Registration error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to register parent. Please try again later.',
    });
  }
}

/**
 * Handle POST /api/auth/login request.
 * 
 * HTTP Semantics:
 *   - Verb: POST (create session/tokens)
 *   - Status 200: Successfully authenticated
 *   - Status 400: Bad request (missing/invalid fields)
 *   - Status 401: Unauthorized (bad credentials)
 *   - Status 500: Server error
 * 
 * Request Body:
 *   {
 *     email: "charity@example.com",
 *     password: "SecurePassword123"
 *   }
 * 
 * Success Response (200):
 *   {
 *     message: "Login successful",
 *     parent: { id, email, fullName, phoneNumber, createdAt },
 *     accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *     refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * 
 * Error Response (401):
 *   { message: "Invalid credentials" }
 * 
 * Security Note:
 *   - We use intentionally vague error ("Invalid credentials")
 *   - Don't reveal whether email exists or password is wrong
 *   - Prevents email enumeration attacks
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // ---- Step 1: Validate request body ----
    const validation = validators.validateLoginData({ email, password });

    if (!validation.isValid) {
      // Return 400 Bad Request with validation errors
      return res.status(400).json({
        message: 'Login validation failed',
        errors: validation.errors,
      });
    }

    // ---- Step 2: Call service to authenticate parent ----
    const { parent, accessToken, refreshToken } = await authService.loginParent(
      email,
      password
    );

    // ---- Step 3: Return success response ----
    // 200 OK: Standard HTTP status for successful request
    return res.status(200).json({
      message: 'Login successful',
      parent,
      accessToken,
      refreshToken,
    });

  } catch (err) {
    // ---- Error Handling ----

    if (err.code === 'INVALID_CREDENTIALS') {
      // 401 Unauthorized: Authentication failed
      // Intentionally vague message to prevent email enumeration
      console.warn('[AUTH] Login failed: Invalid credentials');
      return res.status(401).json({
        message: 'Invalid credentials',
      });
    }

    // Any other error: 500 Server Error
    console.error('[AUTH] Login error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to log in. Please try again later.',
    });
  }
}

/**
 * Handle POST /api/auth/refresh request.
 * 
 * Purpose:
 *   - Allow client to get a new access token using their refresh token
 *   - Enables token rotation and extended sessions
 * 
 * HTTP Semantics:
 *   - Verb: POST (create new token)
 *   - Status 200: New token issued
 *   - Status 400: Bad request (missing token)
 *   - Status 401: Unauthorized (invalid/expired token)
 *   - Status 500: Server error
 * 
 * Request Body:
 *   { refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
 * 
 * Success Response (200):
 *   {
 *     message: "Token refreshed successfully",
 *     accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *     refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *   }
 * 
 * Usage:
 *   1. Client makes request to protected endpoint with expired access token
 *   2. Middleware returns 401 with "Token expired" message
 *   3. Client calls /api/auth/refresh with their refresh token
 *   4. Server issues new access token
 *   5. Client retries original request with new access token
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;

    // ---- Step 1: Validate refresh token is provided ----
    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        message: 'Refresh token is required',
      });
    }

    // ---- Step 2: Call service to refresh token ----
    const tokens = await authService.refreshAccessToken(refreshToken);

    // ---- Step 3: Return success response ----
    return res.status(200).json({
      message: 'Token refreshed successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

  } catch (err) {
    // ---- Error Handling ----

    if (err.code === 'INVALID_TOKEN' || err.name === 'TokenExpiredError') {
      // 401 Unauthorized: Token is invalid or expired
      console.warn('[AUTH] Token refresh failed: Invalid or expired token');
      return res.status(401).json({
        message: 'Invalid or expired refresh token',
      });
    }

    if (err.code === 'PARENT_NOT_FOUND') {
      // 401 Unauthorized: Parent account not found (deleted account)
      console.warn('[AUTH] Token refresh failed: Parent not found');
      return res.status(401).json({
        message: 'Parent account not found',
      });
    }

    // Any other error: 500 Server Error
    console.error('[AUTH] Token refresh error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to refresh token. Please try again later.',
    });
  }
}

/**
 * Handle POST /api/auth/logout request.
 * 
 * HTTP Semantics:
 *   - Verb: POST (perform action)
 *   - Status 200: Successfully logged out
 *   - Status 401: Unauthorized (invalid or missing token)
 *   - Status 500: Server error
 * 
 * Authentication:
 *   - Requires Bearer token in Authorization header
 *   - Token is extracted and verified by authMiddleware.authenticate()
 *   - User ID is attached to req.user.id by middleware
 * 
 * Success Response (200):
 *   {
 *     message: "Logout successful",
 *     parentId: 1
 *   }
 * 
 * Error Response (401):
 *   { message: "Unauthorized - Invalid or missing token" }
 * 
 * Security Notes:
 *   - Invalidates the refresh token stored in database
 *   - Prevents the invalidated token from being used to get new access tokens
 *   - Access token cannot be revoked (stateless JWT)
 *     - Client should discard it after logout
 *     - Token remains valid for ~7 minutes (until natural expiration)
 *   - Future enhancement: implement access token denylist for immediate revocation
 * 
 * @param {object} req - Express request object (with req.user from auth middleware)
 * @param {object} res - Express response object
 */
async function logout(req, res) {
  try {
    // ---- Step 1: Extract parent ID from authenticated request ----
    // authMiddleware.authenticate() verifies the JWT token and attaches user info
    // If we reach here, token is valid and req.user.id exists
    const parentId = req.user?.id;

    if (!parentId) {
      // This shouldn't happen if authMiddleware is correctly applied
      // But checking defensively
      return res.status(401).json({
        message: 'Unauthorized - Invalid or missing token',
      });
    }

    // ---- Step 2: Call service to invalidate refresh token ----
    // Service sets refreshToken to null and resets security fields
    const result = await authService.logoutParent(parentId);

    // ---- Step 3: Return success response ----
    return res.status(200).json({
      message: result.message,
      parentId: result.parentId,
    });

  } catch (err) {
    // ---- Error Handling ----

    if (err.code === 'PARENT_NOT_FOUND') {
      // 401 Unauthorized: Parent account not found (possibly deleted while logged in)
      console.warn('[AUTH] Logout failed: Parent not found:', err.message);
      return res.status(401).json({
        message: 'Parent account not found',
      });
    }

    // Any other error: 500 Server Error
    console.error('[AUTH] Logout error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to logout. Please try again later.',
    });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
};
