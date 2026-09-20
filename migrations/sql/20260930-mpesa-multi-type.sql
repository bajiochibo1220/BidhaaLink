-- ============================================================
--  M-PESA MULTI-TYPE
--  Location: migrations/sql/20260930-mpesa-multi-type.sql
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_paybill_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_till_enabled    BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mpesa_pochi_enabled   BOOLEAN DEFAULT FALSE;

UPDATE businesses
SET mpesa_paybill_enabled = TRUE
WHERE mpesa_payment_type = 'paybill' AND mpesa_paybill_number IS NOT NULL;

UPDATE businesses
SET mpesa_till_enabled = TRUE
WHERE mpesa_payment_type = 'till' AND mpesa_till_number IS NOT NULL;

UPDATE businesses
SET mpesa_pochi_enabled = TRUE
WHERE mpesa_payment_type = 'pochi' AND pochi_la_biashara_number IS NOT NULL;

DO $$
DECLARE
    col_paybill BOOLEAN;
    col_till    BOOLEAN;
    col_pochi   BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_paybill_enabled'
    ) INTO col_paybill;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_till_enabled'
    ) INTO col_till;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'mpesa_pochi_enabled'
    ) INTO col_pochi;

    RAISE NOTICE 'mpesa_paybill_enabled: %', col_paybill;
    RAISE NOTICE 'mpesa_till_enabled:    %', col_till;
    RAISE NOTICE 'mpesa_pochi_enabled:   %', col_pochi;
END $$;