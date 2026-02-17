# Code Organization Guide

## Overview

The SatsBlox backend follows a **3-tier layered architecture** with clear separation of concerns. This document explains how each component fits together and why this structure was chosen.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Client Layer                        │
│              (Web, Mobile, API Consumers)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               1. ROUTES LAYER (Entry Point)                 │
│  File: src/routes/auth.js                                   │
│  ├─ HTTP endpoint binding (POST, GET, etc.)                │
│  ├─ Request → Controller delegation                         │
│  └─ Swagger documentation (JSDoc comments)                 │
└────────────────────────┬────────────────────────────────────┘
                         │ Call controllers
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          2. CONTROLLERS LAYER (Request Handler)             │
│  File: src/controllers/authController.js                    │
│  ├─ Parse HTTP request body                                │
│  ├─ Call validators → Call services                        │
│  ├─ Map service errors to HTTP status codes                │
│  └─ Format and return HTTP response                        │
└────────────────────────┬────────────────────────────────────┘
                         │ Call services
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           3. SERVICES LAYER (Business Logic)               │
│  File: src/services/authService.js                         │
│  ├─ Authentication logic                                   │
│  ├─ Password hashing/verification (bcrypt)                │
│  ├─ JWT token generation/verification                     │
│  ├─ Database operations (Prisma calls)                    │
│  └─ Business rule enforcement                            │
└────────────────────────┬────────────────────────────────────┘
                         │ Use utilities & DB
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           4. UTILITIES & DATABASE LAYERS                    │
│  ├─ Validators: src/utils/validators.js                   │
│  │  └─ Reusable validation functions                      │
│  └─ Database: Prisma ORM (src/config/db.js)               │
│     └─ Type-safe database access                          │
└────────────────────────┬────────────────────────────────────┘
                         │ SQL
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                        │
│  ├─ parents table                                          │
│  ├─ children table                                         │
│  └─ wallets table                                          │
└─────────────────────────────────────────────────────────────┘
```

## File-by-File Breakdown

### Layer 1: Routes (`src/routes/auth.js`)

**Purpose**: Map HTTP endpoints to controller functions

```javascript
const router = express.Router();

// Each route calls a controller function
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);

module.exports = router;
```

**Key Responsibilities**:
- Define HTTP verbs (POST, GET, PUT, DELETE)
- Specify endpoint paths
- Include Swagger documentation
- Delegate to controllers (not doing business logic here!)

**Why This Structure**:
- Clean HTTP binding
- Easy to add new endpoints
- Swagger docs live with routes
- Single source of truth for API contract

### Layer 2: Controllers (`src/controllers/authController.js`)

**Purpose**: Handle HTTP request/response cycle

```javascript
async function register(req, res) {
  try {
    // Step 1: Extract and validate input
    const { fullName, email, password, phoneNumber } = req.body;
    
    // Step 2: Validate data
    const validation = validators.validateRegistrationData({...});
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }
    
    // Step 3: Call service for business logic
    const { parent, accessToken, refreshToken } = 
      await authService.registerParent({...});
    
    // Step 4: Format and return response
    return res.status(201).json({
      message: "Success",
      parent,
      accessToken,
      refreshToken
    });
    
  } catch (err) {
    // Step 5: Handle errors
    if (err.code === 'EMAIL_EXISTS') {
      return res.status(409).json({ message: "Email exists" });
    }
    return res.status(500).json({ message: "Server error" });
  }
}
```

**Key Responsibilities**:
- Extract request body/params/headers
- Call validators
- Delegate business logic to services
- Map errors to HTTP status codes (400, 401, 409, 500)
- Format response JSON

**Why This Structure**:
- HTTP logic separate from business logic
- Easy to add new endpoints
- Services can be reused from different interfaces (GraphQL, gRPC)
- Clear error-to-status-code mapping

**Testing**: Mock service layer to test controller

### Layer 3: Services (`src/services/authService.js`)

**Purpose**: Implement all business logic

```javascript
async function registerParent(userData) {
  // Step 1: Check business rules
  const existingParent = await prisma.parent.findUnique({
    where: { email: userData.email.toLowerCase() }
  });
  if (existingParent) {
    const error = new Error('Email already registered');
    error.code = 'EMAIL_EXISTS';
    throw error;
  }
  
  // Step 2: Transform data (hash password)
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  // Step 3: Database operation
  const parent = await prisma.parent.create({
    data: {
      email: userData.email.toLowerCase(),
      password: hashedPassword,
      fullName: userData.fullName,
      phoneNumber: userData.phoneNumber
    }
  });
  
  // Step 4: Generate tokens
  const { accessToken, refreshToken } = generateTokens(parent.id, parent.email);
  
  // Step 5: Return result
  return { parent, accessToken, refreshToken };
}
```

**Key Responsibilities**:
- Implement business rules (duplicate check, etc.)
- Handle cryptography (bcrypt, JWT)
- Perform database operations
- Classify errors with error codes
- Never deal with HTTP (no req/res objects)

**Why This Structure**:
- Reusable from any interface (REST, GraphQL, gRPC)
- Easy to unit test (just mock database)
- Business logic separate from HTTP concerns
- Clear error codes for controller mapping

**Testing**: Mock Prisma ORM to test pure logic

### Layer 4: Utilities (`src/utils/validators.js`)

**Purpose**: Reusable validation functions

```javascript
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email required' };
  }
  
  const regex = /^...RFC5322.../;
  if (!regex.test(email.toLowerCase())) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  return { isValid: true };
}

function validateRegistrationData(data) {
  const errors = {};
  
  // Validate each field
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) errors.email = emailValidation.error;
  
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.isValid) errors.password = passwordValidation.error;
  
  // ... more fields
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
```

**Key Responsibilities**:
- Validate individual fields
- Return consistent { isValid, error? } format
- Provide detailed error messages
- Support composition (validateRegistrationData calls validateEmail, etc.)

**Why This Structure**:
- Reusable across multiple endpoints
- Easy to modify validation rules in one place
- Detailed field-level error messages
- No business logic mixing with validation

**Example Usage in Controller**:
```javascript
const validation = validators.validateRegistrationData(req.body);
if (!validation.isValid) {
  return res.status(400).json({ errors: validation.errors });
}
```

### Middleware (`src/middleware/`)

#### Authentication Middleware (`src/middleware/authMiddleware.js`)

**Purpose**: Verify JWT tokens on protected routes

```javascript
function authenticate(req, res, next) {
  try {
    // Step 1: Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({
        message: 'Authorization header is required'
      });
    }
    
    // Step 2: Parse Bearer token
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer') {
      return res.status(400).json({
        message: 'Authorization must be: Bearer <token>'
      });
    }
    
    // Step 3: Verify token
    const payload = jwt.verify(token, env.jwtSecret);
    
    // Step 4: Attach user to request
    req.user = {
      id: payload.id,
      email: payload.email,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000)
    };
    
    // Step 5: Continue to next middleware
    next();
    
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}
```

**Usage in Routes**:
```javascript
router.get('/protected', authenticate, (req, res) => {
  console.log(req.user); // User object attached by middleware
  res.json({ data: 'Only authenticated users see this' });
});
```

**Key Features**:
- Extracts and verifies JWT
- Attaches user info to request
- Returns 401 for invalid/expired tokens
- Two variants: `authenticate()` (required) and `authenticateOptional()` (optional)

#### Error Handler Middleware (`src/middleware/errorHandler.js`)

**Purpose**: Catch and standardize all errors

```javascript
function errorHandler(err, req, res, next) {
  // Step 1: Determine status code
  const statusCode = err.statusCode || 500;
  
  // Step 2: Log error
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}`, err.stack);
  } else {
    console.warn(`[WARN] ${req.method} ${req.path}`, err.message);
  }
  
  // Step 3: Build response
  const response = {
    message: err.message,
    timestamp: new Date().toISOString(),
    path: req.path
  };
  
  // Step 4: Send response
  res.status(statusCode).json(response);
}
```

**Usage in Server**:
```javascript
// Mount all routes first
app.use('/api/auth', authRoutes);

// Mount error handler LAST
app.use(errorHandler);
```

**Key Features**:
- Catches unhandled errors
- Standardizes error format
- Logs errors with appropriate level
- Prevents stack traces from leaking (production)

### Configuration (`src/config/`)

#### Environment Validation (`src/config/env.js`)

**Purpose**: Load and validate environment variables

```javascript
const envSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production'),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error')
});

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  console.error(`[ENV] Configuration error:\n${error.details.map(d => d.message).join('\n')}`);
  process.exit(1);
}

module.exports = {
  port: envVars.PORT,
  databaseUrl: envVars.DATABASE_URL,
  jwtSecret: envVars.JWT_SECRET,
  nodeEnv: envVars.NODE_ENV,
  logLevel: envVars.LOG_LEVEL
};
```

**Key Features**:
- Type validation (string, number, URL, etc.)
- Required vs optional fields
- Default values
- Fails fast on startup if invalid

#### Database Configuration (`src/config/db.js`)

**Purpose**: Initialize and manage Prisma client

```javascript
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[DATABASE] Connection established');
  } catch (err) {
    throw new Error(`Database health check failed: ${err.message}`);
  }
}

async function disconnect() {
  await prisma.$disconnect();
}

module.exports = { prisma, healthCheck, disconnect };
```

**Key Features**:
- Singleton pattern (one Prisma instance)
- Health check on startup
- Graceful disconnection

#### Swagger/OpenAPI (`src/config/swagger.js`)

**Purpose**: Generate and configure API documentation

```javascript
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SatsBlox API',
      version: '1.0.0',
      description: '...'
    },
    servers: [...],
    components: {
      securitySchemes: {
        BearerAuth: { /* ... */ }
      }
    }
  },
  apis: [
    './src/routes/auth.js',  // Scans for JSDoc comments
    // ... other routes
  ]
};

const specs = swaggerJsdoc(swaggerOptions);
```

**Key Features**:
- Generated from JSDoc comments in routes
- Includes security schemes (Bearer token)
- Server configuration
- Interactive documentation at /api-docs

### Main Server (`src/server.js`)

**Purpose**: Initialize Express app and start server

```javascript
const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Error handling (MUST be after all routes)
app.use(errorHandler);

// Start server
(async () => {
  try {
    await healthCheck();
    const server = app.listen(env.port, () => {
      console.log(`Listening on port ${env.port}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      server.close(async () => {
        await disconnect();
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
})();
```

**Key Features**:
- Middleware setup (JSON parser, error handler)
- Route mounting
- Database health check
- Graceful shutdown handling

## Data Flow Example: User Registration

Here's how a user registration request flows through the layers:

```
1. CLIENT sends HTTP request
   POST /api/auth/register
   Body: { fullName, email, password, phoneNumber }

2. SERVER.js
   ├─ Express.json() middleware parses request body
   └─ Routes authRoutes handling

3. ROUTES (auth.js)
   └─ router.post('/register', authController.register)

4. CONTROLLER (authController.js)
   ├─ Extract: const { fullName, email, password, phoneNumber } = req.body
   ├─ Validate: validators.validateRegistrationData(...)
   │   └─ VALIDATORS (validators.js)
   │      ├─ validateEmail() → checks RFC 5322 format
   │      ├─ validatePassword() → checks 8+ chars
   │      ├─ validateFullName() → checks 2-255 chars
   │      └─ validateKenyanPhone() → checks +2547XXXXXXXX format
   │   └─ Returns: { isValid: true/false, errors: {...} }
   ├─ If invalid → Return 400 with field errors
   ├─ Call service: authService.registerParent({...})
   │
   └─ SERVICE (authService.js)
      ├─ Check business rules:
      │  └─ DB query: prisma.parent.findUnique({ email })
      │     ├─ If exists → Throw EMAIL_EXISTS error
      │     └─ If not → Continue
      ├─ Hash password: bcrypt.hash(password, 10)
      ├─ Create parent: prisma.parent.create({...})
      ├─ Generate tokens: jwt.sign(payload, secret, options)
      │  ├─ accessToken (7 minutes)
      │  └─ refreshToken (7 days)
      └─ Return: { parent, accessToken, refreshToken }
   
   ├─ If service throws error:
   │  ├─ Check error.code
   │  ├─ Map to HTTP status (EMAIL_EXISTS → 409)
   │  └─ Return error response
   ├─ On success → Return 201 with tokens
   └─ JSON response sent to client

5. CLIENT receives HTTP response
   Status: 201 Created
   Body: { message, parent, accessToken, refreshToken }
```

## Benefits of This Architecture

### 1. **Separation of Concerns**
Each layer has a single responsibility:
- Routes: HTTP binding
- Controllers: Request/response handling
- Services: Business logic
- Utils: Validation

### 2. **Reusability**
- Services can be used from routes, GraphQL, gRPC, etc.
- Validators can be used in multiple endpoints
- Middleware can be applied to different routes

### 3. **Testability**
- Controllers: Mock services
- Services: Mock Prisma
- Validators: Direct unit tests
- Easy to test each layer independently

### 4. **Maintainability**
- Change validation logic once, affects all endpoints
- New endpoint? Reuse existing services
- Bug fix? Easier to locate in specific layer

### 5. **Scalability**
- Add new features without changing existing code
- New endpoints use existing services
- Database changes isolated to service/Prisma layer

## Best Practices Followed

✅ **DRY** (Don't Repeat Yourself)
- Validators reused across endpoints
- Services reused from multiple controllers

✅ **SOLID Principles**
- Single Responsibility: Each layer has one job
- Open/Closed: Open for extension, closed for modification
- Dependency Injection: Services injected via parameters

✅ **Security**
- Error messages don't leak information
- Passwords hashed, never logged
- Tokens verified on every protected request

✅ **Documentation**
- Inline comments explain "why" not "what"
- JSDoc for functions
- Swagger for API contract

✅ **Error Handling**
- Errors caught at each layer
- Mapped to appropriate HTTP status codes
- Logged with context (timestamp, path, request ID future)

## Adding New Features

### Example: Add a new endpoint `GET /api/auth/verify`

1. **Create service function** (src/services/authService.js)
```javascript
async function verifyToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  return payload;
}
```

2. **Create controller function** (src/controllers/authController.js)
```javascript
async function verify(req, res) {
  try {
    const { token } = req.body;
    const payload = await authService.verifyToken(token);
    res.status(200).json({ payload });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}
```

3. **Add route** (src/routes/auth.js)
```javascript
router.post('/verify', authController.verify);
```

4. **Add Swagger docs** (above the route)
```javascript
/**
 * @swagger
 * /api/auth/verify:
 *   post:
 *     summary: Verify a JWT token
 */
```

Done! You've added a new endpoint following the same pattern.

---

**This architecture makes the code**:
- Easy to read
- Easy to modify
- Easy to test
- Easy to extend
- Production-ready
