ALTER TABLE business_services
    ADD COLUMN IF NOT EXISTS price_unit VARCHAR(20) NOT NULL DEFAULT 'per_service';

ALTER TABLE business_services
    ADD COLUMN IF NOT EXISTS service_area VARCHAR(160) NOT NULL DEFAULT '';

ALTER TABLE business_services
    ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'business_services_price_unit_check'
           AND conrelid = 'business_services'::regclass
    ) THEN
        ALTER TABLE business_services
            ADD CONSTRAINT business_services_price_unit_check
            CHECK (price_unit IN ('per_service', 'per_item', 'per_hour', 'per_day'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'business_services_media_check'
           AND conrelid = 'business_services'::regclass
    ) THEN
        ALTER TABLE business_services
            ADD CONSTRAINT business_services_media_check
            CHECK (jsonb_typeof(media) = 'array');
    END IF;
END $$;
