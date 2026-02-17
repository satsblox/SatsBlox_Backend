# Encryption Guide

## Overview

This guide explains how to use `encryptionService.js` for Field-Level Encryption in SatsBlox.

**Purpose**: Protect PII (Personally Identifiable Information) using AES-256-GCM encryption.

---

## Quick Start

### Encrypting Data

```javascript
const encryptionService = require('./services/encryptionService');

// Encrypt a phone number
const plainPhone = '+254700000000';
const encryptedPhone = encryptionService.encryptField(plainPhone, 'PHONE');

// Store encryptedPhone in database
// Format: "iv:authTag:ciphertext" (hex-encoded)
```

### Decrypting Data

```javascript
// Retrieve encrypted phone from database
const encryptedPhone = parent.phoneNumber; // "4a5b6c....:dead....:cafe..."

// Decrypt for display
const plainPhone = encryptionService.decryptField(encryptedPhone, 'PHONE');

// Use plainPhone: "+254700000000"
```

---

## When to Encrypt

### PII Fields

| Field | Type | Encrypt? | Reason |
|-------|------|----------|--------|
| `Parent.phoneNumber` | String | ✅ Yes | Sensitive contact info for M-Pesa |
| `Parent.email` | String | ❌ No | Needed for login (must be searchable) |
| `Parent.password` | String | ❌ No | Already hashed with bcrypt |
| `Child.username` | String | ❌ No | Public display name |
| `Child.dateOfBirth` | Date | ❓ Consider | Age indicator (encrypted by country regulation) |
| `Wallet.address` | String | ✅ Yes | Bitcoin address is PII |
| `Transaction.toAddress` | String | ✅ Yes | Recipient info |

### Decision Tree

1. **Is it searchable in queries?**
   - YES: Don't encrypt (can't search encrypted data)
   - NO: Continue to step 2

2. **Is it sensitive or PII?**
   - YES: Continue to step 3
   - NO: Don't encrypt

3. **Is it needed in logs or error messages?**
   - YES: Encrypt
   - NO: Don't encrypt (but limit logging)

---

## Supported Field Types

```javascript
const FIELD_TYPES = {
  'PHONE': {
    description: 'Phone number (e.g., +254700000000)',
    example: '+254700000000',
    regex: /^\+?[0-9]{10,15}$/
  },
  'WALLET_ADDRESS': {
    description: 'Bitcoin wallet address',
    example: '1A1z7agoat2YLZW51Cd8vDffwESN2aqiS',
    regex: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/
  },
  'EMAIL': {
    description: 'Email address',
    example: 'user@example.com',
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  // Add more as needed
};
```

---

## API Reference

### `encryptField(plaintext, fieldType)`

Encrypts a plaintext value using AES-256-GCM.

**Parameters**:
- `plaintext` (string | null): Value to encrypt
- `fieldType` (string): Field type (e.g., 'PHONE', 'WALLET_ADDRESS')

**Returns**: 
- (string) Encrypted value in format `iv:authTag:ciphertext` (all hex-encoded)
- (null) If plaintext is null or empty

**Throws**:
- `Error` if ENCRYPTION_KEY is not set or invalid format
- `Error` if fieldType is not recognized

**Examples**:

```javascript
// Normal usage
const encrypted = encryptField('+254700000000', 'PHONE');
// Returns: "4a5b6c7d....:deadbeef....:cafebabe...."

// Null/empty handling
const encrypted = encryptField(null, 'PHONE');        // Returns: null
const encrypted = encryptField('', 'PHONE');          // Returns: null
const encrypted = encryptField('   ', 'PHONE');       // Returns: null

// Invalid field type
try {
  encryptField('+254700000000', 'INVALID_TYPE');
} catch (err) {
  console.error(err.message); // "Unknown field type: INVALID_TYPE"
}
```

### `decryptField(encryptedData, fieldType)`

Decrypts an encrypted value using AES-256-GCM.

**Parameters**:
- `encryptedData` (string | null): Encrypted value from database (format: `iv:authTag:ciphertext`)
- `fieldType` (string): Field type (must match encryption)

**Returns**:
- (string) Decrypted plaintext value
- (null) If encryptedData is null or empty

**Throws**:
- `Error` with code `EBADAUTH` if auth tag verification fails (tampering detected)
- `Error` if decryption fails (corrupted data)
- `Error` if ENCRYPTION_KEY is not set or invalid format

**Examples**:

```javascript
// Normal usage
const plainPhone = decryptField(encrypted, 'PHONE');
// Returns: "+254700000000"

// Null/empty handling
const plainPhone = decryptField(null, 'PHONE');       // Returns: null
const plainPhone = decryptField('', 'PHONE');         // Returns: null

// Tampering detection
const tampered = encrypted.slice(0, -3) + 'xxx';     // Corrupt last 3 chars
try {
  decryptField(tampered, 'PHONE');
} catch (err) {
  console.error(err.code);  // "EBADAUTH"
  console.error(err.message); // "Decryption failed or data has been tampered with"
}

// Wrong field type (mismatched IV/tag)
try {
  decryptField(encrypted, 'WALLET_ADDRESS');  // Was encrypted as PHONE
} catch (err) {
  console.error(err.message); // "Decryption failed..."
}
```

---

## Usage Examples

### Example 1: Encrypt on Registration

```javascript
// src/services/authService.js - registerParent()
async function registerParent(userData) {
  const { phoneNumber, ...rest } = userData;

  // Encrypt before storage
  const encryptedPhone = encryptionService.encryptField(phoneNumber, 'PHONE');

  const parent = await prisma.parent.create({
    data: {
      ...rest,
      phoneNumber: encryptedPhone,  // Store encrypted
    }
  });

  // Decrypt for response
  return {
    ...parent,
    phoneNumber: encryptionService.decryptField(parent.phoneNumber, 'PHONE')
  };
}
```

### Example 2: Decrypt on Retrieval

```javascript
// src/controllers/parentController.js
async function getParentProfile(req, res) {
  const parentId = req.user.id;

  const parent = await prisma.parent.findUnique({
    where: { id: parentId }
  });

  // Decrypt sensitive fields for response
  const safeParent = {
    ...parent,
    phoneNumber: encryptionService.decryptField(parent.phoneNumber, 'PHONE')
  };

  res.json({ parent: safeParent });
}
```

### Example 3: Add New Encrypted Field

1. **Update FIELD_TYPES** in `encryptionService.js`:
```javascript
const FIELD_TYPES = {
  'PHONE': { ... },
  'ADDRESS': {
    description: 'Physical address',
    example: '123 Main St, Nairobi, Kenya',
    regex: /^.{10,200}$/
  }
};
```

2. **Migrate existing data** (one-time):
```javascript
// Migration script
const encryptionService = require('./services/encryptionService');

async function migrateAddresses() {
  const parents = await prisma.parent.findMany();
  
  for (const parent of parents) {
    if (parent.address && !parent.address.includes(':')) { // Not encrypted
      const encrypted = encryptionService.encryptField(parent.address, 'ADDRESS');
      await prisma.parent.update({
        where: { id: parent.id },
        data: { address: encrypted }
      });
      console.log(`✓ Encrypted address for parent ${parent.id}`);
    }
  }
}

migrateAddresses();
```

3. **Use in code**:
```javascript
// Encrypt on write
const encrypted = encryptionService.encryptField(address, 'ADDRESS');

// Decrypt on read
const plainAddress = encryptionService.decryptField(encrypted, 'ADDRESS');
```

---

## Cryptography Details

### AES-256-GCM Explained

| Component | Purpose | Details |
|-----------|---------|---------|
| **AES** | Encryption algorithm | 256-bit key = 2^256 possible keys (quantum-resistant) |
| **GCM** | Mode + Authentication | Detects tampering; prevents bit-flips, forgery |
| **IV** | Initialization vector | 12 random bytes per encryption (prevents frequency analysis) |
| **Auth Tag** | Authentication | 16-byte HMAC ensures data integrity |

### Encryption Format

```
Stored in database as:
"iv:authTag:ciphertext"

Example:
"4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d:deadbeefcafebabefeedfacecodedbabe:0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

Breakdown:
- iv (32 hex chars = 16 bytes raw): 4a5b6c7d...9d
- authTag (32 hex chars = 16 bytes raw): deadbeef...babe
- ciphertext (64+ hex chars): 0102034...1f
```

### Security Properties

1. **Confidentiality**: AES-256 encryption prevents unauthorized reading
2. **Integrity**: Auth tag prevents tampering or corruption
3. **Non-repeating**: Random IV prevents frequency analysis
4. **Authenticated Encryption**: Combined auth + encryption (not encrypt-then-MAC)

---

## Common Errors

### Error: "ENCRYPTION_KEY not set"
**Cause**: `ENCRYPTION_KEY` environment variable is missing
**Solution**: 
```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### Error: "ENCRYPTION_KEY format invalid"
**Cause**: Key is not 64 hex characters (32 bytes)
**Solution**:
```bash
# Must be exactly 64 hex chars
echo $ENCRYPTION_KEY | wc -c  # Should be 65 (64 chars + newline)

# Regenerate if needed
export ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### Error: "EBADAUTH - Decryption failed or data has been tampered with"
**Cause**: Auth tag verification failed (data was modified after encryption)
**Solution**:
- Check if encrypted value was truncated/modified
- Verify database corruption isn't cause
- Check if ENCRYPTION_KEY changed (old data encrypted with different key)

### Error: "Decryption failed"
**Cause**: 
- Data corrupted
- Field type mismatch (encrypted as PHONE, decrypted as ADDRESS)
- ENCRYPTION_KEY changed since encryption
**Solution**:
- Verify field type matches
- Ensure ENCRYPTION_KEY hasn't changed
- Check database for corruption

---

## Performance Considerations

### Encryption Performance
- ~1-2ms per operation (fast, AES hardware acceleration)
- Negligible for API requests (typical rounding: 100ms)
- Not suitable for batch processing (100,000 records = 100-200sec)

### Optimization: Batch Encryption
```javascript
// For large data migrations
async function encryptBatch(items, fieldType, batchSize = 100) {
  const encrypted = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    for (const item of batch) {
      item.encrypted = encryptField(item.value, fieldType);
    }
    
    encrypted.push(...batch);
    
    // Yield to event loop every batch
    await new Promise(resolve => setImmediate(resolve));
  }
  
  return encrypted;
}
```

### Optimization: Lazy Decryption
```javascript
// Only decrypt if field is actually used
async function getParent(id) {
  const parent = await prisma.parent.findUnique({ where: { id } });
  
  return {
    ...parent,
    get phoneNumber() {
      return encryptField(this._phoneNumber, 'PHONE');
    }
  };
}
```

---

## Key Rotation

### Current Implementation (MVP)
- Single key: `ENCRYPTION_KEY`
- All data encrypted with same key
- Key rotation requires re-encryption

### Future: Key Versioning
```javascript
// Store key version with encrypted data
"1:iv:authTag:ciphertext"  // Format: version:iv:tag:ciphertext

const KEYS = {
  '1': 'old_encryption_key_...',
  '2': 'new_encryption_key_...'  // Current
};

// On rotation: new data uses key '2', old data stays with key '1'
// On read: check version, use appropriate key for decryption
```

### Key Rotation Process

1. **Generate new key**:
   ```bash
   NEW_KEY=$(openssl rand -hex 32)
   echo "New key: $NEW_KEY"
   ```

2. **Deploy with both keys** (feature flag):
   ```javascript
   const ENCRYPTION_KEYS = {
     current: new_key,
     legacy: old_key
   };
   ```

3. **Migrate data** (background job):
   ```javascript
   async function reencryptAllData() {
     const parents = await prisma.parent.findMany();
     for (const parent of parents) {
       if (parent.phoneNumber) {
         // Decrypt with old key
         const plain = decrypt(parent.phoneNumber, old_key);
         // Re-encrypt with new key
         const encrypted = encrypt(plain, new_key);
         await prisma.parent.update({...});
       }
    }
   }
   ```

4. **Clean up** (after full migration):
   ```javascript
   const ENCRYPTION_KEYS = {
     current: new_key
     // old_key removed
   };
   ```

---

## Testing

### Unit Test Example

```javascript
// test/encryptionService.test.js
const encryptionService = require('../src/services/encryptionService');

describe('encryptionService', () => {
  test('encryptField should encrypt plaintext', () => {
    const plainPhone = '+254700000000';
    const encrypted = encryptionService.encryptField(plainPhone, 'PHONE');
    
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(plainPhone);
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // iv:tag:ciphertext
  });

  test('decryptField should decrypt ciphertext', () => {
    const plainPhone = '+254700000000';
    const encrypted = encryptionService.encryptField(plainPhone, 'PHONE');
    const decrypted = encryptionService.decryptField(encrypted, 'PHONE');
    
    expect(decrypted).toBe(plainPhone);
  });

  test('should produce different ciphertext for same plaintext (due to random IV)', () => {
    const plainPhone = '+254700000000';
    const enc1 = encryptionService.encryptField(plainPhone, 'PHONE');
    const enc2 = encryptionService.encryptField(plainPhone, 'PHONE');
    
    expect(enc1).not.toBe(enc2); // Different due to random IV
  });

  test('should detect tampering with auth tag', () => {
    const plainPhone = '+254700000000';
    const encrypted = encryptionService.encryptField(plainPhone, 'PHONE');
    
    // Corrupt the last 3 characters
    const tampered = encrypted.slice(0, -3) + 'xxx';
    
    expect(() => {
      encryptionService.decryptField(tampered, 'PHONE');
    }).toThrow('EBADAUTH');
  });

  test('should handle null values', () => {
    expect(encryptionService.encryptField(null, 'PHONE')).toBeNull();
    expect(encryptionService.decryptField(null, 'PHONE')).toBeNull();
  });
});
```

---

## Troubleshooting

### Common Issues

**Issue**: "Sensitive data leaked in logs"
**Diagnosis**: Check if plaintext values appear in `console.log` or error messages
**Fix**: 
```javascript
// ❌ Bad
console.log(`Encrypting phone: ${plainPhone}`);

// ✅ Good
console.log(`Encrypting phone number for parent ${parentId}`);
```

**Issue**: "Database query on encrypted field fails"
**Diagnosis**: Can't search encrypted data (no plaintext to match)
**Fix**: 
- For searchable fields (email), don't encrypt
- For non-searchable fields (phone), encryption is OK
- Use key derivation if need searchable encryption (future)

**Issue**: "Performance degradation after encryption"
**Diagnosis**: Too many encryption/decryption calls in loop
**Fix**:
```javascript
// ❌ Bad: N+1 encryption
for (const parent of parents) {
  parent.phone = encryptField(...);  // Each iteration
}

// ✅ Good: Batch processing
const encrypted = parents.map(p => encryptField(...));
```

---

## References

- **NIST AES**: https://csrc.nist.gov/publications/detail/fips/197/final
- **GCM Mode**: https://csrc.nist.gov/publications/detail/sp/800-38d/final
- **Node.js Crypto**: https://nodejs.org/api/crypto.html
- **OWASP Encryption**: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

---

**Last Updated**: 2024-02-17
**Maintained By**: Security Team
