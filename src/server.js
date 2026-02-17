// src/server.js
// Entry point for the SatsBlox backend.
// Startup sequence:
// 1. Load and validate environment variables (must have DATABASE_URL, JWT_SECRET, PORT)
// 2. Perform a database health check (ping)
// 3. Initialize Express app with middleware and routes
// 4. Listen for incoming requests only after all checks pass
// 5. Fail fast if any critical check fails (prevents silent errors in production)

// Load and validate configuration first (this will exit if env is invalid)
const env = require('./config/env');

const express = require('express');
const { prisma, healthCheck, disconnect } = require('./config/db');
const swaggerUi = require('swagger-ui-express');

// Attempt to load prepared swagger specs if present; if the config file is missing
// the route will still be set up defensively.
let swaggerSpecs = {};
try {
  swaggerSpecs = require('./config/swagger');
} catch (err) {
  console.warn('[SWAGGER] Specs not found or failed to load:', err.message);
}

// Import routes
const authRoutes = require('./routes/auth');

// Create Express app
const app = express();

// ============================================
// Middleware
// ============================================
app.use(express.json());

// ============================================
// Routes & Documentation
// ============================================
// Serve generated Swagger UI at /api-docs (if specs are available)
if (swaggerSpecs && Object.keys(swaggerSpecs).length) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
  console.log('[SWAGGER] OpenAPI docs available at /api-docs');
}

// Mount auth routes under /api/auth
app.use('/api/auth', authRoutes);

// Root health-check route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SatsBlox Backend is Running!' });
});

// ============================================
// Startup Sequence
// ============================================
/**
 * Start the server after validating environment and database.
 * This is an async IIFE (Immediately Invoked Function Expression).
 * It ensures:
 *   1. Environment is valid (done by env.js on require)
 *   2. Database connection is healthy
 *   3. Server only starts listening if all checks pass
 */
(async () => {
  try {
    console.log('[SERVER] Starting SatsBlox Backend...');
    console.log(`[SERVER] Environment: ${env.nodeEnv}`);
    console.log('[SERVER] Performing database health check...');

    // Perform health check (this throws if DB is unreachable or misconfigured)
    await healthCheck();

    // All checks passed; start listening
    const server = app.listen(env.port, () => {
      console.log(`[SERVER] ✓ Listening on port ${env.port}`);
      console.log(`[SERVER] ✓ Swagger UI available at http://localhost:${env.port}/api-docs`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[SERVER] SIGTERM received. Shutting down gracefully...');
      server.close(async () => {
        await disconnect();
        process.exit(0);
      });
    });

  } catch (err) {
    // Fail fast: print error and exit (prevents broken deployments)
    console.error(`[SERVER] ✗ Startup failed: ${err.message}`);
    console.error(`[SERVER] Exiting...`);
    await disconnect();
    process.exit(1);
  }
})();
