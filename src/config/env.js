// src/config/env.js
// Environment variable validation and loading using dotenv and Joi.
// This module ensures all required configuration is present before the app starts.
// If validation fails, the process exits immediately with a clear error message.

const dotenv = require('dotenv');
const Joi = require('joi');

// Load .env file into process.env
dotenv.config();

// Define the schema for required environment variables.
// Joi enforces types, presence, and valid values.
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number()
    .port()
    .default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: 'postgresql' })
    .required()
    .description('PostgreSQL connection string (required)'),
  JWT_SECRET: Joi.string()
    .min(16)
    .required()
    .description('JWT signing secret (must be at least 16 characters)'),
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
}).unknown(true); // Allow extra env vars that aren't defined above

// Validate environment on module load
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  // Fail fast: print clear error and exit if validation fails.
  console.error(
    `[ENV] Configuration error:\n${error.details.map(d => `  - ${d.message}`).join('\n')}`
  );
  process.exit(1);
}

// Export validated environment variables
module.exports = {
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  jwtSecret: envVars.JWT_SECRET,
  logLevel: envVars.LOG_LEVEL,
};
