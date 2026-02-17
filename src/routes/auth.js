/**
 * src/routes/auth.js
 * 
 * Authentication endpoints router for the SatsBlox API.
 * 
 * Sprint 1 Endpoints:
 *   - POST /api/auth/register: Register new parent account
 *   - POST /api/auth/login: Authenticate parent and issue tokens
 *   - POST /api/auth/refresh: Refresh access token using refresh token
 * 
 * Architecture:
 *   - Route handlers delegate to controllers (request/response)
 *   - Controllers delegate to services (business logic)
 *   - Services delegate to Prisma (database)
 * 
 * This separation enables:
 *   - Testability (mock services in tests)
 *   - Reusability (same service from multiple interfaces)
 *   - Maintainability (logic in one place)
 * 
 * All documentation (request/response formats) is in Swagger comments
 * for a single source of truth for API consumers.
 */

const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { loginRateLimiter } = require('../middleware/rateLimitMiddleware');
const { authorizeRoles } = require('../middleware/authorizeRoles');

const router = express.Router();

// ============================================
// Swagger/OpenAPI Documentation
// ============================================

/**
 * @swagger
 * components:
 *   schemas:
 *     ParentRegister:
 *       type: object
 *       required:
 *         - fullName
 *         - email
 *         - password
 *         - phoneNumber
 *       properties:
 *         fullName:
 *           type: string
 *           description: Parent's legal full name
 *           example: "Charity Muigai"
 *         email:
 *           type: string
 *           format: email
 *           description: Unique email address for login and contact
 *           example: "charity@example.com"
 *         password:
 *           type: string
 *           format: password
 *           description: Minimum 8 characters for security
 *           example: "StrongPassword123!"
 *         phoneNumber:
 *           type: string
 *           description: Kenyan phone number for M-Pesa integration (format +2547XXXXXXXX)
 *           example: "+254700000000"
 *     AuthResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "User registered successfully"
 *         parent:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             email:
 *               type: string
 *               example: "charity@example.com"
 *             fullName:
 *               type: string
 *               example: "Charity Muigai"
 *             phoneNumber:
 *               type: string
 *               example: "+254700000000"
 *             createdAt:
 *               type: string
 *               format: date-time
 *               example: "2024-02-17T10:30:00Z"
 *         accessToken:
 *           type: string
 *           description: Short-lived JWT token (7 minutes) for API requests
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         refreshToken:
 *           type: string
 *           description: Long-lived JWT token (7 days) for refreshing access token
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * 
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT Bearer token for authenticated requests. Include in Authorization header as "Bearer <token>"
 * 
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Parent's registered email address
 *           example: "charity@example.com"
 *         password:
 *           type: string
 *           format: password
 *           description: Parent's password (plain text, never stored)
 *           example: "StrongPassword123!"
 * 
 *     RefreshRequest:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: Refresh token received from login or registration
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * 
 *     ValidationError:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Registration validation failed"
 *         errors:
 *           type: object
 *           example:
 *             email: "Invalid email format"
 *             password: "Password must be at least 8 characters long"
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Failed to register user"
 *         error:
 *           type: string
 *           example: "EMAIL_EXISTS"
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new Parent account
 *     tags:
 *       - Auth
 *     description: |
 *       Create a new parent account for SatsBlox.
 *       
 *       Workflow:
 *       1. Validate input fields (email format, password strength, Kenyan phone)
 *       2. Check for duplicate email (prevent multiple registrations)
 *       3. Hash password using bcrypt (never store plain text)
 *       4. Create parent record in database
 *       5. Generate JWT access and refresh tokens
 *       6. Return tokens (parent is immediately logged in)
 *       
 *       Security:
 *       - Passwords are hashed with bcrypt (10 salt rounds)
 *       - Phone number validated for Kenyan format (+2547XXXXXXXX)
 *       - Email stored in lowercase for case-insensitive lookups
 *       - Sensitive fields (password, salt) never returned to client
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParentRegister'
 *     responses:
 *       201:
 *         description: Parent account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate parent and receive JWT tokens
 *     tags:
 *       - Auth
 *     description: |
 *       Authenticate a parent account and receive access and refresh tokens.
 *       
 *       Workflow:
 *       1. Validate input fields (email and password required)
 *       2. Find parent by email in database
 *       3. Verify password using bcrypt comparison (timing-safe)
 *       4. Generate new JWT tokens (token rotation for security)
 *       5. Return tokens to client
 *       
 *       Security:
 *       - Uses intentionally vague error message ("Invalid credentials")
 *       - Prevents email enumeration attacks
 *       - Bcrypt comparison is timing-safe (resists timing attacks)
 *       - Each login generates new tokens (rotation)
 *       
 *       Token Expiration:
 *       - Access Token: 7 minutes (short-lived for security)
 *       - Refresh Token: 7 days (long-lived for convenience)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error (missing email or password)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid credentials (email not found or password incorrect)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invalid credentials"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags:
 *       - Auth
 *     description: |
 *       Issue a new access token using a valid refresh token.
 *       
 *       Workflow:
 *       1. Validate refresh token is provided
 *       2. Verify refresh token signature and expiration
 *       3. Verify parent account still exists
 *       4. Generate new short-lived access token
 *       5. Optionally rotate refresh token (current: reuse existing)
 *       6. Return new access token
 *       
 *       Use Case:
 *       - When access token expires (401 response with "Token expired")
 *       - Client calls this endpoint with refresh token
 *       - Receives new access token
 *       - Retries the original request with new access token
 *       
 *       Security:
 *       - Refresh token must be stored securely on client (httpOnly cookie preferred)
 *       - If refresh token expires or is revoked, user must re-authenticate
 *       - Future: Can implement refresh token rotation (new token on each refresh)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Token refreshed successfully"
 *                 accessToken:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Validation error (missing refresh token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: |
 *         JWT Bearer token for authenticated requests.
 *         
 *         Obtained from:
 *         - POST /api/auth/register (returns both tokens)
 *         - POST /api/auth/login (returns both tokens)
 *         - POST /api/auth/refresh (returns new access token)
 *         
 *         Usage:
 *         Include in Authorization header as: "Bearer <accessToken>"
 *         
 *         Example:
 *         Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         
 *         Token Lifespan:
 *         - Access Token: 7 minutes (short-lived for security)
 *         - When expired: Use refresh token at POST /api/auth/refresh
 */

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and invalidate session tokens
 *     tags:
 *       - Auth
 *     description: |
 *       Logout a parent account by invalidating their refresh token.
 *       
 *       Workflow:
 *       1. Verify access token via Authorization header
 *       2. Invalidate the stored refresh token in database
 *       3. Reset failed login attempts and account lock (if any)
 *       4. Return success message
 *       
 *       Security:
 *       - Access token cannot be revoked (stateless JWT)
 *         - Token remains valid for ~7 minutes (until expiration)
 *         - Client should discard the token after logout
 *         - Future: Implement denylist for immediate revocation
 *       - Refresh token is immediately invalidated
 *         - Cannot be used to get new access tokens after logout
 *         - Old token in possession of attacker becomes useless
 *       
 *       RBAC Support:
 *       - Uses role-based claim in JWT (role: 'PARENT')
 *       - Can be extended for authorization checks on specific endpoints
 *       
 *       Token Management:
 *       - Clears refreshToken from database
 *       - Resets security fields (failedLoginAttempts, lockedUntil)
 * 
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logout successful"
 *                 parentId:
 *                   type: integer
 *                   example: 1
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// ============================================
// Route Handlers
// ============================================

/**
 * POST /api/auth/register
 * Handler delegates all logic to authController.register()
 */
router.post('/register', authController.register);

/**
 * POST /api/auth/login
 * Handler delegates all logic to authController.login()
 * 
 * Middleware Applied:
 *   - loginRateLimiter: IP-based rate limiting (5 attempts per 15 minutes)
 *     Responds with 429 Too Many Requests when limit exceeded
 */
router.post('/login', loginRateLimiter, authController.login);

/**
 * POST /api/auth/refresh
 * Handler delegates all logic to authController.refresh()
 * 
 * Middleware Applied:
 *   - authorizeRoles: RBAC check ensures user has PARENT role
 *     Responds with 403 Forbidden if authorization fails
 */
router.post('/refresh', authorizeRoles('PARENT'), authController.refresh);

/**
 * POST /api/auth/logout
 * Handler delegates all logic to authController.logout()
 * 
 * Middleware:
 *   - authMiddleware.authenticate(): Verify access token via Authorization header
 *   - authorizeRoles: RBAC check ensures user has PARENT role
 *     
 * Security:
 *   - Invalidates refresh token in database
 *   - Resets security fields (failedLoginAttempts, lockedUntil)
 *   - Logs logout event for audit trail
 */
router.post('/logout', authMiddleware.authenticate, authorizeRoles('PARENT'), authController.logout);

module.exports = router;

