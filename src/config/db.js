// src/config/db.js
// Manages the Prisma client singleton and database health checks.
// This module:
//   - Ensures a single Prisma client instance (singleton pattern)
//   - Provides a health-check "ping" function to verify DB connectivity
//   - Implements detailed error diagnostics (timeout, auth, not found, etc.)

const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client (singleton)
const prisma = new PrismaClient({
  errorFormat: 'pretty', // Pretty error messages in development
});

/**
 * Perform a health check (ping) to verify database connectivity.
 * Attempts a simple query and returns detailed error info if it fails.
 *
 * @returns {Promise<void>}
 * @throws {Error} with diagnostic message
 */
async function healthCheck() {
  try {
    // Execute a simple query to test connectivity
    await prisma.$queryRaw`SELECT 1`;
    console.log('[DATABASE] Connection established successfully to PostgreSQL');
  } catch (err) {
    // Categorize the error for clearer debugging
    let errorMsg = 'Unknown database error';

    if (err.code === 'P1000') {
      errorMsg = 'Failed to reach the database server. Check DATABASE_URL and that PostgreSQL is running.';
    } else if (err.code === 'P1001') {
      errorMsg = 'Can\'t reach database server within the timeout period (network timeout).';
    } else if (err.code === 'P1002') {
      errorMsg = 'The database server was reached but timed out. The server may be busy.';
    } else if (err.code === 'P1003') {
      errorMsg = 'Your DATABASE_URL specifies a database that does not exist.';
    } else if (err.code === 'P1008') {
      errorMsg = 'Operations timed out after 5 seconds. The database may be slow or unavailable.';
    } else if (err.code === 'P1009') {
      errorMsg = 'Database "satsblox" does not exist at the specified location.';
    } else if (err.code === 'P1010') {
      errorMsg = 'User does not have permission to access the database.';
    } else if (err.code === 'P1011') {
      errorMsg = 'Error opening a connection to the database.';
    } else if (err.message && err.message.includes('password authentication failed')) {
      errorMsg = 'Invalid database credentials. Check DATABASE_URL username and password.';
    } else if (err.message && err.message.includes('ECONNREFUSED')) {
      errorMsg = 'Connection refused. Is PostgreSQL running? Check DATABASE_URL host and port.';
    } else if (err.message) {
      errorMsg = `${err.message}`;
    }

    throw new Error(`[DATABASE] Health check failed: ${errorMsg}`);
  }
}

/**
 * Disconnect from the database gracefully.
 * Call this when shutting down the server.
 */
async function disconnect() {
  await prisma.$disconnect();
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received. Disconnecting from database...');
  await disconnect();
  process.exit(0);
});

module.exports = {
  prisma,
  healthCheck,
  disconnect,
};
