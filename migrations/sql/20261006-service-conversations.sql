-- Private, business-scoped conversations started from a public service card.
-- The first message can reference the exact service image or video the
-- customer selected. All statements are safe to re-run.

CREATE TABLE IF NOT EXISTS business_service_conversations (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES business_services(id) ON DELETE SET NULL,
    service_name VARCHAR(180) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_service_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES business_service_conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer', 'business')),
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    media_url TEXT,
    media_kind VARCHAR(10) CHECK (media_kind IS NULL OR media_kind IN ('image', 'video')),
    media_caption VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_by_customer BOOLEAN NOT NULL DEFAULT FALSE,
    read_by_business BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK ((media_url IS NULL AND media_kind IS NULL) OR (media_url IS NOT NULL AND media_kind IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_service_conversations_business_recent
    ON business_service_conversations (business_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_conversations_customer_recent
    ON business_service_conversations (customer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_conversations_service
    ON business_service_conversations (service_id);
CREATE INDEX IF NOT EXISTS idx_service_messages_thread
    ON business_service_messages (conversation_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_service_messages_unread_customer
    ON business_service_messages (conversation_id, read_by_customer)
    WHERE sender_type = 'business';
CREATE INDEX IF NOT EXISTS idx_service_messages_unread_business
    ON business_service_messages (conversation_id, read_by_business)
    WHERE sender_type = 'customer';
