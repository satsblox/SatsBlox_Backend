/**
 * src/services/encryptionService.js
 * 
 * Field-Level Encryption Service
 * 
 * ============================================
 * SECURITY ARCHITECTURE OVERVIEW
 * ============================================
 * 
 * This module implements field-level encryption for sensitive personally identifiable
 * information (PII) that doesn't require hashing (unlike passwords, which are one-way).
 * 
 * Why Field-Level Encryption?
 * ============================
 * 
 * Problem:
 *   - Database stores: phone numbers (M-Pesa integration), child names, parent names
 *   - If database is compromised: attackers can link users to phone numbers
 *   - If database is publicly exposed: privacy violation for entire family
 *   - Phone numbers especially: directly linked to mobile money accounts (M-Pesa)
 * 
 * Solution:
 *   - Encrypt at application layer before storing in database
 *   - Only decrypt when needed to display to authentic user
 *   - Encryption key never stored in database or exposed to client
 *   - Database compromise: attackers get encrypted blob, not readable data
 * 
 * Data Security Levels:
 *   1. Passwords: One-way hash (bcrypt) - never stored plaintext, never decrypted
 *   2. PII (Phone, Names): Symmetric encryption - encrypted at rest, decrypted on read
 *   3. IDs, timestamps: No encryption - not sensitive
 * 
 * ============================================
 * THREAT MODEL
 * ============================================
 * 
 * Threat 1: Database Compromise
 *   Attack: Hacker gains SQL access, dumps all tables
 *   Impact Without Encryption: Plaintext phone numbers → M-Pesa accounts compromised
 *   Impact With Encryption: Gibberish ciphertext → unusable without encryption key
 *   Mitigation: Encryption + keeping key outside DB
 * 
 * Threat 2: Backup Exposure
 *   Attack: Database backup left on S3 with wrong permissions
 *   Impact Without Encryption: Plaintext data readable
 *   Impact With Encryption: Ciphertext only, key not in backup
 *   Mitigation: Encryption + separate key management
 * 
 * Threat 3: Application Logs
 *   Attack: Logs accidentally committed to GitHub with user data
 *   Impact Without Encryption: Plaintext phone numbers visible in logs
 *   Impact With Encryption: Only hash shown, not decryptable
 *   Mitigation: Never log encrypted values as plaintext
 * 
 * Threat 4: Memory Dumps
 *   Attack: Attacker gets memory dump of running server
 *   Impact: Decrypted values in RAM (acceptable - key also in RAM)
 *   Mitigation: Acceptable risk - keys periodically rotated
 * 
 * ============================================
 * ENCRYPTION ALGORITHM CHOICE
 * ============================================
 * 
 * Algorithm: AES-256-GCM (Advanced Encryption Standard, 256-bit, Galois/Counter Mode)
 * 
 * Why AES-256-GCM?
 *   - AES: Industry standard, vetted by NSA, used by US Government
 *   - 256-bit: Quantum-resistant (not quite, but better than 128-bit)
 *   - GCM: Provides authentication (detects tampering)
 * 
 * Alternatives Considered:
 *   - AES-128: Faster but less secure
 *   - ChaCha20-Poly1305: Also good, but Node.js built-in crypto supports AES better
 *   - RSA: Asymmetric, slower, unnecessary for this use case
 * 
 * ============================================
 * ENCRYPTION KEY MANAGEMENT
 * ============================================
 * 
 * Key Source: Environment variable ENCRYPTION_KEY (should be 32 bytes for AES-256)
 * 
 * Production Best Practice:
 *   - Generate: `openssl rand -hex 32` → outputs 64 hex chars = 32 bytes
 *   - Store: AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault
 *   - Environment: Never commit to git, load from secure vault at runtime
 *   - Rotation: Every 90 days (with decryption of old values, re-encryption with new key)
 * 
 * Development:
 *   - Generate once: `ENCRYPTION_KEY=openssl rand -hex 32`
 *   - Store in .env (NEVER commit .env to git)
 *   - Check .gitignore has .env
 * 
 * ============================================
 * ENCRYPTION FLOW
 * ============================================
 * 
 * Scenario: Parent provides phone number
 * 
 * WRITE (Phone Number Encryption):
 *   1. Parent enters: "0712345678"
 *   2. Application receives phone number
 *   3. Validation: Is it valid Kenya phone format? LEN > 0? No special chars?
 *   4. Call encryptField("0712345678", "PHONE")
 *   5. Encryption service:
 *      - Generate random IV (initialization vector): 16 bytes of random data
 *      - Create cipher: AES-256-GCM with key and IV
 *      - Encrypt: plaintext → ciphertext
 *      - Get auth tag: HMAC for tampering detection
 *      - Return: iv + ciphertext + authTag concatenated
 *   6. Database stores: encrypted blob (~60 bytes)
 * 
 * READ (Phone Number Decryption):
 *   1. Database query returns: encrypted blob (~60 bytes)
 *   2. Call decryptField(encryptedBlob, "PHONE")
 *   3. Decryption service:
 *      - Extract: IV (first 16 bytes), authTag (last 16 bytes), ciphertext (middle)
 *      - Create decipher: AES-256-GCM with key and IV
 *      - Set auth tag: for tampering verification
 *      - Decrypt: ciphertext → plaintext
 *      - If auth tag doesn't match: THROW ERROR (data was modified!)
 *      - Return: plaintext or throw error
 *   4. Application gets: "0712345678"
 *   5. Display to authenticated parent only
 * 
 * ============================================
 * CRYPTOGRAPHIC DETAILS (TECHNICAL)
 * ============================================
 * 
 * IV (Initialization Vector):
 *   - What: Random 16-byte value prepended to ciphertext
 *   - Why: Ensures same plaintext encrypts differently each time
 *   - Importance: CRITICAL - never reuse IV with same key
 *   - Generation: crypto.randomBytes(16)
 * 
 * Authentication Tag (Auth Tag):
 *   - What: 16-byte HMAC appended to ciphertext
 *   - Why: Detects if ciphertext was modified/tampered
 *   - Use: GCM mode automatically verifies during decryption
 *   - Failure: Throws EBADAUTH error if auth tag doesn't match
 * 
 * Ciphertext:
 *   - What: Encrypted plaintext output
 *   - Size: Usually same as plaintext size (for AES block cipher)
 *   - Format: Binary data (base64 encoded for storage)
 * 
 * Concatenation Strategy:
 *   - Stored format: base64(IV + ciphertext + authTag)
 *   - IV (16 bytes) + Ciphertext (variable) + AuthTag (16 bytes)
 *   - On decrypt: Extract each component, use to recreate decipher
 * 
 * ============================================
 * PERFORMANCE CONSIDERATIONS
 * ============================================
 * 
 * Encryption Cost:
 *   - AES-256-GCM: ~50-100 microseconds per field (modern CPU)
 *   - For 100 fields: ~5-10 milliseconds (negligible)
 * 
 * Key Loading:
 *   - ENCRYPTION_KEY from env: loaded at server startup
 *   - Key stored in memory for duration of process
 *   - No repeated file reads (server restart reloads)
 * 
 * Encryption vs. Security Trade-off:
 *   - Slight performance hit: worth the security gain
 *   - Database compromise = useless data
 *   - Plaintext = catastrophic privacy failure
 * 
 * ============================================
 * USAGE EXAMPLES
 * ============================================
 * 
 * Encrypting a Phone Number:
 * 
 *   const encrypted = encryptField("0712345678", "PHONE");
 *   // encrypted: "xK9pIj2L3m9oP5qR6sT7uV8wX9yZ0aB1cD2eF3gH4i="
 *   //           (base64 of: IV + ciphertext + authTag)
 * 
 * Decrypting a Phone Number:
 * 
 *   const decrypted = decryptField(encrypted, "PHONE");
 *   // decrypted: "0712345678"
 * 
 * In Database Interaction (Create Parent):
 * 
 *   const parent = await prisma.parent.create({
 *     data: {
 *       email: "parent@example.com",
 *       fullName: "John Doe",  // Could be encrypted too
 *       phoneNumber: encryptField(req.body.phoneNumber, "PHONE"),
 *       passwordHash: bcrypt.hashSync(req.body.password, 10),
 *     }
 *   });
 * 
 * In Reading Parent:
 * 
 *   const parent = await prisma.parent.findUnique({
 *     where: { id: 1 },
 *   });
 *   
 *   const phoneNumber = decryptField(parent.phoneNumber, "PHONE");
 *   console.log(`Parent phone (decrypted): ${phoneNumber}`);
 * 
 * ============================================
 * ERROR HANDLING
 * ============================================
 * 
 * Error 1: Encryption Key Not Set
 *   Cause: ENCRYPTION_KEY env variable missing
 *   Behavior: Throws error immediately on import
 *   Fix: Set ENCRYPTION_KEY before server starts
 * 
 * Error 2: Invalid Ciphertext (Tampering Detected)
 *   Cause: Ciphertext was modified, auth tag no longer matches
 *   Error Type: EBADAUTH
 *   Behavior: Throw error (don't silently fail)
 *   Response: Return 500 or 401 to client (data corrupted)
 * 
 * Error 3: Decryption with Wrong Key
 *   Cause: ENCRYPTION_KEY changed but ciphertext from old key
 *   Behavior: EBADAUTH (auth tag no longer valid)
 *   Response: Can't decrypt (need old key)
 *   Mitigation: Key rotation procedure needed
 * 
 * Error 4: Null or Undefined Input
 *   Cause: Passing null/undefined to encryptField()
 *   Behavior: Return null (don't encrypt falsy values)
 *   Rationale: Field might not exist for this record
 * 
 * ============================================
 * KEY ROTATION PROCEDURE (FUTURE)
 * ============================================
 * 
 * When to rotate: Every 90 days or if key compromised
 * 
 * Steps:
 *   1. Generate new key: `openssl rand -hex 32`
 *   2. Update environment with new key
 *   3. DO NOT delete old key yet (keep for decryption)
 *   4. Query all encrypted fields
 *   5. Decrypt with old algorithm (keep old key in env temporarily)
 *   6. Re-encrypt with new key
 *   7. Update database with new ciphertexts
 *   8. Finally: Update env to remove old key
 * 
 * Note: For this MVP, I'm not implementing key rotation
 *       but the pattern is straightforward once key management is centralized
 * 
 * ============================================
 * COMPLIANCE & STANDARDS
 * ============================================
 * 
 * GDPR Compliance:
 *   - Encryption is acceptable data protection measure
 *   - Demonstrates "reasonable security" for PII
 *   - Combined with access controls = defense in depth
 * 
 * PCI-DSS (Payment Card Industry):
 *   - Recommends field-level encryption for sensitive data
 *   - Even though we don't store card numbers, same principle applies
 * 
 * OWASP (Open Web Application Security Project):
 *   - Cryptographic Storage Cheat Sheet: recommends AES-256-GCM
 *   - Defense in depth: multiple layers (encryption + access control + logging)
 * 
 * Kenya Data Protection Act:
 *   - Requires adequate security measures for personal data
 *   - Encryption demonstrates "adequate" protection
 *   - Required for handling M-Pesa phone numbers legally
 */

// ============================================
// DEPENDENCIES
// ============================================

// crypto: Built-in Node.js module for cryptographic operations
// - createCipheriv: Creates cipher for encryption
// - createDecipheriv: Creates decipher for decryption
// - randomBytes: Generates cryptographically secure random data for IV
// - createHash: Creates hash objects (not needed here, but shown for reference)
const crypto = require('crypto');

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

// AES-256-GCM Algorithm Details
// AES: Advanced Encryption Standard
// 256: Key size in bits (32 bytes)
// GCM: Galois/Counter Mode (provides authentication)
const ALGORITHM = 'aes-256-gcm';

// IV (Initialization Vector) size in bytes
// 12 bytes is standard for GCM mode (96 bits)
// Larger is more secure but smaller is more common in practice
const IV_LENGTH = 12;

// Authentication Tag size in bytes
// Fixed at 16 bytes for AES-GCM
// Detects if ciphertext was tampered with
const AUTH_TAG_LENGTH = 16;

// Encoding for base64 conversion
// Ciphertext is binary, but JS strings need text encoding
// Base64 is safe for JSON and databases
const ENCODING = 'base64';

// Field type identifiers (for future extensibility)
// Could be used to apply different encryption strategies per field type
// Currently treated the same, but structure allows per-field customization
const FIELD_TYPES = {
  PHONE: 'PHONE',           // Kenyan phone numbers (M-Pesa integration)
  NAME: 'NAME',             // Personal names (parent/child)
  EMAIL: 'EMAIL',           // Email addresses (optional encryption)
  ADDRESS: 'ADDRESS',       // Physical address (if stored)
};

// ============================================
// LOAD & VALIDATE ENCRYPTION KEY
// ============================================

// Get encryption key from environment variable
// Must be 64 hex characters (representing 32 bytes for AES-256)
// Example: ENCRYPTION_KEY=12345678901234567890123456789012345678901234567890123456789012ab
let encryptionKey = null;

try {
  // Get key from environment
  const keyHex = process.env.ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }
  
  // Validate: Must be 64 hex characters (32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  // Convert hex string to Buffer
  // Buffer: Node.js binary data type
  // from(str, 'hex'): Parse hex string to bytes
  encryptionKey = Buffer.from(keyHex, 'hex');
  
  console.log('[ENCRYPTION] Encryption key loaded (AES-256-GCM)');
  
} catch (err) {
  // Fail fast: If encryption key is missing, server should not start
  // Having bad security is worse than no service
  console.error('[ENCRYPTION] CRITICAL ERROR:', err.message);
  process.exit(1);
}

// ============================================
// ENCRYPTION FUNCTION
// ============================================

/**
 * Encrypt a sensitive field (phone number, name, etc.)
 * 
 * Algorithm Flow:
 *   1. Generate random IV (initialization vector)
 *   2. Create cipher with key and IV
 *   3. Encrypt plaintext
 *   4. Get authentication tag (for tampering detection)
 *   5. Concatenate: IV + ciphertext + authTag
 *   6. Return as base64 string for storage
 * 
 * Security Properties:
 *   - Determinism: Different encryption each time (due to random IV)
 *     This is GOOD for security (prevents frequency analysis attacks)
 *   - Authentication: AuthTag prevents tampering
 *   - Confidentiality: Plaintext protected from DB compromise
 * 
 * Performance:
 *   - Time: ~100 microseconds per field
 *   - Space: ~60 bytes per field (IV + ciphertext + authTag + base64 overhead)
 * 
 * @param {string|null} plaintext - Value to encrypt (e.g., "0712345678")
 *                                   If null/undefined: return null (field doesn't exist for this record)
 * @param {string} fieldType - Type of field (PHONE, NAME, etc.) for future extensibility
 * @returns {string|null} Encrypted value as base64 string, or null if plaintext is null
 * @throws {Error} If encryption fails or key is invalid
 * 
 * Example:
 *   encryptField("0712345678", "PHONE")
 *   // Returns: "xK9pIj2L3m9oP5qR6sT7uV8wX9yZ0aB1cD2eF3gH4i="
 */
function encryptField(plaintext, fieldType) {
  // ---- Validation ----
  // If value is null/undefined: return null (optional field)
  if (plaintext === null || plaintext === undefined) {
    return null;
  }
  
  // Convert to string (in case number is passed)
  const plaintextStr = String(plaintext);
  
  // If empty string: return null (treat as no value provided)
  if (plaintextStr.length === 0) {
    return null;
  }
  
  try {
    // ---- Step 1: Generate Random IV ----
    // IV = Initialization Vector (random 12-byte value)
    // Why: Ensures same plaintext encrypts differently each time
    // crypto.randomBytes: Cryptographically secure random generator
    // 12 bytes is standard for AES-256-GCM mode
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // ---- Step 2: Create Cipher Object ----
    // cipher: Encryption engine using AES-256-GCM algorithm
    // Arguments:
    //   - ALGORITHM: 'aes-256-gcm'
    //   - encryptionKey: 32-byte key (loaded from environment)
    //   - iv: 12-byte random initialization vector
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    
    // ---- Step 3: Encrypt Plaintext ----
    // update(): Process plaintext and produce ciphertext
    // Arguments:
    //   - plaintextStr: String to encrypt
    //   - 'utf8': Input encoding (plaintext is UTF-8)
    //   - ENCODING: Output encoding (base64, but we'll re-encode after auth tag)
    let encrypted = cipher.update(plaintextStr, 'utf8', 'hex');
    
    // final(): Close cipher and flush remaining encrypted data
    // Returns remaining ciphertext (usually small for short values)
    encrypted += cipher.final('hex');
    
    // ---- Step 4: Get Authentication Tag ----
    // authTag: HMAC that detects if ciphertext was modified
    // GCM mode: Automatically computed during encryption
    // getAuthTag(): Extract 16-byte authentication tag
    // On decryption: If authTag doesn't match = THROW ERROR (tampering detected)
    const authTag = cipher.getAuthTag();
    
    // ---- Step 5: Concatenate Components ----
    // Format stored in DB: IV + ciphertext + authTag (all binary)
    // We concatenate as hex strings first, then convert to base64
    // This preserves both IV and authTag needed for decryption
    const encryptedBuffer = Buffer.concat([
      iv,                                  // 12 bytes - random IV
      Buffer.from(encrypted, 'hex'),      // Variable length - encrypted data
      authTag,                            // 16 bytes - authentication tag
    ]);
    
    // ---- Step 6: Return as Base64 ----
    // Base64: Text-safe encoding for binary data
    // Why: Can store in JSON, databases, pass in URLs
    // Size: ~4/3 of binary size (~60 bytes base64 for typical short value)
    return encryptedBuffer.toString(ENCODING);
    
  } catch (err) {
    // ---- Error Handling ----
    console.error('[ENCRYPTION] Encryption failed:', {
      fieldType,
      error: err.message,
    });
    throw new Error(`Failed to encrypt ${fieldType}: ${err.message}`);
  }
}

// ============================================
// DECRYPTION FUNCTION
// ============================================

/**
 * Decrypt a sensitive field back to plaintext
 * 
 * Algorithm Flow:
 *   1. Decode base64 string to binary
 *   2. Extract components: IV, ciphertext, authTag
 *   3. Create decipher with key and IV
 *   4. Set authentication tag for tampering verification
 *   5. Decrypt ciphertext
 *   6. Return plaintext
 * 
 * Security Properties:
 *   - Tampering Detection: AuthTag verified, error thrown if mismatch
 *   - Key Verification: Wrong key = EBADAUTH (auth tag won't match)
 *   - Fail-Safe: If any step fails, throw error (don't return garbage)
 * 
 * Error Scenarios:
 *   - Invalid base64: Throw error immediately
 *   - Wrong key: Auth tag verification fails, throw EBADAUTH
 *   - Corrupted ciphertext: Auth tag verification fails
 *   - IV/authTag corrupted: Decryption fails with crypto error
 * 
 * @param {string} encryptedData - Encrypted value as base64 string
 * @param {string} fieldType - Type of field (PHONE, NAME, etc.)
 * @returns {string} Decrypted plaintext (e.g., "0712345678")
 * @throws {Error} If decryption fails (wrong key, tampering, corrupted data)
 * 
 * Example:
 *   decryptField("xK9pIj2L3m9oP5qR6sT7uV8wX9yZ0aB1cD2eF3gH4i=", "PHONE")
 *   // Returns: "0712345678"
 *   // Throws if authTag doesn't match (tampering detected)
 */
function decryptField(encryptedData, fieldType) {
  // ---- Validation ----
  // If encrypted data is null: return null
  if (!encryptedData) {
    return null;
  }
  
  try {
    // ---- Step 1: Decode Base64 ----
    // Convert base64 string back to binary buffer
    // from(str, 'base64'): Parse base64 string to bytes
    const encryptedBuffer = Buffer.from(encryptedData, ENCODING);
    
    // ---- Step 2: Extract Components ----
    // Format: IV (12 bytes) + ciphertext (variable) + authTag (16 bytes)
    
    // Extract IV (first 12 bytes)
    // IV: Initialization vector used during encryption
    const iv = encryptedBuffer.slice(0, IV_LENGTH);
    
    // Extract AuthTag (last 16 bytes)
    // AuthTag: HMAC for tampering detection
    const authTag = encryptedBuffer.slice(encryptedBuffer.length - AUTH_TAG_LENGTH);
    
    // Extract Ciphertext (middle section)
    // Everything between IV and authTag
    const ciphertext = encryptedBuffer.slice(
      IV_LENGTH, 
      encryptedBuffer.length - AUTH_TAG_LENGTH
    );
    
    // ---- Step 3: Create Decipher Object ----
    // decipher: Decryption engine using same algorithm as encryption
    // Args: algorithm, key, IV
    // Key and IV MUST match encryption, otherwise auth tag won't verify
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    
    // ---- Step 4: Set Authentication Tag ----
    // setAuthTag: Before decrypting, tell decipher what authTag to expect
    // During decryption: Decipher will verify authTag matches
    // If mismatch: Throw EBADAUTH error (tampering or wrong key)
    decipher.setAuthTag(authTag);
    
    // ---- Step 5: Decrypt Ciphertext ----
    // update(): Decrypt ciphertext and produce plaintext
    // Arguments:
    //   - ciphertext: Binary encrypted data
    //   - 'hex': Ciphertext encoding (we stored as hex)
    //   - 'utf8': Output encoding (plaintext is UTF-8 text)
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    
    // final(): Close decipher and flush remaining decrypted data
    // Also: Verifies authentication tag during this call
    // If authTag invalid: Throws EBADAUTH here
    decrypted += decipher.final('utf8');
    
    // ---- Step 6: Return Plaintext ----
    return decrypted;
    
  } catch (err) {
    // ---- Error Handling ----
    // Common errors:
    //   - EBADAUTH: Auth tag invalid (tampering or wrong key)
    //   - Invalid inputs: Base64 decode failed, wrong lengths
    
    if (err.message.includes('EBADAUTH')) {
      // Tampering detected or wrong key
      console.error('[ENCRYPTION] TAMPER ALERT:', {
        fieldType,
        reason: 'Authentication tag verification failed',
        implication: 'Data was modified or wrong encryption key is set',
      });
      throw new Error(
        `Decryption failed for ${fieldType}: Data may be corrupted or tampered. ` +
        'This could indicate a security breach or encryption key mismatch.'
      );
    }
    
    // Other decryption errors
    console.error('[ENCRYPTION] Decryption failed:', {
      fieldType,
      error: err.message,
    });
    throw new Error(`Failed to decrypt ${fieldType}: ${err.message}`);
  }
}

// ============================================
// ERROR LOGGING HELPER
// ============================================

/**
 * Log encryption/decryption issues for audit trail
 * 
 * Why: Security events should be logged for compliance and debugging
 * What: Encryption failures could indicate tampering or key issues
 * 
 * @param {string} action - "encrypt" or "decrypt"
 * @param {string} fieldType - Type of field (PHONE, NAME, etc.)
 * @param {Error} error - The error that occurred
 * @param {object} context - Additional context (IP, userId, etc.)
 */
function logEncryptionEvent(action, fieldType, error, context = {}) {
  // ---- Log Structure ----
  // Timestamp: When did this happen
  // Action: encrypt or decrypt
  // FieldType: What type of field
  // Error: What went wrong
  // Context: Who, where, when (for audit trail)
  
  const event = {
    timestamp: new Date().toISOString(),
    action,
    fieldType,
    error: error.message,
    severity: error.message.includes('EBADAUTH') ? 'CRITICAL' : 'ERROR',
    ...context,
  };
  
  // In production: Send to centralized logging (e.g., Sentry, CloudWatch)
  // For now: Log to console
  console.error('[ENCRYPTION_EVENT]', JSON.stringify(event));
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Encryption/Decryption functions
  encryptField,      // Encrypt sensitive data before storing in DB
  decryptField,      // Decrypt sensitive data from DB for authenticated user
  
  // Constants for documentation/testing
  ALGORITHM,         // 'aes-256-gcm'
  IV_LENGTH,         // 12 bytes
  AUTH_TAG_LENGTH,   // 16 bytes
  FIELD_TYPES,       // { PHONE, NAME, EMAIL, ADDRESS }
  
  // Utilities
  logEncryptionEvent, // Log encryption events for audit trail
};
