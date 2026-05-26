-- 037_recipe_versions.sql
-- Adds version control columns to the recipes table.
-- The recipes table already has `version` (version number) and `parent_recipe_id`
-- (link to direct parent) from migration 014. This migration adds:
--   version_notes      — what changed in this version (free text)
--   is_current_version — whether this is the active version for new brews
--
-- Convention for parent_recipe_id after this migration:
--   Always points to the ROOT recipe (the original v1), not just the direct parent.
--   This makes family lookups a single WHERE clause with no recursion.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS version_notes       text,
  ADD COLUMN IF NOT EXISTS is_current_version  boolean NOT NULL DEFAULT true;

-- Fast lookup: find all versions in a recipe family
CREATE INDEX IF NOT EXISTS idx_recipes_parent_recipe_id
  ON recipes(parent_recipe_id);

-- Fast lookup: find only current versions (used by Brew Day recipe dropdown)
CREATE INDEX IF NOT EXISTS idx_recipes_is_current_version
  ON recipes(brewery_id, is_current_version)
  WHERE is_current_version = true;
