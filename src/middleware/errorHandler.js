/**
 * src/middleware/errorHandler.js
 * 
 * Global error handling middleware for consistent error responses.
 * 
 * Purpose:
 *   - Catch unhandled errors from any route/middleware
 *   - Format all errors into consistent JSON response structure
 *   - Prevent stack traces from leaking to clients
 *   - Enable centralized error logging and monitoring
 * 
 * Express Error Middleware:
 *   - Express recognizes 4-parameter middleware as error handlers
 *   - Signature: (err, req, res, next) - note the 4 parameters!
 *   - Called when any middleware/route passes error to next()
 *   - Called when any try/catch throws an uncaught error
 * 
 * Usage in server.js:
 *   // Mount ALL routes FIRST
 *   app.use('/api/auth', authRoutes);
 *   // Mount error handler LAST
 *   app.use(errorHandler);
 * 
 * Error Flow:
 *   1. Route handler or middleware encounters error
 *   2. Error is passed to errorHandler via next(err)
 *   3. Error handler formats and returns response
 *   4. Response is sent to client
 * 
 * Important Note:
 *   - If error handler throws, Express will crash!
 *   - Error handler should NEVER throw
 *   - Always send a response, even if formatting error
 */

/**
 * Global error handler middleware.
 * 
 * HTTP Status Code Strategy:
 *   - 400 (Bad Request): Client error (validation, malformed request)
 *   - 401 (Unauthorized): Authentication failure (invalid token)
 *   - 403 (Forbidden): Authorization failure (valid token, insufficient permissions)
 *   - 404 (Not Found): Resource not found
 *   - 409 (Conflict): Resource already exists (duplicate email)
 *   - 500 (Internal Server Error): Unexpected server error
 * 
 * Logging Strategy:
 *   - Warn: Expected errors (validation, auth failures)
 *   - Error: Unexpected errors (should investigate)
 *   - Include request ID for tracing (if available)
 * 
 * Response Format:
 *   {
 *     message: "Human-readable error message",
 *     error?: "ERROR_CODE", // Optional: for client error handling
 *     timestamp: "2024-02-17T10:30:00Z",
 *     path: "/api/auth/register"
 *   }
 * 
 * Development vs Production:
 *   - Development: Include stack trace for debugging
 *   - Production: Hide stack trace from client
 * 
 * @param {Error} err - The error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function (not needed, but required signature)
 */
function errorHandler(err, req, res, next) {
  // ---- Step 1: Determine error status code ----
  // Default to 500 if status is not set
  let statusCode = err.statusCode || err.status || 500;

  // Ensure status code is valid
  if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }

  // ---- Step 2: Determine error message ----
  // Use error message if available, fall back to generic message
  let message = err.message || 'An unexpected error occurred';

  // For production, use generic message for 500 errors (don't expose internals)
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal server error';
  }

  // ---- Step 3: Log error ----
  // Different levels depending on error severity
  if (statusCode >= 500 || statusCode < 400) {
    // 5xx errors and unexpected cases: log as error
    console.error(
      `[ERROR] ${req.method} ${req.path} - ${statusCode} - ${message}`,
      {
        timestamp: new Date().toISOString(),
        stack: err.stack,
        body: req.body,
      }
    );
  } else {
    // 4xx errors: log as warning (expected client errors)
    console.warn(
      `[WARN] ${req.method} ${req.path} - ${statusCode} - ${message}`,
      {
        timestamp: new Date().toISOString(),
      }
    );
  }

  // ---- Step 4: Build error response ----
  const response = {
    message,
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Add error code if available (for client logic)
  if (err.code) {
    response.error = err.code;
  }

  // Include stack trace in development (helps debugging)
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  // ---- Step 5: Send response ----
  // Try to send response, but be careful not to throw ourselves
  try {
    res.status(statusCode).json(response);
  } catch (sendErr) {
    // Response already started or other send error
    // This is rare but we should handle gracefully
    console.error('[ERROR] Failed to send error response:', sendErr.message);
    // At this point, headers are already sent, can't change status code
    // Just try to close the response
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  }
}

/**
 * Express 404 (Not Found) handler middleware.
 * 
 * Purpose:
 *   - Catch requests to non-existent routes
 *   - Return standardized 404 response
 * 
 * Usage in server.js:
 *   // Mount ALL routes FIRST
 *   app.use('/api/auth', authRoutes);
 *   // Mount 404 handler AFTER all routes
 *   app.use(notFoundHandler);
 *   // Mount error handler LAST
 *   app.use(errorHandler);
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function notFoundHandler(req, res) {
  // Log 404s (useful for finding broken client implementations)
  console.warn(`[404] ${req.method} ${req.path} - Route not found`);

  // Return consistent 404 response
  res.status(404).json({
    message: 'Route not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
