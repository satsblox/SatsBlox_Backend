/**
 * src/config/swagger.js
 * 
 * OpenAPI 3.0 (Swagger) specification for the SatsBlox API.
 * 
 * Purpose:
 *   - Define API metadata (title, version, description)
 *   - Specify servers (development, production)
 *   - Configure security schemes (JWT Bearer authentication)
 *   - Provide base paths and global documentation
 * 
 * This file is consumed by swagger-jsdoc, which:
 *   1. Merges this base spec with JSDoc comments in route files
 *   2. Generates complete OpenAPI JSON
 *   3. Serves docs via Swagger UI at /api-docs
 * 
 * Documentation Standards:
 *   - JSDoc comments in route files define specific endpoints
 *   - This file defines global metadata and schema exports
 *   - Swagger UI displays interactive documentation
 *   - Generated JSON can be imported into tools (Postman, etc.)
 */

const swaggerJsdoc = require('swagger-jsdoc');

/**
 * Swagger/OpenAPI configuration
 * 
 * Key Sections:
 *   - definition: API metadata (info, servers, security schemes)
 *   - apis: Array of file paths to scan for JSDoc comments
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SatsBlox Backend API',
      version: '1.0.0',
      description: `
        SatsBlox is a Bitcoin savings platform for families in Kenya.
        
        ## Overview
        This API provides authentication, wallet management, and transaction capabilities
        for parents and their children to save Bitcoin together.
        
        ## Authentication
        Most endpoints require a JWT Bearer token. Obtain tokens via:
        1. **POST /api/auth/register** - Create new account
        2. **POST /api/auth/login** - Authenticate existing account
        3. **POST /api/auth/refresh** - Refresh expired token
        
        Include token in request header: \`Authorization: Bearer <token>\`
        
        ## Token Management
        - **Access Token**: Short-lived (7 minutes) for API requests
        - **Refresh Token**: Long-lived (7 days) for getting new access token
        - **Token Rotation**: Each login generates new tokens (security best practice)
        
        ## Error Handling
        All endpoints return consistent JSON error responses with HTTP status codes:
        - **400**: Bad Request (validation error)
        - **401**: Unauthorized (missing/invalid token)
        - **403**: Forbidden (insufficient permissions)
        - **404**: Not Found (resource doesn't exist)
        - **409**: Conflict (resource already exists)
        - **500**: Internal Server Error
        
        ## Validation Rules
        - **Email**: RFC 5322 format (user@example.com)
        - **Password**: Minimum 8 characters
        - **Phone Number**: Kenyan format (+2547XXXXXXXX) for M-Pesa integration
        - **Full Name**: 2-255 characters
        
        ## Security Features
        - Passwords hashed with bcrypt (10 salt rounds)
        - JWT tokens signed with HMAC-SHA256
        - Timing-safe password comparison (resists timing attacks)
        - Intentionally vague error messages (prevents user enumeration)
        - CORS headers configured for frontend integration
      `,
      contact: {
        name: 'SatsBlox Team',
        url: 'https://satsblox.com',
        email: 'support@satsblox.com',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server (local)',
        variables: {
          port: {
            default: '3000',
            description: 'Server port',
          },
        },
      },
      {
        url: 'https://api-staging.satsblox.com',
        description: 'Staging server (testing)',
      },
      {
        url: 'https://api.satsblox.com',
        description: 'Production server (live)',
      },
    ],
    
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: `
            JWT Bearer token for authenticated endpoints.
            
            Obtain via:
            - POST /api/auth/register (returns accessToken and refreshToken)
            - POST /api/auth/login (returns accessToken and refreshToken)
            - POST /api/auth/refresh (returns new accessToken)
            
            Include in requests:
            Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
            
            Token Structure:
            {
              "id": 123,          // Parent ID
              "email": "user@example.com",
              "iat": 1692374400,  // Issued-at timestamp
              "exp": 1692374820   // Expiration timestamp
            }
          `,
        },
      },
    },

    security: [
      {
        BearerAuth: [],
      },
    ],

    tags: [
      {
        name: 'Auth',
        description: 'Authentication endpoints (register, login, refresh tokens)',
      },
      {
        name: 'Parents',
        description: 'Parent account management (profile, settings)',
      },
      {
        name: 'Children',
        description: 'Child/beneficiary management (create, list, edit)',
      },
      {
        name: 'Wallets',
        description: 'Bitcoin wallet operations (balance, transactions)',
      },
    ],
  },

  // Files to scan for JSDoc @swagger comments
  apis: [
    './src/routes/auth.js',
    './src/routes/parents.js',
    './src/routes/children.js',
    './src/routes/wallets.js',
  ],
};

// Generate OpenAPI spec from JSDoc comments and base options
const swaggerSpecs = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpecs;

