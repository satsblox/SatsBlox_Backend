-- Migration: Add UI Metadata and Soft Delete Support to Child Model
-- 
-- Purpose:
--   - Support gamified UI with child-specific avatars and color themes
--   - Implement soft delete for audit trail preservation
--   - Add performance indexes for filtered queries
--
-- New Fields:
--   - avatar: Optional avatar URL or identifier (gamification)
--   - colorTheme: Optional theme color/preset (customization)
--   - isActive: Soft delete flag (defaults to true, preserves data on deactivation)
--
-- Use Cases:
--   - Parent selects emoji avatar and theme color during child creation
--   - Dashboard displays child with personalized colors/avatar
--   - Parent can deactivate child (hidden from lists) without losing data
--   - Audit trail preserved: transaction history, savings progression, etc.

-- ============================================
-- Add Columns to Child Table
-- ============================================

-- Add avatar column for gamification UI
-- VARCHAR(500) allows for long URLs or identifiers
-- nullable to allow backward compatibility (existing children don't need avatar)
-- Examples:
--   - "https://avatars.example.com/123.png" (URL)
--   - "avatar_emoji_lion" (service identifier)
--   - "emoji:🦁" (emoji reference)
ALTER TABLE "children" ADD COLUMN "avatar" VARCHAR(500);

-- Add colorTheme column for personalized dashboard
-- VARCHAR(100) allows hex colors, preset names, or RGB format
-- nullable to default to parent's theme preference if not set
-- Examples:
--   - "ocean" (preset theme name)
--   - "#FF6B6B" (hex color)
--   - "rgb(255, 107, 107)" (RGB format)
--   - "sunset" (preset theme with warm colors)
ALTER TABLE "children" ADD COLUMN "colorTheme" VARCHAR(100);

-- Add isActive column for soft delete support
-- BOOLEAN with NOT NULL constraint and default TRUE
-- true = account is active (visible in lists)
-- false = account is deactivated (hidden but data preserved)
-- Default TRUE ensures existing children remain active
ALTER TABLE "children" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- ============================================
-- Add Indexes for Performance
-- ============================================

-- Single index on isActive (for queries like "WHERE isActive = true")
-- Useful for WHERE filters
CREATE INDEX "children_isActive_idx" ON "children"("isActive");

-- Composite index on (parentId, isActive) for common query pattern
-- Query: "SELECT * FROM children WHERE parentId = ? AND isActive = true"
-- This index allows fast filtering of only active children for a parent
-- Composite indexes are better than single indexes when both columns are used together
CREATE INDEX "children_parentId_isActive_idx" ON "children"("parentId", "isActive");

-- ============================================
-- Data Migration (for existing records)
-- ============================================

-- All existing children are automatically initialized:
-- - avatar: NULL (not set, frontend should use default)
-- - colorTheme: NULL (not set, inherited from parent)
-- - isActive: TRUE (default, all existing children remain active)
-- No UPDATE statement needed due to defaults.

-- ============================================
-- Verification Queries (for manual testing)
-- ============================================

-- Check new columns were added and have correct types:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns 
-- WHERE table_name = 'children' AND column_name IN ('avatar', 'colorTheme', 'isActive')
-- ORDER BY ordinal_position DESC;

-- Check indexes were created:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'children' AND indexname LIKE '%isActive%';

-- Verify all existing children have isActive = true:
-- SELECT COUNT(*) as active_count, COUNT(CASE WHEN "isActive" = false THEN 1 END) as inactive_count 
-- FROM children;
-- Expected: All children should have isActive = true

-- Check that composite index is being used:
-- EXPLAIN (ANALYZE, BUFFERS) 
-- SELECT * FROM children WHERE "parentId" = 1 AND "isActive" = true;
-- Should show index_condition: "(parentId = 1) AND (isActive = true)"
