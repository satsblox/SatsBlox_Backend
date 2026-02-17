-- Migration: Add Authentication & Security Fields to Parents Table
-- 
-- Purpose:
--   - Add JWT token management fields for logout functionality
--   - Add rate-limiting fields to prevent brute-force attacks
--   - Support token revocation and account lockout
--
-- New Fields:
--   - refreshToken: Stores current valid refresh token for logout/revocation
--   - failedLoginAttempts: Counter for consecutive failed login attempts
--   - lastFailedLoginAttempt: Timestamp of most recent failed attempt
--   - lockedUntil: Timestamp when account is temporarily locked
--
-- Security Features:
--   - Account is locked after N failed attempts for M minutes
--   - Prevents brute-force password attacks (dictionary attacks)
--   - Refresh token can be invalidated immediately (stateful)
--   - Supports future RBAC via JWT role claims

-- ============================================
-- Add Columns to parents Table
-- ============================================

-- Add refreshToken column for token revocation on logout
-- TEXT type allows storing long JWT tokens (typically 500-1000 chars)
-- nullable to represent "not logged in" state
ALTER TABLE "parents" ADD COLUMN "refreshToken" TEXT;

-- Add failedLoginAttempts counter for rate-limiting
-- INTEGER default 0 (no failed attempts initially)
-- Incremented on each failed login, reset on successful login
ALTER TABLE "parents" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;

-- Add lastFailedLoginAttempt timestamp for tracking attack patterns
-- TIMESTAMP(3) with millisecond precision for audit trails
-- nullable to represent "no failed attempts yet"
ALTER TABLE "parents" ADD COLUMN "lastFailedLoginAttempt" TIMESTAMP(3);

-- Add lockedUntil timestamp for account lockout periods
-- When set, prevents login attempts until (now > lockedUntil)
-- nullable to represent "account not locked"
-- Automatically unlocked after timeout expires or admin reset
ALTER TABLE "parents" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- ============================================
-- Add Constraints
-- ============================================

-- Constraint: failedLoginAttempts must be >= 0
-- Prevents negative values from corrupting security logic
ALTER TABLE "parents"
  ADD CONSTRAINT "parents_failedLoginAttempts_non_negative" 
  CHECK ("failedLoginAttempts" >= 0);

-- ============================================
-- Add Indexes for Performance
-- ============================================

-- Index on lockedUntil for finding locked accounts (useful for jobs that auto-unlock)
-- Query: SELECT * FROM parents WHERE lockedUntil > NOW()
CREATE INDEX "parents_lockedUntil_idx" ON "parents"("lockedUntil");

-- Index on lastFailedLoginAttempt for security audits
-- Query: SELECT * FROM parents WHERE lastFailedLoginAttempt > NOW() - INTERVAL '1 hour'
CREATE INDEX "parents_lastFailedLoginAttempt_idx" ON "parents"("lastFailedLoginAttempt");

-- ============================================
-- Data Migration (if needed for existing records)
-- ============================================

-- All existing parents are automatically initialized:
-- - refreshToken: NULL (not logged in)
-- - failedLoginAttempts: 0 (default)
-- - lastFailedLoginAttempt: NULL (default)
-- - lockedUntil: NULL (default)
-- No UPDATE statement needed due to defaults.

-- ============================================
-- Verification Queries (for manual testing)
-- ============================================

-- Check new columns were added:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'parents' 
-- ORDER BY ordinal_position;

-- Check constraints:
-- SELECT constraint_name, constraint_type FROM information_schema.table_constraints 
-- WHERE table_name = 'parents';

-- Check indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'parents';
