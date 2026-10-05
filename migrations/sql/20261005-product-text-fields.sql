-- Product badges and the legacy free-form category are business-entered
-- text. Keep longer values from failing product create/update with SQLSTATE
-- 22001 (value too long for character varying(100)).
ALTER TABLE products
    ALTER COLUMN badge1 TYPE TEXT,
    ALTER COLUMN badge2 TYPE TEXT,
    ALTER COLUMN category TYPE TEXT;
