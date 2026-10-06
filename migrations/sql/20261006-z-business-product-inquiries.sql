-- Allow product inquiries to share the private business conversation inbox.
-- Service conversations keep service_id; product conversations use product_id.
ALTER TABLE business_service_conversations
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_conversations_product
    ON business_service_conversations (product_id);
