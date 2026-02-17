// src/routes/auth.js
// Express Router providing authentication endpoints for Sprint 1: Auth API.
// This file implements POST /api/auth/register which allows a Parent to
// register an account. The implementation includes:
//   - Input validation (email format, password strength, Kenyan phone format)
//   - Duplicate-email prevention
//   - Password hashing with bcrypt
//   - Immediate JWT issuance (parent is logged in after registration)
//   - Detailed error handling with appropriate HTTP status codes

const express = require('express');
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken'); // For issuing JWT tokens
const { prisma } = require('../config/db'); // Prisma client
const env = require('../config/env'); // Validated environment config

const router = express.Router();

// Configuration / constants
const SALT_ROUNDS = 10; // bcrypt salt rounds (cost factor for hashing)

// ============================================
// Swagger/OpenAPI Documentation
// ============================================
/**
 * Swagger/OpenAPI schema definitions and documentation for the register endpoint.
 *
 * The following JSDoc-style comments are picked up by swagger-jsdoc (if configured)
 * and produce interactive API docs. They document the request body, responses
 * and provide example payloads.
 */

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
 *         token:
 *           type: string
 *           description: JWT token for authenticated requests
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new Parent account and receive a JWT
 *     tags:
 *       - Auth
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
 *         description: Validation error (invalid input format or constraints)
 *       409:
 *         description: Conflict - email already registered
 *       500:
 *         description: Server error
 */

// ============================================
// Helper Functions for Input Validation
// ============================================

/**
 * Validate email format using a RFC-compliant regex.
 * For production, consider using a library like validator.js.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[^<>()[\]\\.,;:\s@"]+\.)+[^<>()[\]\\.,;:\s@"]{2,})$/i;
  return re.test(String(email).toLowerCase());
}

/**
 * Validate Kenyan phone number in international format.
 * Expected format: +2547XXXXXXXX (where X is a digit 0-9).
 *
 * @param {string} phone
 * @returns {boolean}
 */
function isValidKenyanPhone(phone) {
  // Kenyan mobile numbers: +254 (country code) + 7XX XXXXXX (9 digits, typically starting with 7)
  return /^\+2547\d{8}$/.test(phone);
}

// ============================================
// Route Handler: POST /register
// ============================================

/**
 * POST /api/auth/register
 *
 * Register a new parent account.
 *
 * Workflow:
 *   1. Extract and validate request body (fullName, email, password, phoneNumber)
 *   2. Check for existing account with the same email (prevent duplicates)
 *   3. Hash the password using bcrypt
 *   4. Create a new Parent record in the database via Prisma
 *   5. Generate a JWT token (includes id and email)
 *   6. Return the token to the client (parent is immediately logged in)
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, phoneNumber } = req.body;

    // ---- Step 1: Validate presence of required fields ----
    if (!fullName || !email || !password || !phoneNumber) {
      return res.status(400).json({
        message: 'Missing required fields: fullName, email, password, phoneNumber',
      });
    }

    // ---- Step 2: Validate email format ----
    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: 'Invalid email format',
      });
    }

    // ---- Step 3: Validate password strength (minimum 8 characters) ----
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long',
      });
    }

    // ---- Step 4: Validate Kenyan phone number format ----
    if (!isValidKenyanPhone(phoneNumber)) {
      return res.status(400).json({
        message: 'Phone number must be in Kenyan format: +2547XXXXXXXX',
      });
    }

    // ---- Step 5: Check for duplicate email (prevent multiple registrations) ----
    const existingParent = await prisma.parent.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingParent) {
      return res.status(409).json({
        message: 'An account with that email already exists',
      });
    }

    // ---- Step 6: Hash password before storing ----
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // ---- Step 7: Create Parent record in database ----
    const parent = await prisma.parent.create({
      data: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phoneNumber: phoneNumber.trim(),
        password: hashedPassword,
      },
    });

    // ---- Step 8: Generate JWT token ----
    const payload = {
      id: parent.id,
      email: parent.email,
    };

    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });

    // ---- Step 9: Return success response with token ----
    return res.status(201).json({
      message: 'User registered successfully',
      token,
    });

  } catch (err) {
    // Handle Prisma-specific errors
    if (err.code === 'P2002') {
      // Unique constraint violation (shouldn't reach here due to our check above, but just in case)
      console.error('[AUTH] Unique constraint violation:', err.message);
      return res.status(409).json({ message: 'Email already exists' });
    }

    // Log error server-side for debugging
    console.error('[AUTH] Registration error:', err);

    // Return generic error to client (don't expose internal details)
    return res.status(500).json({
      message: 'Failed to register user. Please try again later.',
    });
  }
});

module.exports = router;

