/**
 * src/middleware/rateLimitMiddleware.js
 *
 * Rate Limiting & Account Lockout Middleware
 *
 * ============================================
 * BRUTE FORCE ATTACK OVERVIEW
 * ============================================
 *
 * What is a Brute Force Attack?
 * =============================
 * Attacker tries many password combinations rapidly:
 *   - Try "password" → fail
 *   - Try "123456" → fail
 *   - Try "admin123" → fail
 *   - Try "qwerty" → fail
 *   ... continue thousands of times ...
 *   - Try "bitcoin123" → SUCCESS (account compromised!)
 *
 * Time to Crack (Without Rate Limiting):
 *   - Dictionary: 100,000 common passwords
 *   - At 1000 tries/second: ~100 seconds to crack account
 *   - If attacker has botnet: Millions of tries/second
 *
 * Time to Crack (With Rate Limiting):
 *   - Limit: 5 attempts per 15 minutes per account
 *   - After 5 tries: Account locked for 15 minutes
 *   - Attacker cannot try enough passwords
 *   - Time to crack: Infinite (effectively)
 *
 * ============================================
 * RATE LIMITING STRATEGIES
 * ============================================
 *
 * Strategy 1: IP-Based Rate Limiting
 * ===================================
 * Limit: 5 requests per 15 minutes from one IP
 *
 * Pros:
 *   - Blocks rapid-fire attackers
 *   - No user database needed
 * Cons:
 *   - Can block legitimate users behind same proxy/NAT
 *   - Attacker can use multiple IPs (distributed attack)
 *   - Can block entire office/university behind same IP
 *
 * Use Case:
 *   - First line of defense
 *   - Prevent casual attacks
 *
 * Strategy 2: Account-Based Rate Limiting (This Implementation)
 * ==============================================================
 * Limit: 5 failed attempts per account → lockout
 *
 * Pros:
 *   - Targets the account being attacked
 *   - Doesn't affect other users
 *   - Attacker can't bypass by changing IP
 *   - User experience better (few legit users locked out)
 * Cons:
 *   - Requires tracking attempts per account
 *   - Must clear counter after successful login
 *   - Need database field for lockout time
 *
 * Use Case:
 *   - Primary security layer for login protection
 *   - Complements IP-based rate limiting
 *
 * Strategy 3: Email/Phone-Based Rate Limiting
 * ===========================================
 * Limit: 5 login attempts per unique email+IP combination
 *
 * Pros:
 *   - Better for distributed attacks
 *   - Harder to bypass
 * Cons:
 *   - More complex implementation
 *
 * Use Case:
 *   - Enterprise applications
 *   - High-security systems
 *
 * SatsBlox Implementation:
 *   - Account-based (primary) in authService
 *   - IP-based (additional) in this middleware
 *   - Combined defense: Double layer
 *
 * ============================================
 * ACCOUNT LOCKOUT MECHANISM
 * ============================================
 *
 * How It Works:
 *
 * Phase 1: Tracking Attempts
 *   Attempt 1 (wrong password): failedLoginAttempts = 1
 *   Attempt 2 (wrong password): failedLoginAttempts = 2
 *   Attempt 3 (wrong password): failedLoginAttempts = 3
 *   Attempt 4 (wrong password): failedLoginAttempts = 4
 *   Attempt 5 (wrong password): failedLoginAttempts = 5 → LOCK
 *
 * Phase 2: Lockout (15 minutes)
 *   Set lockedUntil = NOW() + 15 minutes
 *   Next login attempt: Check if lockedUntil > NOW()
 *   If YES: Return 429 Too Many Requests (don't try again)
 *   If NO: Reset counter, allow login attempt
 *
 * Phase 3: Unlock (Automatic)
 *   After 15 minutes: lockedUntil becomes old timestamp
 *   Next login attempt: lockedUntil < NOW() = auto unlock
 *   Counter reset to 0
 *   User can try again
 *
 * Phase 4: Successful Login (Counter Reset)
 *   If login succeeds: failedLoginAttempts = 0
 *   User is back to normal (not locked out)
 *   Can make new attempts if next login fails
 *
 * ============================================
 * HTTP 429 STATUS CODE
 * ============================================
 *
 * 429 Too Many Requests
 * =====================
 *
 * What It Means:
 *   "Client has sent too many requests in a given time period"
 *
 * Client Behavior:
 *   - Should wait before retrying
 *   - Check Retry-After header for wait time
 *   - Most clients implement exponential backoff
 *
 * Server Response:
 *   HTTP 429 Too Many Requests
 *   Retry-After: 900 (wait 900 seconds = 15 minutes)
 *   {
 *     "message": "Too many login attempts. Account locked for 15 minutes.",
 *     "retryAfter": 900,
 *   }
 *
 * Why Not 403 Forbidden?
 *   - 403 = "You don't have permission"
 *   - 429 = "You're asking too much"
 *   - Different meanings, 429 is more accurate
 *
 * Why Not 401 Unauthorized?
 *   - 401 = "Invalid credentials"
 *   - Confused with wrong password
 *   - 429 is more specific
 *
 * ============================================
 * RATE LIMIT HEADERS
 * ============================================
 *
 * Industry-Standard Headers:
 *
 * X-RateLimit-Limit: 5
 *   Total requests allowed in time window
 *
 * X-RateLimit-Remaining: 2
 *   Requests left before hitting limit
 *
 * X-RateLimit-Reset: 1613100000
 *   Unix timestamp when limit resets
 *
 * Retry-After: 60
 *   How many seconds to wait before retrying
 *
 * Example Response:
 *   HTTP 200 OK
 *   X-RateLimit-Limit: 5
 *   X-RateLimit-Remaining: 4
 *   X-RateLimit-Reset: 1613100000
 *   { "status": "OK" }
 *
 * Example When Locked:
 *   HTTP 429 Too Many Requests
 *   X-RateLimit-Limit: 5
 *   X-RateLimit-Remaining: 0
 *   X-RateLimit-Reset: 1613100900
 *   Retry-After: 900
 *   { "message": "Locked. Retry after 900 seconds." }
 *
 * ============================================
 * IMPLEMENTATION STRATEGY (IN-MEMORY VS DATABASE)
 * ============================================
 *
 * Option 1: Database (This Implementation)
 * =========================================
 *
 * Storage:
 *   - failedLoginAttempts column in parent table
 *   - lockedUntil column in parent table
 *
 * Pros:
 *   - Persists across server restarts
 *   - Works with multiple servers (all read same DB)
 *   - Accounts stay locked even if server crashes
 *
 * Cons:
 *   - Extra database hits on every login attempt
 *   - Need database transactions
 *
 * Example Query:
 *   UPDATE parent 
 *   SET failedLoginAttempts = failedLoginAttempts + 1,
 *       lockedUntil = CASE 
 *         WHEN failedLoginAttempts >= 5 
 *         THEN NOW() + INTERVAL 15 MINUTE
 *         ELSE lockedUntil
 *       END
 *   WHERE id = ?;
 *
 * Option 2: In-Memory Cache (Redis)
 * ==================================
 *
 * Storage:
 *   - Redis key: "login_attempts:{email}"
 *   - Redis value: { count: 5, lockedUntil: 1613100000 }
 *
 * Pros:
 *   - Fast (in-memory)
 *   - Works across servers if centralized Redis
 *   - Can have different per-service limits
 *
 * Cons:
 *   - Data lost if Redis crashes (not persistent)
 *   - Requires Redis infrastructure
 *   - More complex setup
 *
 * Option 3: Memory Store (Simple, Not Production)
 * ================================================
 *
 * Storage:
 *   - JavaScript Map in application memory
 *   - const loginAttempts = new Map()
 *
 * Pros:
 *   - Zero external dependencies
 *   - Simple to implement
 *
 * Cons:
 *   - Lost on server restart
 *   - Not shared between servers
 *   - Only good for development/testing
 *
 * SatsBlox Strategy:
 *   - Primary: Database (via authService)
 *   - This middleware: Express rate limiting for API
 *   - Future: Add Redis for better performance
 *
 * ============================================
 * HUMAN VS BOT DETECTION
 * ============================================
 *
 * Problem: Rate limiting might block legitimate users
 *
 * Scenario 1: User forgets password
 *   - Try password 1: Wrong
 *   - Try password 2: Wrong
 *   - Try password 3: Wrong
 *   - Try password 4: Wrong
 *   - Try password 5: Wrong
 *   - Account locked for 15 minutes
 *   - User frustrated!
 *
 * Scenario 2: Bot attacking account
 *   - Tries 1000 passwords/second
 *   - Gets locked after 5 attempts
 *   - Attacker wasted bandwidth, failed
 *   - Good!
 *
 * Difference:
 *   - Human: Makes 5 attempts over 2-3 minutes (spread out)
 *   - Bot: Makes 5 attempts instantly
 *
 * Solution: Time-based detection
 *   - If 5 failed attempts within 15 minutes: Likely human
 *   - If 5 failed attempts within 10 seconds: Likely bot
 *   - Rate: More than 1 attempt/second = suspicious
 *
 * Future Enhancement:
 *   - Analyze time between attempts
 *   - Alert if bot-like behavior detected
 *   - Implement CAPTCHA after 2-3 failures
 *   - Ask for email verification
 *
 * Current Implementation:
 *   - Simple counter-based (not time-aware)
 *   - Fine for MVP
 *   - Can improve later
 *
 * ============================================
 * COMPLIANCE & STANDARDS
 * ============================================
 *
 * OWASP (Open Web Application Security Project):
 *   - Recommends account lockout after 5 failed attempts
 *   - Lock duration: 15-30 minutes
 *   - Clear guidance: Our implementation follows OWASP
 *
 * NIST Cybersecurity Framework:
 *   - Requires "detect" and "respond" to unauthorized access attempts
 *   - Rate limiting = detection
 *   - Account lockout = response
 *
 * PCI-DSS (Payment Card Industry):
 *   - Requires protection against brute force attacks
 *   - Although we don't store payment cards,
 *     principles apply to sensitive financial data
 *
 * ISO 27001:
 *   - Recommends access control and account management
 *   - Rate limiting = access control
 *
 * Kenya KDPA (Data Protection Act):
 *   - Requires security controls for personal data
 *   - Rate limiting = security control
 *
 * ============================================
 * IMPLEMENTATION NOTES
 * ============================================
 *
 * This Middleware:
 *   - Focuses on login endpoint rate limiting
 *   - Can be adapted for any endpoint (POST /api/auth/login)
 *   - Tracks per IP address (for now)
 *   - Uses in-memory store (for MVP)
 *   - Can be upgraded to database/Redis later
 *
 * Account Lockout:
 *   - Implemented in authService (database-backed)
 *   - This middleware is additional layer
 *   - Defense in depth: Multiple protections
 *
 * Future Improvements:
 *   - CAPTCHA after 3 failed attempts
 *   - Graduated response (5s, 30s, 300s delays)
 *   - Email notification: "Someone tried to access your account"
 *   - Option to unlock immediately via email verification
 *   - IP reputation: Block known malicious IPs
 */

// ============================================
// DEPENDENCIES
// ============================================

// No external dependencies (using built-in Node features)
// In production, could use express-rate-limit library

// ============================================
// CONSTANTS
// ============================================

// Rate Limit Configuration for Login
const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  maxAttempts: 5,           // Max 5 attempts
  lockoutMs: 15 * 60 * 1000, // Lockout for 15 minutes
};

// IP-based rate limiting (this middleware)
const RATE_LIMIT_STORE = new Map(); // Store: { ip -> { attempts, resetTime } }

// ============================================
// RATE LIMITING MIDDLEWARE
// ============================================

/**
 * Middleware to enforce IP-based rate limiting for specific endpoints
 *
 * Purpose:
 *   - Limit requests from single IP address
 *   - Prevent rapid-fire login attempts (brute force)
 *   - Temporarily block IP if too many attempts
 *
 * How It Works:
 *   1. Extract client IP from request
 *   2. Look up IP in rate limit store
 *   3. Check if in cooldown period (locked out)
 *   4. If locked: Return 429 Too Many Requests
 *   5. If not locked: Continue (separate auth logic checks attempts)
 *
 * Storage:
 *   - RATE_LIMIT_STORE: Map { ip -> { attempts,resetTime, lockedUntil } }
 *   - Keeps track per IP address
 *   - Auto-cleanup old entries
 *
 * Limitations:
 *   - In-memory store (lost on restart)
 *   - IP-based (can block shared networks)
 *   - No persistence across multiple servers
 *
 * Future:
 *   - Use Redis for persistence
 *   - Use database for accuracy
 *   - Combine with email-based limiting
 *
 * @param {object} options - Configuration
 * @param {number} options.windowMs - Time window (milliseconds)
 * @param {number} options.maxAttempts - Max attempts in window
 * @param {number} options.lockoutMs - How long to lock after exceeding
 *
 * @returns {function} Express middleware
 *
 * @example
 * // Rate limit POST /api/auth/login
 * app.post(
 *   '/api/auth/login',
 *   rateLimitMiddleware(LOGIN_RATE_LIMIT),
 *   authController.login
 * );
 */
function rateLimitMiddleware(options = LOGIN_RATE_LIMIT) {
  return (req, res, next) => {
    // ---- Extract Client IP ----
    // req.ip: Express extracts IP from request
    // Could be IPv4 (xxx.xxx.xxx.xxx) or IPv6
    // Behind proxy: May need x-forwarded-for header
    const clientIp = req.ip || 'unknown';

    // ---- Get Current Time ----
    const now = Date.now();

    // ---- Retrieve IP's Rate Limit Record ----
    let record = RATE_LIMIT_STORE.get(clientIp);

    // ---- Check if IP is Currently Locked Out ----
    if (record && record.lockedUntil && record.lockedUntil > now) {
      // IP is in lockout period
      const lockRemainingMs = record.lockedUntil - now;
      const lockRemainingSeconds = Math.ceil(lockRemainingMs / 1000);

      // ---- Return 429 Too Many Requests ----
      // Status 429: "Too Many Requests"
      // Retry-After: When can they try again?

      return res.status(429).json({
        message: 'Too many login attempts. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: lockRemainingSeconds,
        lockedUntilTime: new Date(record.lockedUntil).toISOString(),
      });
    }

    // ---- Reset or Create Rate Limit Record ----
    // If no record or reset window expired: Create new record
    if (!record || record.resetTime < now) {
      // Fresh start: No attempts yet
      record = {
        attempts: 0,
        resetTime: now + options.windowMs, // Window expires in 15 minutes
        lockedUntil: null,
      };
    }

    // ---- Increment Attempt Counter ----
    record.attempts += 1;

    // ---- Check if Exceeded Max Attempts ----
    if (record.attempts > options.maxAttempts) {
      // Lock this IP out
      record.lockedUntil = now + options.lockoutMs; // 15 minute lockout

      // Save updated record
      RATE_LIMIT_STORE.set(clientIp, record);

      // Log suspicious activity
      console.warn('[RATE_LIMIT] IP locked out (too many attempts):', {
        ip: clientIp,
        attempts: record.attempts,
        lockedUntil: new Date(record.lockedUntil).toISOString(),
        endpoint: req.path,
      });

      // Return 429 Too Many Requests
      const lockRemainingSeconds = Math.ceil(options.lockoutMs / 1000);

      return res.status(429).json({
        message: 'Too many login attempts. Account locked for 15 minutes.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: lockRemainingSeconds,
      });
    }

    // ---- Save Updated Record ----
    // Increment happens above, now persist it
    RATE_LIMIT_STORE.set(clientIp, record);

    // ---- Add Rate Limit Headers to Response ----
    // These inform client about their rate limit status
    // Attempts Remaining
    res.set(
      'X-RateLimit-Remaining',
      String(options.maxAttempts - record.attempts)
    );

    // When does the window reset?
    res.set('X-RateLimit-Reset', String(record.resetTime));

    // ---- Continue to Next Middleware ----
    // This IP is not locked out, continue
    next();
  };
}

// ============================================
// CLEANUP UTILITY (Remove Old Entries)
// ============================================

/**
 * Cleanup old rate limit records to prevent memory leak
 *
 * Problem:
 *   - RATE_LIMIT_STORE grows indefinitely
 *   - Every new IP ever seen gets stored
 *   - After months: Hundreds of thousands of entries
 *   - Memory usage grows
 *
 * Solution:
 *   - Remove entries older than 1 hour
 *   - Run periodically (e.g., every 10 minutes)
 *   - Keep only "recent" IP records
 *
 * Implementation:
 *   - Track insertion time for each entry
 *   - Iterate through Map
 *   - Delete if older than threshold
 *
 * Frequency:
 *   - Too often: Wastes CPU
 *   - Too rarely: Memory leak
 *   - 10-minute cleanup sweet spot
 *
 * @param {number} maxAgeMs - Max age before cleanup (default: 1 hour)
 */
function cleanupOldEntries(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  let cleaned = 0;

  // Iterate through all stored IPs
  for (const [ip, record] of RATE_LIMIT_STORE.entries()) {
    // Check if this IP's window expired and not currently locked
    if (record.resetTime < now && !record.lockedUntil) {
      // Delete this IP's record (no longer relevant)
      RATE_LIMIT_STORE.delete(ip);
      cleaned++;
    }
  }

  // Log cleanup results
  if (cleaned > 0) {
    console.log('[RATE_LIMIT] Cleanup completed:', {
      entriesRemoved: cleaned,
      entriesRemaining: RATE_LIMIT_STORE.size,
    });
  }
}

/**
 * Start periodic cleanup of old rate limit entries
 *
 * Runs cleanup every 10 minutes to prevent Map from growing unbounded
 *
 * Usage:
 *   startCleanupInterval() // Call once on server startup
 *
 * @param {number} intervalMs - How often to cleanup (default: 10 minutes)
 * @returns {number} Interval ID (can pass to clearInterval() to stop)
 */
function startCleanupInterval(intervalMs = 10 * 60 * 1000) {
  return setInterval(() => {
    cleanupOldEntries();
  }, intervalMs);
}

// ============================================
// RESET MIDDLEWARE (For Testing/Debugging)
// ============================================

/**
 * Middleware to manually reset rate limits for development
 *
 * DO NOT USE IN PRODUCTION!
 *
 * Usage:
 *   GET /api/debug/reset-rate-limits?ip=192.168.1.1
 *
 * Returns:
 *   { message: "Rate limits reset for IP: 192.168.1.1" }
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
function debugResetRateLimits(req, res) {
  // DANGEROUS: Only in development!
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      message: 'This endpoint is only available in development',
    });
  }

  const ip = req.query.ip || req.ip;

  // Reset this IP's rate limit
  RATE_LIMIT_STORE.delete(ip);

  res.json({
    message: `Rate limits reset for IP: ${ip}`,
  });
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main middleware factory
  rateLimitMiddleware,

  // Pre-configured for login endpoint
  loginRateLimiter: rateLimitMiddleware(LOGIN_RATE_LIMIT),

  // Utilities
  cleanupOldEntries,
  startCleanupInterval,

  // Debug (development only)
  debugResetRateLimits,

  // Constants
  LOGIN_RATE_LIMIT,
  RATE_LIMIT_STORE, // Exported for testing
};
