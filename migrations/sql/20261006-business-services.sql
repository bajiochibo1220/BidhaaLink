CREATE TABLE IF NOT EXISTS business_services (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    pricing_mode VARCHAR(16) NOT NULL DEFAULT 'fixed'
        CHECK (pricing_mode IN ('fixed', 'negotiable')),
    price NUMERIC(12, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_services_price_mode_check CHECK (
        (pricing_mode = 'fixed' AND price IS NOT NULL AND price >= 0)
        OR (pricing_mode = 'negotiable' AND price IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_business_services_public
    ON business_services (business_id, is_active, display_order, id);
