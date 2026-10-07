ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS profile_image TEXT;

CREATE TABLE IF NOT EXISTS customer_social_posts (
  id BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
  caption VARCHAR(2000) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_social_posts_feed_idx
  ON customer_social_posts (created_at DESC, id DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS customer_social_posts_customer_idx
  ON customer_social_posts (customer_id, created_at DESC);
