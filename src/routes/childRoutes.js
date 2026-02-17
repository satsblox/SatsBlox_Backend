/**
 * src/routes/childRoutes.js
 * 
 * Family management routes for SatsBlox API.
 * 
 * Endpoints:
 *   - POST /api/family/children - Create a new child account
 *   - GET /api/family/children - List all children for authenticated parent
 *   - GET /api/family/children/:childId - Get specific child details
 * 
 * Architecture:
 *   - Route handlers delegate to controllers
 *   - Controllers delegate to services (if applicable)
 *   - Middleware chain ensures proper security and validation
 * 
 * Authentication:
 *   - ALL endpoints require: authMiddleware.authenticate
 *   - Verifies Bearer token and extracts parentId from JWT
 * 
 * Authorization:
 *   - GET :childId requires: ownershipMiddleware.verifyParentalLink
 *   - Ensures parent can only access their own children
 * 
 * This separation enables:
 *   - Testability (mock routes in unit tests)
 *   - Reusability (same handlers from different mount points)
 *   - Security (middleware chain ensures proper validation)
 * 
 * All documentation (request/response formats) is in Swagger comments
 * for a single source of truth for API consumers.
 */

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/authorizeRoles');
const { verifyParentalLink } = require('../middleware/ownershipMiddleware');
const childController = require('../controllers/childController');

const router = express.Router();

// ============================================
// Swagger/OpenAPI Documentation
// ============================================

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateChildRequest:
 *       type: object
 *       required:
 *         - username
 *         - dateOfBirth
 *       properties:
 *         username:
 *           type: string
 *           description: Unique username for the child (3-100 chars, alphanumeric with hyphens/underscores)
 *           example: "amara-savings"
 *           minLength: 3
 *           maxLength: 100
 *           pattern: "^[a-z0-9_-]+$"
 *         dateOfBirth:
 *           type: string
 *           format: date
 *           description: Child's date of birth (ISO format YYYY-MM-DD), must be under 18 years old
 *           example: "2015-03-21"
 * 
 *     ChildResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the child
 *           example: 10
 *         username:
 *           type: string
 *           description: Display username (unique across platform)
 *           example: "amara-savings"
 *         dateOfBirth:
 *           type: string
 *           format: date-time
 *           description: Child's date of birth
 *           example: "2015-03-21T00:00:00Z"
 *         parentId:
 *           type: integer
 *           description: ID of parent who owns this child
 *           example: 1
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when account was created
 *           example: "2024-02-17T10:30:00Z"
 * 
 *     WalletResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the wallet
 *           example: 100
 *         balance:
 *           type: string
 *           description: Current balance in satoshis (formatted as string for precision)
 *           example: "500000"
 *         childId:
 *           type: integer
 *           description: ID of child who owns this wallet
 *           example: 10
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when wallet was created
 *           example: "2024-02-17T10:30:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of last balance change
 *           example: "2024-02-17T11:45:00Z"
 * 
 *     ChildWithWallet:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         username:
 *           type: string
 *         dateOfBirth:
 *           type: string
 *           format: date-time
 *         parentId:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         wallet:
 *           $ref: '#/components/schemas/WalletResponse'
 * 
 *     ChildrenListResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Children retrieved successfully"
 *         count:
 *           type: integer
 *           description: Number of children in the list
 *           example: 3
 *         children:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChildResponse'
 */

/**
 * @swagger
 * /api/family/children:
 *   post:
 *     summary: Create a new child account with automatic wallet initialization
 *     tags:
 *       - Family Management
 *     description: |
 *       Create a new child account linked to the authenticated parent.
 *       
 *       Features:
 *       - Automatic parent linking from JWT (prevents spoofing)
 *       - Atomic creation of child and wallet (both succeed or both fail)
 *       - Wallet initialized with 0 satoshi balance
 *       - Global username uniqueness enforced
 *       - Age validation (must be under 18)
 *       
 *       Workflow:
 *       1. Verify Bearer token and extract parentId
 *       2. Validate username and dateOfBirth
 *       3. Check username is not already taken
 *       4. Create child record
 *       5. Create wallet record (atomically with child)
 *       6. Return both resources
 *       
 *       Security:
 *       - parentId NOT accepted in request body (uses JWT)
 *       - Username global uniqueness prevents collisions
 *       - One-to-One child-wallet relationship enforced
 *       - Transaction ensures atomic consistency
 *       
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateChildRequest'
 *     responses:
 *       201:
 *         description: Child account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Child account created successfully"
 *                 child:
 *                   $ref: '#/components/schemas/ChildResponse'
 *                 wallet:
 *                   $ref: '#/components/schemas/WalletResponse'
 *       400:
 *         description: Validation error (invalid username or birthdate)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Child account validation failed"
 *                 errors:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                       example: "Username must be at least 3 characters long"
 *                     dateOfBirth:
 *                       type: string
 *                       example: "Date of birth must be in ISO format (YYYY-MM-DD)"
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       409:
 *         description: Username conflict (already taken)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Username already taken. Please choose a different username."
 *                 error:
 *                   type: string
 *                   example: "USERNAME_EXISTS"
 *       500:
 *         description: Internal server error
 * 
 *   get:
 *     summary: List all children for the authenticated parent
 *     tags:
 *       - Family Management
 *     description: |
 *       Retrieve a list of all children linked to the authenticated parent.
 *       
 *       Features:
 *       - Returns only authenticated parent's children
 *       - Sorted by creation date (oldest first)
 *       - Includes basic child info (not wallet balance)
 *       - Fast lookup via database index on parentId
 *       
 *       Use Cases:
 *       - Populate child list in UI
 *       - Dashboard showing all children
 *       - Build family directory
 *       
 *       Future Enhancements:
 *       - Pagination: ?page=1&limit=10
 *       - Filtering: ?ageRange=5-12&active=true
 *       - Sorting: ?sort=username|createdAt
 *       - Wallet summary: ?includeWallet=true
 *       
 *       Security:
 *       - Only returns this parent's children
 *       - Parent A cannot enumerate Parent B's children
 *       - SQL parameterized (prevents injection)
 * 
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Children list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChildrenListResponse'
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/family/children/{childId}:
 *   get:
 *     summary: Get detailed information about a specific child
 *     tags:
 *       - Family Management
 *     description: |
 *       Retrieve full details for a specific child, including wallet information.
 *       
 *       Features:
 *       - Returns child details with wallet balance
 *       - Ownership verification (prevents access to other parents' children)
 *       - Includes wallet creation/update timestamps
 *       - Balance formatted as string for precision
 *       
 *       Use Cases:
 *       - View individual child's profile
 *       - Check current wallet balance
 *       - Track savings progress
 *       
 *       Ownership Verification:
 *       - Middleware verifies child belongs to authenticated parent
 *       - Returns 404 if child not found or not owned (no info leakage)
 *       - Prevents unauthorized access to sibling or other family data
 *       
 *       Data Sensitivity:
 *       - Child details: Low sensitivity
 *       - Wallet balance: High sensitivity (financial data)
 *       - Ownership check is critical
 * 
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         description: ID of the child to retrieve
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Child details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Child details retrieved successfully"
 *                 child:
 *                   $ref: '#/components/schemas/ChildWithWallet'
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       404:
 *         description: Child not found or doesn't belong to authenticated parent
 *       500:
 *         description: Internal server error
 *
 * /api/family/dashboard:
 *   get:
 *     summary: Get aggregated family dashboard with all children and wallets
 *     tags:
 *       - Family Management
 *     description: |
 *       Retrieve a consolidated dashboard showing all active children with their wallet balances.
 *       
 *       Key Features:
 *       - Single optimized database query (Prisma include feature)
 *       - Aggregated statistics (total satoshis, average balance)
 *       - O(1) query regardless of number of children
 *       - Only includes active children (soft-deleted are hidden)
 *       
 *       Performance Optimization:
 *       - Problem: Fetching children + wallets typically requires 1 query per child (N+1 problem)
 *       - Solution: Single JOIN query combining children and wallets
 *       - Example: 10 children would normally need 11 queries, now needs 1
 *       
 *       Aggregated Statistics:
 *       - totalChildren: Count of active child accounts
 *       - activeChildren: Same as totalChildren (future-proofing for inactive filter)
 *       - totalSatoshis: Sum of all children's wallet balances
 *       - averageBalance: totalSatoshis / totalChildren
 *       
 *       Use Cases:
 *       - Parent views family overview dashboard
 *       - Mobile app loads entire family snapshot
 *       - Generate family reports
 *       - Analytics dashboard
 *       - Export family data
 *       
 *       Security:
 *       - Returns only authenticated parent's children
 *       - Parent A cannot enumerate Parent B's data
 *       - Wallet data requires ownership verification
 * 
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Dashboard retrieved successfully"
 *                 summary:
 *                   type: object
 *                   description: Aggregated statistics for the family
 *                   properties:
 *                     totalChildren:
 *                       type: integer
 *                       example: 3
 *                       description: Total number of child accounts
 *                     activeChildren:
 *                       type: integer
 *                       example: 3
 *                       description: Number of non-deactivated children
 *                     totalSatoshis:
 *                       type: string
 *                       example: "1500000"
 *                       description: Sum of all children's wallet balances (string for precision)
 *                     averageBalance:
 *                       type: string
 *                       example: "500000"
 *                       description: Average balance per child (totalSatoshis / totalChildren)
 *                 children:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ChildWithWallet'
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       500:
 *         description: Internal server error
 * 
 * /api/family/children/{childId}/deactivate:
 *   patch:
 *     summary: Deactivate a child account (soft delete)
 *     tags:
 *       - Family Management
 *     description: |
 *       Soft delete a child account without permanently removing data.
 *       
 *       What is Soft Delete?
 *       - Sets isActive = false instead of deleting the record
 *       - Data is preserved but hidden from normal lists
 *       - Complies with data retention regulations (GDPR)
 *       - Reversible (can query deactivated children if needed)
 *       
 *       What Gets Preserved:
 *       - Child profile (username, dateOfBirth, avatar, colorTheme)
 *       - Wallet and all balance history
 *       - All timestamps (createdAt, updatedAt for audit trail)
 *       - Transaction history (if transactions table exists)
 *       
 *       What Gets Hidden:
 *       - Child won't appear in listMyChildren (WHERE isActive = true)
 *       - Child won't appear in getDashboard (WHERE isActive = true)
 *       - Must explicitly query with isActive filter to retrieve
 *       
 *       Why Not Hard Delete?
 *       - Hard delete: Loses all history and audit trail
 *       - Soft delete: Preserves everything, just marks as inactive
 *       - Regulatory: Many regulations require data retention
 *       - Reversibility: Parent can undo if accidental
 *       - Data integrity: No orphaned wallet records
 *       
 *       Use Cases:
 *       - Parent regrets and wants to remove child from dashboard
 *       - Child account no longer needed
 *       - Temporary account freeze
 *       - Data preservation for compliance
 * 
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of child to deactivate
 *         example: 10
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 enum: [false]
 *                 example: false
 *                 description: Must be false (marks as inactive)
 *     responses:
 *       200:
 *         description: Child deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Child deactivated successfully"
 *                 child:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 10
 *                     username:
 *                       type: string
 *                       example: "amara-savings"
 *                     isActive:
 *                       type: boolean
 *                       example: false
 *                     deactivatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-02-17T12:00:00Z"
 *                     note:
 *                       type: string
 *                       example: "Account data and wallet history are preserved. The child will no longer appear in your family dashboard."
 *       400:
 *         description: Bad request - Invalid deactivation data (e.g., isActive is not false)
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       404:
 *         description: Child not found or doesn't belong to authenticated parent
 *       500:
 *         description: Internal server error
 */

// ============================================
// Route Definitions
// ============================================

/**
 * POST /api/family/children
 * 
 * Create a new child account with automatic wallet.
 * 
 * Middleware Chain (applied in order):
 *   1. authMiddleware.authenticate - Verify JWT and extract parent ID
 *   2. authorizeRoles('PARENT') - Verify user has PARENT role (RBAC)
 *   3. childController.createChild - Create child + wallet atomically
 * 
 * Security:
 *   - Parent ID from JWT, not request body
 *   - Role verified (PARENT role required)
 *   - Username uniqueness enforced
 *   - Atomic transaction for consistency
 */
router.post(
  '/',
  authMiddleware.authenticate,
  authorizeRoles('PARENT'),
  childController.createChild
);

/**
 * GET /api/family/children
 * 
 * List all children for authenticated parent.
 * 
 * Middleware Chain:
 *   1. authMiddleware.authenticate - Verify JWT
 *   2. authorizeRoles('PARENT') - Verify user has PARENT role (RBAC)
 *   3. childController.listMyChildren - Fetch parent's children
 * 
 * Performance:
 *   - Indexed query on (parentId)
 *   - Efficient even with many children
 * 
 * Security:
 *   - Only PARENT role can access
 *   - Only returns authenticated parent's children
 */
router.get(
  '/',
  authMiddleware.authenticate,
  authorizeRoles('PARENT'),
  childController.listMyChildren
);

/**
 * GET /api/family/dashboard
 * 
 * Get aggregated family dashboard with all active children + wallets.
 * 
 * IMPORTANT: This route MUST come before /:childId
 * Otherwise Express would match /dashboard as :childId parameter
 * (Route matching is sequential; more specific routes first)
 * 
 * Purpose:
 *   - Provides consolidated family overview for parents
 *   - Single optimized database query (Prisma include)
 *   - Aggregates statistics (total satoshis, averages)
 * 
 * Query Optimization:
 *   Combines: SELECT children.*, wallets.* WHERE parentId = ? AND isActive = true
 *   Result: 1 database query instead of 1 + N queries
 * 
 * Middleware Chain:
 *   1. authMiddleware.authenticate - Verify JWT and extract parentId
 *   2. childController.getDashboard - Fetch aggregated data with single query
 * 
 * Security:
 *   - Only returns authenticated parent's children
 *   - Only returns active children (soft-deleted hidden)
 *   - Parent cannot see other parents' data
 * 
 * Use Cases:
 *   - Parent views consolidated family overview
 *   - Mobile app dashboard page
 *   - Export/report generation
 *   - Analytics (balance trends, etc.)
 */
router.get(
  '/dashboard',
  authMiddleware.authenticate,
  authorizeRoles('PARENT'),
  childController.getDashboard
);

/**
 * GET /api/family/children/:childId
 * 
 * Get specific child details including wallet.
 * 
 * IMPORTANT: This route MUST come after /dashboard (see above)
 * 
 * Middleware Chain:
 *   1. authMiddleware.authenticate - Verify JWT
 *   2. authorizeRoles('PARENT') - Verify user has PARENT role (RBAC)
 *   3. verifyParentalLink('childId') - Verify child belongs to parent
 *   4. childController.getChild - Fetch and return child+wallet details
 * 
 * Security:
 *   - Only PARENT role can access
 *   - Ownership verified before controller runs
 *   - Returns 404 for both "not found" and "not owned"
 *   - Prevents information disclosure
 * 
 * Parameter Name:
 *   - childId (numeric ID from URL)
 *   - Validated by middleware before reaching controller
 */
router.get(
  '/:childId',
  authMiddleware.authenticate,
  authorizeRoles('PARENT'),
  verifyParentalLink('childId'),
  childController.getChild
);

/**
 * PATCH /api/family/children/:childId/deactivate
 * 
 * Soft delete a child account (set isActive = false).
 * 
 * Purpose of Soft Delete:
 *   ✅ Preserves audit trail (transaction history)
 *   ✅ Complies with data retention laws (GDPR)
 *   ✅ Prevents accidental deletion (reversible)
 *   ✅ Maintains database integrity (no orphaned wallets)
 * 
 * What Gets Preserved:
 *   ✅ Child profile (username, dateOfBirth, metadata)
 *   ✅ Wallet and all balance history
 *   ✅ All timestamps (createdAt, updatedAt)
 * 
 * What Gets Hidden:
 *   ❌ Child hidden from listMyChildren() (WHERE isActive = true)
 *   ❌ Child hidden from getDashboard() (WHERE isActive = true)
 *   ⚠️ Can query deactivated children separately if needed
 * 
 * Middleware Chain:
 *   1. authMiddleware.authenticate - Verify JWT
 *   2. authorizeRoles('PARENT') - Verify user has PARENT role (RBAC)
 *   3. verifyParentalLink('childId') - Ensure child belongs to parent
 *   4. childController.deactivateChild - Update isActive = false
 * 
 * Security:
 *   - Only PARENT role can deactivate
 *   - Ownership verified before update
 *   - Only authenticated parent can deactivate their own children
 *   - Returns 404 for "not found" and "not owned" (information hiding)
 */
router.patch(
  '/:childId/deactivate',
  authMiddleware.authenticate,
  authorizeRoles('PARENT'),
  verifyParentalLink('childId'),
  childController.deactivateChild
);

module.exports = router;
