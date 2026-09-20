-- ============================================================
--  DROP LEGACY PRODUCT COLUMNS
--  Location: migrations/sql/20260930-drop-product-legacy-columns.sql
-- ============================================================

ALTER TABLE products DROP COLUMN IF EXISTS discount_percent;
ALTER TABLE products DROP COLUMN IF EXISTS rating;
ALTER TABLE products DROP COLUMN IF EXISTS contact;
ALTER TABLE products DROP COLUMN IF EXISTS shipping;

DO $$
DECLARE
    still_there INTEGER;
BEGIN
    SELECT COUNT(*) INTO still_there
    FROM information_schema.columns
    WHERE table_name = 'products'
      AND column_name IN ('discount_percent', 'rating', 'contact', 'shipping');

    RAISE NOTICE 'legacy product columns still present (must be 0): %', still_there;
END $$;