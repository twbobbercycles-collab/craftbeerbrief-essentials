-- Add labor_rate_per_hour to breweries table
-- This was missing from migration 059 which added the other overhead columns
ALTER TABLE breweries ADD COLUMN IF NOT EXISTS labor_rate_per_hour numeric DEFAULT 18;
GRANT SELECT, INSERT, UPDATE, DELETE ON breweries TO authenticated;
