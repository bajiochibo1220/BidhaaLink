-- Add service media storage for deployments that already recorded the
-- original business-services details migration before the media column existed.
ALTER TABLE business_services
    ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

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
