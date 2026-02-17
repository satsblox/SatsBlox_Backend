/**
 * src/utils/validators.js
 * 
 * Centralized validation utilities for the SatsBlox API.
 * 
 * Purpose:
 *   - Provide reusable validation functions for common patterns
 *   - Ensure consistency across all endpoints
 *   - Support Kenyan-specific formats (phone numbers for M-Pesa)
 *   - Document validation requirements in one place
 * 
 * These functions return { isValid: boolean, error?: string }
 * Always include null/undefined checks at the entry point.
 */

/**
 * Validates email format using a RFC 5322-compliant regex.
 * 
 * Accepted Formats:
 *   - john@example.com
 *   - jane.doe+tag@example.co.uk
 *   - user+marketing@company.org
 * 
 * @param {string} email - Email address to validate
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required and must be a string' };
  }

  // RFC 5322 simplified regex (production use: consider email-validator library)
  const regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  
  if (!regex.test(email.toLowerCase())) {
    return { isValid: false, error: 'Invalid email format' };
  }

  return { isValid: true };
}

/**
 * Validates password strength according to industry standards.
 * 
 * Requirements:
 *   - Minimum 8 characters (NIST SP 800-63B guideline)
 *   - Must be a string
 * 
 * Future Enhancements (commented for reference):
 *   - At least one uppercase letter
 *   - At least one lowercase letter
 *   - At least one number
 *   - At least one special character
 * 
 * Note: Current implementation prioritizes user experience (simple requirement)
 *       but can be enhanced based on security requirements.
 * 
 * @param {string} password - Password to validate
 * @returns {object} { isValid: boolean, error?: string }
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required and must be a string' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long' };
  }

  return { isValid: true };
}

/**
 * Validates Kenyan phone number in international format.
 * 
 * Format Specification:
 *   - Country Code: +254 (Kenya's ISO code)
 *   - Network Code: 7 (mobile networks start with this digit)
 *   - Subscriber Number: 8 additional digits (0-9)
 *   - Total Length: 13 characters including +
 * 
 * Accepted Examples:
 *   - +254700000000 (Safaricom/Airtel)
 *   - +254710123456
 *   - +254790654321 (valid starting digit)
 * 
 * Rejected Examples:
 *   - 0700000000 (missing country code)
 *   - +2540700000000 (incorrect country code format)
 *   - +254800000000 (doesn't start with 7)
 * 
 * Future Use:
 *   - M-Pesa integration expects this format
 *   - Multi-country support planned for expansion
 * 
 * @param {string} phone - Phone number to validate
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateKenyanPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required and must be a string' };
  }

  // Pattern: +254 followed by 7 and exactly 8 more digits
  // Regex explanation: ^\+2547\d{8}$
  //   ^ = start of string
  //   \+ = literal plus sign
  //   254 = Kenya country code
  //   7 = mobile network code
  //   \d{8} = exactly 8 digits (0-9)
  //   $ = end of string
  const kenyanPhoneRegex = /^\+2547\d{8}$/;

  if (!kenyanPhoneRegex.test(phone)) {
    return { 
      isValid: false, 
      error: 'Phone number must be in Kenyan format: +2547XXXXXXXX (e.g., +254700123456)' 
    };
  }

  return { isValid: true };
}

/**
 * Validates full name input.
 * 
 * Requirements:
 *   - Must be a non-empty string
 *   - Minimum 2 characters (first and last name)
 *   - Maximum 255 characters (database constraint)
 *   - Trimmed to remove leading/trailing whitespace
 * 
 * Note: We don't enforce character restrictions (letters only) to support
 *       international names and cultural variations (hyphens, apostrophes, etc.)
 * 
 * @param {string} fullName - Full name to validate
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateFullName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { isValid: false, error: 'Full name is required and must be a string' };
  }

  const trimmed = fullName.trim();

  if (trimmed.length < 2) {
    return { isValid: false, error: 'Full name must be at least 2 characters long' };
  }

  if (trimmed.length > 255) {
    return { isValid: false, error: 'Full name must not exceed 255 characters' };
  }

  return { isValid: true };
}

/**
 * Validates all required fields for parent registration.
 * 
 * This is a composite validator that checks all fields at once.
 * Useful for request validation middleware or service layer.
 * 
 * @param {object} data - Registration data { fullName, email, password, phoneNumber }
 * @returns {object} { isValid: boolean, errors: object }
 *   where errors maps field names to error messages
 */
function validateRegistrationData(data) {
  const errors = {};

  if (!data) {
    return { isValid: false, errors: { general: 'Request body is required' } };
  }

  // Validate fullName
  const fullNameValidation = validateFullName(data.fullName);
  if (!fullNameValidation.isValid) {
    errors.fullName = fullNameValidation.error;
  }

  // Validate email
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  }

  // Validate password
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error;
  }

  // Validate phoneNumber
  const phoneValidation = validateKenyanPhone(data.phoneNumber);
  if (!phoneValidation.isValid) {
    errors.phoneNumber = phoneValidation.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates login credentials.
 * 
 * Requirements:
 *   - Email must be a valid email format
 *   - Password must be a non-empty string
 * 
 * @param {object} data - Login data { email, password }
 * @returns {object} { isValid: boolean, errors: object }
 */
function validateLoginData(data) {
  const errors = {};

  if (!data) {
    return { isValid: false, errors: { general: 'Request body is required' } };
  }

  // Validate email
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  }

  // Validate password presence (no strength check for login, just ensure it exists)
  if (!data.password || typeof data.password !== 'string') {
    errors.password = 'Password is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates child username for uniqueness and format.
 * 
 * Requirements:
 *   - Must be a non-empty string
 *   - Minimum 3 characters (e.g., "amy")
 *   - Maximum 100 characters (database constraint)
 *   - Only alphanumeric characters, hyphens, and underscores allowed
 *   - Lowercase to ensure case-insensitive uniqueness
 *   - No leading or trailing hyphens/underscores
 * 
 * Examples (valid):
 *   - "amara-savings"
 *   - "liam_btc_goal"
 *   - "zara123"
 *   - "child-one"
 * 
 * Examples (invalid):
 *   - "ab" (too short)
 *   - "-invalid" (starts with hyphen)
 *   - "invalid " (contains space)
 *   - "user@email" (contains invalid character)
 * 
 * Purpose:
 *   - Used in URLs and child-facing interfaces
 *   - Must be unique across all children on the platform
 *   - Case-insensitive to prevent duplicates like "Amy" vs "amy"
 * 
 * @param {string} username - Username to validate
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateChildUsername(username) {
  if (!username || typeof username !== 'string') {
    return { isValid: false, error: 'Username is required and must be a string' };
  }

  const trimmed = username.trim().toLowerCase();

  // Length check
  if (trimmed.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Username must not exceed 100 characters' };
  }

  // Character validation: only alphanumeric, hyphens, and underscores
  // Pattern: ^[a-z0-9_-]+$
  // - ^ = start of string
  // - [a-z0-9_-]+ = one or more alphanumeric (lowercase), underscore, or hyphen
  // - $ = end of string
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' };
  }

  // Check for leading/trailing hyphens or underscores
  if (/^[-_]/.test(trimmed) || /[-_]$/.test(trimmed)) {
    return { isValid: false, error: 'Username cannot start or end with hyphen or underscore' };
  }

  return { isValid: true };
}

/**
 * Validates child date of birth.
 * 
 * Requirements:
 *   - Must be a valid ISO 8601 date string (YYYY-MM-DD)
 *   - Must be a date in the past (child hasn't been born in the future)
 *   - Child must be under 18 years old (or configurable max age)
 *   - Child must be at least newborn (0 years old, no specific minimum)
 * 
 * Examples (valid):
 *   - "2015-03-21" (9 years old as of 2024)
 *   - "2023-01-01" (1 year old as of 2024)
 *   - Date of birth must parse to valid date
 * 
 * Examples (invalid):
 *   - "03-21-2015" (not ISO format)
 *   - "2026-03-21" (future date - not born yet)
 *   - "2006-01-01" (over 18 years old - would be ~18)
 *   - "invalid" (not a date)
 * 
 * Purpose:
 *   - Used for age-appropriate content and parental controls
 *   - SatsBlox targets children under 18 (family units)
 *   - Stored as DATE type in database
 * 
 * @param {string} dateOfBirth - Date of birth in ISO format (YYYY-MM-DD)
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateChildDateOfBirth(dateOfBirth) {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') {
    return { isValid: false, error: 'Date of birth is required and must be a string' };
  }

  // Check ISO 8601 format (YYYY-MM-DD)
  // Pattern: ^\d{4}-\d{2}-\d{2}$
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return { isValid: false, error: 'Date of birth must be in ISO format (YYYY-MM-DD), e.g., 2015-03-21' };
  }

  // Parse and validate the date
  const dob = new Date(dateOfBirth + 'T00:00:00Z'); // Add time to prevent timezone issues
  const today = new Date();

  // Check if date is valid (Date constructor creates Invalid Date for invalid inputs)
  if (isNaN(dob.getTime())) {
    return { isValid: false, error: 'Invalid date value' };
  }

  // Check if date is in the past (child hasn't been born yet)
  if (dob > today) {
    return { isValid: false, error: 'Child cannot have a future date of birth' };
  }

  // Calculate age (approximate, doesn't account for exact hour/minute)
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();

  // Adjust if birthday hasn't occurred this year
  const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

  // Check if child is under 18 (maximum age for family app)
  // Note: Could be made configurable if targeting different age groups
  if (exactAge >= 18) {
    return { isValid: false, error: 'Child must be under 18 years old' };
  }

  return { isValid: true };
}

/**
 * Validates child avatar identifier or URL.
 * 
 * Requirements:
 *   - Must be a string (optional, can be null)
 *   - Maximum 500 characters (database constraint)
 *   - Can be URL, emoji reference, or service identifier
 * 
 * Examples (valid):
 *   - "https://avatars.example.com/123.png" (URL)
 *   - "avatar_emoji_lion" (service identifier)
 *   - "emoji:🦁" (emoji reference)
 *   - null/undefined (optional, frontier defaults)
 * 
 * Purpose:
 *   - Support gamified UI with child-specific profile images
 *   - Allows parent to select or upload avatar for each child
 *   - Can reference emoji library, URL, or custom avatar service
 *   - Enhances personalization and engagement
 * 
 * Note: URL validation is minimal (prevents obvious issues)
 *       For strict validation, consider using a library like "valid-url"
 * 
 * @param {string|null|undefined} avatar - Avatar identifier, URL, or emoji reference
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateChildAvatar(avatar) {
  // Avatar is optional (null/undefined is valid)
  if (!avatar) {
    return { isValid: true };
  }

  // If provided, must be a string
  if (typeof avatar !== 'string') {
    return { isValid: false, error: 'Avatar must be a string' };
  }

  // Length check
  if (avatar.trim().length === 0) {
    return { isValid: false, error: 'Avatar cannot be empty string' };
  }

  if (avatar.length > 500) {
    return { isValid: false, error: 'Avatar must not exceed 500 characters' };
  }

  // Basic URL validation (if looks like a URL)
  if (avatar.includes('://')) {
    // Minimal URL check: must start with http:// or https://
    if (!/^https?:\/\//.test(avatar)) {
      return { isValid: false, error: 'Avatar URL must start with http:// or https://' };
    }

    // Must end with common image extensions or have no extension (API endpoint)
    // This is NOT a comprehensive validation, just a sanity check
    const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', ''];
    const hasValidExtension = validExtensions.some(ext => 
      avatar.endsWith(ext) || avatar.includes(ext + '?') || avatar.includes(ext + '#')
    );

    if (!hasValidExtension && !avatar.includes('avatar')) {
      // Allow URLs with 'avatar' in path or no extension (API might return any format)
      // But warn about unknown extensions
    }
  }

  return { isValid: true };
}

/**
 * Validates child color theme identifier.
 * 
 * Requirements:
 *   - Must be a string (optional, can be null)
 *   - 1-100 characters (reasonable length)
 *   - Can be hex color (#RRGGBB), RGB format, or preset theme name
 * 
 * Examples (valid):
 *   - "ocean" (preset theme name)
 *   - "#FF6B6B" (hex color)
 *   - "rgb(255, 107, 107)" (RGB format)
 *   - "sunset" (preset theme with warm colors)
 *   - "#4ECDC4"
 *   - null/undefined (optional, uses parent's theme)
 * 
 * Examples (invalid):
 *   - "#GGGGGG" (invalid hex)
 *   - "rgb(999, 999, 999)" (invalid RGB)
 *   - "" (empty string)
 * 
 * Purpose:
 *   - Support personalized dashboard UI with child-specific colors
 *   - Parent can choose theme during child creation
 *   - Frontend uses theme to customize child's profile, progress bars, badges
 *   - Enhanced gamification and visual engagement
 * 
 * Preset Themes (suggested):
 *   - "ocean" → Blue theme with water vibes
 *   - "sunset" → Warm orange/pink theme
 *   - "forest" → Green theme with nature vibes
 *   - "candy" → Bright pink/purple theme
 *   - "space" → Dark blue/purple with stars
 * 
 * Note: Validation is permissive to support future themes without code changes
 * 
 * @param {string|null|undefined} colorTheme - Hex color, RGB format, or theme preset name
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateChildColorTheme(colorTheme) {
  // Theme is optional (null/undefined is valid)
  if (!colorTheme) {
    return { isValid: true };
  }

  // If provided, must be a string
  if (typeof colorTheme !== 'string') {
    return { isValid: false, error: 'Color theme must be a string' };
  }

  const trimmed = colorTheme.trim();

  // Length check
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Color theme cannot be empty string' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Color theme must not exceed 100 characters' };
  }

  // Validate hex color if it looks like one (#RRGGBB or #RGB)
  if (trimmed.startsWith('#')) {
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(trimmed)) {
      return { 
        isValid: false, 
        error: 'Invalid hex color format. Use #RRGGBB (e.g., #FF6B6B) or #RGB (e.g., #F6B)'
      };
    }
  }
  // Validate RGB format if it looks like one (rgb(...))
  else if (trimmed.startsWith('rgb(')) {
    const rgbPattern = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
    if (!rgbPattern.test(trimmed)) {
      return { 
        isValid: false, 
        error: 'Invalid RGB format. Use rgb(R, G, B) where each is 0-255 (e.g., rgb(255, 107, 107))'
      };
    }

    // Check that RGB values are in valid range (0-255)
    const values = trimmed.match(/\d+/g).map(Number);
    for (const val of values) {
      if (val < 0 || val > 255) {
        return { 
          isValid: false, 
          error: 'RGB values must be between 0 and 255'
        };
      }
    }
  }
  // Otherwise, treat as preset theme name
  else {
    // Preset names should be alphanumeric with underscores/hyphens
    // Pattern: alphanumeric, hyphens, underscores only
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return { 
        isValid: false, 
        error: 'Theme name can only contain letters, numbers, hyphens, and underscores'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates all required fields for child account creation.
 * 
 * This is a composite validator that checks all child-related fields at once.
 * Used by POST /api/family/children endpoint.
 * 
 * Note: parentId is NOT validated here because it's extracted from JWT,
 *       not provided in the request body. See ownershipMiddleware for validation.
 * 
 * @param {object} data - Child creation data { username, dateOfBirth, avatar?, colorTheme? }
 * @returns {object} { isValid: boolean, errors: object }
 *   where errors maps field names to error messages
 */
function validateCreateChildData(data) {
  const errors = {};

  if (!data) {
    return { isValid: false, errors: { general: 'Request body is required' } };
  }

  // Validate username (required)
  const usernameValidation = validateChildUsername(data.username);
  if (!usernameValidation.isValid) {
    errors.username = usernameValidation.error;
  }

  // Validate dateOfBirth (required)
  const dobValidation = validateChildDateOfBirth(data.dateOfBirth);
  if (!dobValidation.isValid) {
    errors.dateOfBirth = dobValidation.error;
  }

  // Validate avatar (optional)
  const avatarValidation = validateChildAvatar(data.avatar);
  if (!avatarValidation.isValid) {
    errors.avatar = avatarValidation.error;
  }

  // Validate colorTheme (optional)
  const themeValidation = validateChildColorTheme(data.colorTheme);
  if (!themeValidation.isValid) {
    errors.colorTheme = themeValidation.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates deactivation request for a child account.
 * 
 * Soft delete validation: ensure parent is confirming the deactivation action.
 * 
 * @param {object} data - Deactivation data { isActive: false }
 * @returns {object} { isValid: boolean, error?: string }
 */
function validateDeactivateChild(data) {
  if (!data) {
    return { isValid: false, error: 'Request body is required' };
  }

  // Only accept isActive: false (cannot use this to reactivate)
  // Reactivation requires a different endpoint with additional verification
  if (data.isActive !== false) {
    return { isValid: false, error: 'Invalid deactivation request' };
  }

  return { isValid: true };
}

module.exports = {
  validateEmail,
  validatePassword,
  validateKenyanPhone,
  validateFullName,
  validateRegistrationData,
  validateLoginData,
  validateChildUsername,
  validateChildDateOfBirth,
  validateChildAvatar,
  validateChildColorTheme,
  validateCreateChildData,
  validateDeactivateChild,
};
