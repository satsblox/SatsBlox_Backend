/**
 * src/controllers/childController.js
 * 
 * HTTP Request/Response handlers for child account and family management endpoints.
 * 
 * Purpose:
 *   - Handle HTTP request parsing and validation for family resources
 *   - Delegate business logic to service layer
 *   - Format and return HTTP responses
 *   - Enforce authentication and parental ownership
 * 
 * Architecture Pattern: MVC Controllers
 *   HTTP Request → Controller → Service → Database → Response
 * 
 * Key Features:
 *   - Atomic child + wallet creation (single transaction)
 *   - Automatic parent association from JWT (no spoofing)
 *   - Parental listing (only authenticated parent's children)
 *   - Child details retrieval (with ownership verification)
 * 
 * Security Considerations:
 *   - parentId extracted from JWT, never from request body
 *   - Parental ownership verified before sensitive operations
 *   - Username uniqueness enforced at database level
 *   - Wallet initialized with 0 balance atomically with child
 */

const { prisma } = require('../config/db');
const validators = require('../utils/validators');

// ============================================
// Controller Functions
// ============================================

/**
 * Handle POST /api/family/children request.
 * 
 * Create a new Child account with an automatically initialized Wallet.
 * This is an atomic operation: both resources are created together,
 * or both fail if any error occurs.
 * 
 * HTTP Semantics:
 *   - Verb: POST (create new resource)
 *   - Status 201: Resource created successfully
 *   - Status 400: Bad request (validation error)
 *   - Status 409: Conflict (username already exists)
 *   - Status 500: Server error
 * 
 * Request Body:
 *   {
 *     username: "amara-savings",
 *     dateOfBirth: "2015-03-21"
 *   }
 * 
 * Note: parentId is NOT in request body
 *   - Extracted automatically from JWT token (req.user.id)
 *   - Prevents security spoofing attacks
 *   - Parent cannot create children for other parents
 * 
 * Success Response (201):
 *   {
 *     message: "Child account created successfully",
 *     child: {
 *       id: 10,
 *       username: "amara-savings",
 *       dateOfBirth: "2015-03-21T00:00:00Z",
 *       parentId: 1,
 *       createdAt: "2024-02-17T10:30:00Z"
 *     },
 *     wallet: {
 *       id: 100,
 *       balance: 0,
 *       childId: 10,
 *       createdAt: "2024-02-17T10:30:00Z"
 *     }
 *   }
 * 
 * Error Response (400):
 *   {
 *     message: "Validation failed",
 *     errors: {
 *       username: "Username must be at least 3 characters long",
 *       dateOfBirth: "Date of birth must be in ISO format (YYYY-MM-DD)"
 *     }
 *   }
 * 
 * Error Response (409):
 *   {
 *     message: "Username already taken",
 *     error: "USERNAME_EXISTS"
 *   }
 * 
 * Security Notes:
 *   - Requires: Bearer token in Authorization header (authMiddleware)
 *   - parentId extracted from JWT (not request body)
 *   - Username must be globally unique (checked at DB level)
 *   - Wallet is created with 0 balance (immutable once created)
 *   - Atomic: If wallet creation fails, child is rolled back
 * 
 * Atomic Transaction:
 *   - Cannot have a child without a wallet
 *   - Cannot have orphaned wallets
 *   - Database consistency guaranteed by Prisma transaction
 * 
 * @param {object} req - Express request object (with req.user from authMiddleware)
 * @param {object} res - Express response object
 */
async function createChild(req, res) {
  try {
    const { username, dateOfBirth } = req.body;
    const parentId = req.user?.id;

    // ---- Step 1: Extract parent ID from JWT ----
    // authMiddleware.authenticate() has already verified the token
    // req.user.id is guaranteed to exist at this point
    if (!parentId) {
      console.error('[CHILD] Missing parentId in authenticated request');
      return res.status(401).json({
        message: 'Authentication failed. Please re-authenticate.',
      });
    }

    // ---- Step 2: Validate request body ----
    const validation = validators.validateCreateChildData({
      username,
      dateOfBirth,
    });

    if (!validation.isValid) {
      // Return 400 Bad Request with validation errors
      // Client should display these to user for correction
      console.warn('[CHILD] Create validation failed:', validation.errors);
      return res.status(400).json({
        message: 'Child account validation failed',
        errors: validation.errors,
      });
    }

    // ---- Step 3: Create child and wallet atomically ----
    // Use Prisma transaction: both succeed or both fail
    // 
    // Transaction ensures:
    //   - Child record is created with parent link
    //   - Wallet record is immediately created with child link
    //   - If any step fails, entire transaction rolls back
    //   - No orphaned records (child without wallet or vice versa)
    //
    // Why transactions are important:
    //   - Network failure after child create but before wallet create
    //   - Database connection lost mid-operation
    //   - Username uniqueness constraint violation
    //   - Any other database error
    // 
    // In all cases: either both succeed or both are rolled back

    const { child, wallet } = await prisma.$transaction(async (tx) => {
      // ---- Transaction Step A: Create child record ----
      // Prisma will use this transaction context (tx) instead of default client
      const newChild = await tx.child.create({
        data: {
          username: username.toLowerCase().trim(), // Normalize for consistency
          dateOfBirth: new Date(dateOfBirth), // Convert ISO string to Date
          parentId: parentId, // Link to authenticated parent
          // ---- Gamification Metadata (optional) ----
          // avatar can be:
          //   - URL: "https://avatars.example.com/123.png"
          //   - Service ID: "avatar_emoji_lion"
          //   - Emoji ref: "emoji:🦁"
          // colorTheme can be:
          //   - Preset: "ocean", "sunset", "forest"
          //   - Hex: "#FF6B6B"
          //   - RGB: "rgb(255, 107, 107)"
          // If not provided, frontend uses parent's defaults
          avatar: req.body.avatar || null, // Optional, provided by parent
          colorTheme: req.body.colorTheme || null, // Optional, provided by parent
          // ---- Account Status ----
          // isActive defaults to true (new accounts are active)
          // Can be set to false to "deactivate" child account
          isActive: true, // New accounts are active by default
        },
        select: {
          id: true,
          username: true,
          dateOfBirth: true,
          avatar: true,
          colorTheme: true,
          parentId: true,
          isActive: true,
          createdAt: true,
        },
      });

      // ---- Transaction Step B: Create wallet for the child ----
      // Must happen within same transaction for atomicity
      // Initial balance is 0 satoshi (parent deposits funds later)
      const newWallet = await tx.wallet.create({
        data: {
          balance: 0n, // BigInt for satoshi precision
          childId: newChild.id, // Link wallet to child
        },
        select: {
          id: true,
          balance: true,
          childId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // ---- Return both resources from transaction ----
      // Prisma returns these to the caller
      return {
        child: newChild,
        wallet: newWallet,
      };
    });

    // ---- Step 4: Convert BigInt balance to string for JSON response ----
    // BigInt cannot be serialized directly, must convert to string
    // This preserves all digits for satoshi precision
    const formattedWallet = {
      ...wallet,
      balance: wallet.balance.toString(),
    };

    // ---- Step 5: Return success response ----
    // 201 Created: Standard HTTP status for successful resource creation
    return res.status(201).json({
      message: 'Child account created successfully',
      child,
      wallet: formattedWallet,
    });

  } catch (err) {
    // ---- Error Handling ----

    // Check for Unique Constraint Violation
    // Prisma error code P2002 = unique constraint failed
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0];
      
      if (field === 'username') {
        // Username is not unique
        console.warn('[CHILD] Username already exists:', err.message);
        return res.status(409).json({
          message: 'Username already taken. Please choose a different username.',
          error: 'USERNAME_EXISTS',
        });
      }
    }

    // Check for Foreign Key Constraint Violation
    // P2003 = foreign key constraint failed
    if (err.code === 'P2003') {
      // Parent account doesn't exist (shouldn't happen if auth works correctly)
      console.warn('[CHILD] Parent not found:', err.message);
      return res.status(401).json({
        message: 'Parent account not found. Please re-authenticate.',
      });
    }

    // Any other database error
    console.error('[CHILD] Create child error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to create child account. Please try again later.',
    });
  }
}

/**
 * Handle GET /api/family/children request.
 * 
 * Retrieve all children linked to the authenticated parent.
 * 
 * HTTP Semantics:
 *   - Verb: GET (retrieve resource)
 *   - Status 200: Successfully retrieved children
 *   - Status 500: Server error
 * 
 * Success Response (200):
 *   {
 *     message: "Children retrieved successfully",
 *     count: 3,
 *     children: [
 *       {
 *         id: 10,
 *         username: "amara-savings",
 *         dateOfBirth: "2015-03-21T00:00:00Z",
 *         parentId: 1,
 *         createdAt: "2024-02-17T10:30:00Z"
 *       },
 *       {
 *         id: 11,
 *         username: "liam-btc",
 *         dateOfBirth: "2018-07-15T00:00:00Z",
 *         parentId: 1,
 *         createdAt: "2024-02-17T10:35:00Z"
 *       }
 *     ]
 *   }
 * 
 * Empty Response (200):
 *   {
 *     message: "No children found",
 *     count: 0,
 *     children: []
 *   }
 * 
 * Security Notes:
 *   - Requires: Bearer token in Authorization header (authMiddleware)
 *   - Returns ONLY children belonging to authenticated parent
 *   - Parent A cannot see Parent B's children
 *   - SQL is parameterized (prevents SQL injection)
 * 
 * Performance Notes:
 *   - Queries only this parent's children (filtered by parentId)
 *   - Index exists on parentId for efficient lookup
 *   - Consider pagination for parents with many children (future enhancement)
 * 
 * Future Enhancements:
 *   - Add sorting: ?sort=username|createdAt|dateOfBirth
 *   - Add filtering: ?ageRange=5-12&active=true
 *   - Add pagination: ?page=1&limit=10
 *   - Include wallet summary: ?includeWallet=true
 * 
 * @param {object} req - Express request object (with req.user from authMiddleware)
 * @param {object} res - Express response object
 */
async function listMyChildren(req, res) {
  try {
    // ---- Step 1: Extract parent ID from JWT ----
    const parentId = req.user?.id;

    if (!parentId) {
      console.error('[CHILD] Missing parentId in authenticated request');
      return res.status(401).json({
        message: 'Authentication failed. Please re-authenticate.',
      });
    }

    // ---- Step 2: Query database for this parent's children ----
    // Prisma automatically filters by parentId where clause
    // Database index on (parentId) ensures fast lookup
    // IMPORTANT: Only return ACTIVE children (isActive = true)
    // Deactivated children are hidden from normal list (preserved for audit trail)
    const children = await prisma.child.findMany({
      where: {
        parentId: parentId, // Only this parent's children
        isActive: true, // Only show active children (soft delete filtering)
      },
      select: {
        id: true,
        username: true,
        dateOfBirth: true,
        avatar: true,
        colorTheme: true,
        parentId: true,
        isActive: true,
        createdAt: true,
        // Note: wallet data not included (separate query if needed)
        // See "Include wallet data" section for enhancement
      },
      orderBy: {
        createdAt: 'asc', // Oldest child first (chronological order)
      },
    });

    // ---- Step 3: Format and return response ----
    // Include count for pagination support (if added later)
    const message = children.length === 0 
      ? 'No children found'
      : 'Children retrieved successfully';

    return res.status(200).json({
      message,
      count: children.length,
      children,
    });

  } catch (err) {
    // ---- Error Handling ----
    console.error('[CHILD] List children error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to retrieve children. Please try again later.',
    });
  }
}

/**
 * Handle GET /api/family/children/:childId request.
 * 
 * Retrieve details for a specific child (with wallet information).
 * Ownership is verified by ownershipMiddleware before this controller is called.
 * 
 * HTTP Semantics:
 *   - Verb: GET (retrieve resource)
 *   - Status 200: Successfully retrieved child
 *   - Status 404: Child not found or doesn't belong to parent
 *   - Status 500: Server error
 * 
 * Request Path:
 *   GET /api/family/children/10
 *   // childId = 10
 * 
 * Success Response (200):
 *   {
 *     message: "Child details retrieved successfully",
 *     child: {
 *       id: 10,
 *       username: "amara-savings",
 *       dateOfBirth: "2015-03-21T00:00:00Z",
 *       parentId: 1,
 *       createdAt: "2024-02-17T10:30:00Z",
 *       wallet: {
 *         id: 100,
 *         balance: "500000",
 *         childId: 10,
 *         createdAt: "2024-02-17T10:30:00Z",
 *         updatedAt: "2024-02-17T11:45:00Z"
 *       }
 *     }
 *   }
 * 
 * Error Response (404):
 *   {
 *     message: "Child not found"
 *   }
 * 
 * Security Notes:
 *   - Parenthood verified by ownershipMiddleware BEFORE this executes
 *   - req.child is already populated by middleware
 *   - Includes wallet balance (sensitive - only parent should see)
 *   - Note: Middleware returns 404 for both "not found" and "not owned"
 * 
 * Middleware Chain (order is important):
 *   1. authenticate - Verifies JWT and extracts parent ID
 *   2. verifyParentalLink - Checks child belongs to parent
 *   3. getChild - This controller (only runs if ownership valid)
 * 
 * Data Sensitivity:
 *   - Child.dateOfBirth - Not extremely sensitive
 *   - Wallet.balance - Sensitive financial data
 *   - Ownership verification is critical
 * 
 * @param {object} req - Express request object (with req.child attached by middleware)
 * @param {object} res - Express response object
 */
async function getChild(req, res) {
  try {
    // ---- Step 1: Verify ownership already checked by middleware ----
    // ownershipMiddleware has verified:
    //   - childId exists
    //   - child belongs to authenticated parent
    // Available as req.child (lightweight object from middleware)
    
    const childId = req.child?.id;

    if (!childId) {
      // This shouldn't happen if middleware is correctly configured
      console.error('[CHILD] Child info missing from request');
      return res.status(404).json({
        message: 'Child not found',
      });
    }

    // ---- Step 2: Fetch full child details including wallet ----
    // Middleware only fetched basic child info (to keep lightweight)
    // Now we get everything including wallet for the response
    const child = await prisma.child.findUnique({
      where: { id: childId },
      select: {
        id: true,
        username: true,
        dateOfBirth: true,
        parentId: true,
        createdAt: true,
        wallet: {
          select: {
            id: true,
            balance: true,
            childId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // ---- Step 3: Format wallet balance (BigInt → string) ----
    // BigInt can't be serialized with JSON.stringify by default
    // Convert to string to preserve precision (satoshis are integers)
    if (child?.wallet) {
      child.wallet.balance = child.wallet.balance.toString();
    }

    // ---- Step 4: Return success response ----
    return res.status(200).json({
      message: 'Child details retrieved successfully',
      child,
    });

  } catch (err) {
    // ---- Error Handling ----
    console.error('[CHILD] Get child error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to retrieve child details. Please try again later.',
    });
  }
}

/**
 * Handle GET /api/family/dashboard request.
 * 
 * Aggregated dashboard endpoint that returns all children with their wallet
 * information in a SINGLE database query using Prisma's include feature.
 * 
 * HTTP Semantics:
 *   - Verb: GET (retrieve resource)
 *   - Status 200: Successfully retrieved dashboard data
 *   - Status 500: Server error
 * 
 * Success Response (200):
 *   {
 *     message: "Dashboard retrieved successfully",
 *     summary: {
 *       totalChildren: 3,
 *       activeChildren: 3,
 *       totalSatoshis: "1500000",
 *       averageBalance: "500000"
 *     },
 *     children: [
 *       {
 *         id: 10,
 *         username: "amara-savings",
 *         dateOfBirth: "2015-03-21T00:00:00Z",
 *         avatar: "emoji:🦁",
 *         colorTheme: "ocean",
 *         parentId: 1,
 *         isActive: true,
 *         createdAt: "2024-02-17T10:30:00Z",
 *         wallet: {
 *           id: 100,
 *           balance: "500000",
 *           childId: 10,
 *           createdAt: "2024-02-17T10:30:00Z"
 *         }
 *       },
 *       ...
 *     ]
 *   }
 * 
 * Performance Optimization:
 *   - Uses Prisma's include feature for efficient JOIN query
 *   - Single database round-trip instead of N+1 queries
 *   - With 10 children: 1 query vs 11 queries
 *   - Composite index (parentId, isActive) speeds up filtering
 * 
 * Query Optimization:
 *   Naive approach (N+1 problem):
 *   - Query 1: SELECT * FROM children WHERE parentId = ? AND isActive = true (3 rows)
 *   - Query 2,3,4: SELECT * FROM wallets WHERE childId IN (10,11,12) (3 separate queries)
 *   - Total: 4 database queries
 *   
 *   Optimized approach (using include):
 *   - Query 1: SELECT children.*, wallets.* FROM children
 *             LEFT JOIN wallets ON wallets.childId = children.id
 *             WHERE children.parentId = ? AND children.isActive = true
 *   - Total: 1 database query (Prisma combines in one trip)
 * 
 * Use Cases:
 *   - Parent views dashboard (see all children + balances)
 *   - Mobile app loads entire family overview
 *   - Aggregated statistics calculation
 *   - Export family data/reports
 * 
 * Security Notes:
 *   - Requires: Bearer token in Authorization header (authMiddleware)
 *   - Returns ONLY active children belonging to authenticated parent
 *   - Parent A cannot see Parent B's children
 * 
 * Future Enhancements:
 *   - Add pagination: ?limit=10&offset=0
 *   - Add sorting: ?sort=balance&order=desc
 *   - Include transaction history: ?includeTransactions=true
 *   - Include goals: ?includeGoals=true
 * 
 * @param {object} req - Express request object (with req.user from authMiddleware)
 * @param {object} res - Express response object
 */
async function getDashboard(req, res) {
  try {
    // ---- Step 1: Extract parent ID from JWT ----
    const parentId = req.user?.id;

    if (!parentId) {
      console.error('[CHILD] Missing parentId in authenticated request');
      return res.status(401).json({
        message: 'Authentication failed. Please re-authenticate.',
      });
    }

    // ---- Step 2: Fetch dashboard data with single optimized query ----
    // Using Prisma's include feature for efficient JOIN query
    // This queries children AND their wallets in ONE database trip
    //
    // SQL equivalent:
    //   SELECT c.*, w.* FROM children c
    //   LEFT JOIN wallets w ON w.childId = c.id
    //   WHERE c.parentId = ? AND c.isActive = true
    //   ORDER BY c.createdAt ASC
    const children = await prisma.child.findMany({
      where: {
        parentId: parentId,
        isActive: true, // Only active children
      },
      select: {
        id: true,
        username: true,
        dateOfBirth: true,
        avatar: true,
        colorTheme: true,
        parentId: true,
        isActive: true,
        createdAt: true,
        // ---- Include Related Wallet Data ----
        // This is the key optimization: fetch wallet in same query
        // Prisma combines this into a single database query
        wallet: {
          select: {
            id: true,
            balance: true,
            childId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // ---- Step 3: Convert BigInt balances to strings ----
    // BigInt cannot be serialized with JSON.stringify
    // Convert to string to preserve precision (satoshis are integers)
    const childrenWithFormattedBalances = children.map(child => ({
      ...child,
      wallet: child.wallet ? {
        ...child.wallet,
        balance: child.wallet.balance.toString(),
      } : null,
    }));

    // ---- Step 4: Calculate dashboard summary statistics ----
    // Aggregated metrics for the dashboard
    const totalChildren = children.length;
    const activeChildren = children.filter(c => c.isActive).length;
    
    // Calculate total satoshis across all children
    const totalSatoshis = children.reduce((sum, child) => {
      return sum + (child.wallet?.balance ?? 0n);
    }, 0n);

    // Calculate average balance per child
    const averageBalance = totalChildren > 0 
      ? totalSatoshis / BigInt(totalChildren)
      : 0n;

    // ---- Step 5: Return aggregated dashboard response ----
    return res.status(200).json({
      message: 'Dashboard retrieved successfully',
      summary: {
        totalChildren,
        activeChildren,
        totalSatoshis: totalSatoshis.toString(),
        averageBalance: averageBalance.toString(),
      },
      children: childrenWithFormattedBalances,
    });

  } catch (err) {
    // ---- Error Handling ----
    console.error('[CHILD] Get dashboard error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to retrieve dashboard. Please try again later.',
    });
  }
}

/**
 * Handle PATCH /api/family/children/:childId/deactivate request.
 * 
 * Soft delete endpoint: deactivate a child account without permanently deleting data.
 * 
 * HTTP Semantics:
 *   - Verb: PATCH (partial update)
 *   - Status 200: Successfully deactivated
 *   - Status 400: Bad request (validation error)
 *   - Status 404: Child not found
 *   - Status 500: Server error
 * 
 * Request Body:
 *   {
 *     // Soft delete: set isActive to false
 *     isActive: false
 *   }
 * 
 * Success Response (200):
 *   {
 *     message: "Child deactivated successfully",
 *     child: {
 *       id: 10,
 *       username: "amara-savings",
 *       isActive: false,
 *       deactivatedAt: "2024-02-17T12:00:00Z",
 *       note: "Account data and wallet history are preserved"
 *     }
 *   }
 * 
 * Why Soft Delete Instead of Hard Delete?
 *   ✅ Preserves audit trail (transaction history, savings progression)
 *   ✅ Complies with GDPR/legal requirements (data retention)
 *   ✅ Parent can optionally reactivate if needed
 *   ✅ Analytics: track deactivation patterns
 *   ✅ Prevents accidental deletion (can undo)
 *   ✅ Database constraints remain intact (no orphaned wallets)
 * 
 * What Gets Preserved:
 *   ✅ Child profile (username, dateOfBirth, avatar, colorTheme)
 *   ✅ Wallet and balance history (all satoshis)
 *   ✅ createdAt, updatedAt timestamps
 *   ❌ Hidden from normal lists (isActive = false)
 * 
 * What Gets Hidden:
 *   ❌ Child won't appear in listMyChildren (isActive = false)
 *   ❌ Child won't appear in getDashboard (isActive = false)
 *   ⚠️ Parent must explicitly request deactivated children if needed
 * 
 * Future Enhancements:
 *   - Add deactivationReason field (optional comment)
 *   - Add automatic reactivation after X days (time-limited soft delete)
 *   - Add deactivatedAt field (timestamp when deactivated)
 *   - Require email/SMS confirmation for deactivation
 *   - Add reactivation endpoint: PATCH /children/:childId/reactivate
 * 
 * Security Considerations:
 *   - Parenthood verified by ownershipMiddleware
 *   - Only parent can deactivate their own child
 *   - Data not permanently deleted (prevents regretful actions)
 * 
 * @param {object} req - Express request object (with req.child from ownership middleware)
 * @param {object} res - Express response object
 */
async function deactivateChild(req, res) {
  try {
    // ---- Step 1: Extract child ID and parent ID ----
    const childId = req.child?.id;
    const parentId = req.user?.id;

    if (!childId || !parentId) {
      console.error('[CHILD] Missing childId or parentId');
      return res.status(400).json({
        message: 'Invalid request parameters',
      });
    }

    // ---- Step 2: Validate deactivation request ----
    const validation = validators.validateDeactivateChild(req.body);

    if (!validation.isValid) {
      console.warn('[CHILD] Deactivate validation failed:', validation.error);
      return res.status(400).json({
        message: 'Invalid deactivation request',
        error: validation.error,
      });
    }

    // ---- Step 3: Update child record (soft delete) ----
    // Set isActive to false instead of deleting the record
    // All other data (wallet, history) is preserved
    const updatedChild = await prisma.child.update({
      where: { id: childId },
      data: {
        isActive: false, // Soft delete: mark as inactive
        // Could also update updatedAt here, but Prisma does this automatically
      },
      select: {
        id: true,
        username: true,
        dateOfBirth: true,
        avatar: true,
        colorTheme: true,
        parentId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ---- Step 4: Log deactivation for audit trail ----
    // TODO: Add audit logging
    // logSecurityEvent(`CHILD_DEACTIVATED`, parentId, childId, `Child ${username} deactivated`)
    console.log('[CHILD] Child deactivated:', {
      childId: updatedChild.id,
      parentId,
      username: updatedChild.username,
      timestamp: new Date().toISOString(),
    });

    // ---- Step 5: Return success response ----
    return res.status(200).json({
      message: 'Child deactivated successfully',
      child: {
        id: updatedChild.id,
        username: updatedChild.username,
        isActive: updatedChild.isActive,
        deactivatedAt: updatedChild.updatedAt,
        note: 'Account data and wallet history are preserved. The child will no longer appear in your family dashboard.',
      },
    });

  } catch (err) {
    // ---- Error Handling ----

    // Check for child not found
    if (err.code === 'P2025') {
      console.warn('[CHILD] Child not found for deactivation:', err.message);
      return res.status(404).json({
        message: 'Child not found',
      });
    }

    // Any other database error
    console.error('[CHILD] Deactivate child error:', err.message, err.stack);
    return res.status(500).json({
      message: 'Failed to deactivate child. Please try again later.',
    });
  }
}

module.exports = {
  createChild,
  listMyChildren,
  getChild,
  getDashboard,
  deactivateChild,
};
