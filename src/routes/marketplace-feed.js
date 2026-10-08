const express = require('express');
const crypto = require('crypto');
const { pool, logError } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const requestedPage = Number.parseInt(req.query.page, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 10;
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const offset = (page - 1) * limit;
  const search = String(req.query.search || '').trim().slice(0, 120);
  const sort = ['newest', 'popular', 'rating'].includes(String(req.query.sort || '').toLowerCase())
    ? String(req.query.sort).toLowerCase()
    : 'newest';
  const seed = String(req.query.seed || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    || crypto.randomBytes(16).toString('hex');
  try {
    // Customer posting was introduced separately from the marketplace feed.
    // Keep product and service discovery available on databases that have not
    // received that optional table migration yet.
    const customerPostsSchema = await pool.query(
      "SELECT to_regclass('customer_social_posts') IS NOT NULL AS available"
    );
    const customerPostUnion = customerPostsSchema.rows[0]?.available ? `
          UNION ALL

          SELECT 'customer_post'::text AS item_type,
                 cp.id AS item_id,
                 NULL::int AS business_id,
                 NULL::text AS business_name,
                 NULL::text AS business_slug,
                 NULL::text AS business_logo,
                 c.name AS customer_name,
                 c.profile_image AS customer_profile_image,
                 c.id AS customer_id,
                 cp.caption AS title,
                 cp.caption AS description,
                 NULL::text AS price,
                 cp.media_url,
                 NULL::text AS media_poster_url,
                 cp.media_type AS media_kind,
                 NULL::text AS service_area,
                 NULL::text AS pricing_mode,
                 NULL::text AS price_unit,
                 0::int AS media_count,
                 cp.created_at,
                 NULL::text AS location_text
            FROM customer_social_posts cp
            JOIN customers c ON c.id = cp.customer_id
           WHERE cp.is_active = TRUE AND COALESCE(c.is_active, TRUE) = TRUE
    ` : '';
    const result = await pool.query(`
      WITH social_feed AS (
          SELECT 'product'::text AS item_type,
                 p.id AS item_id,
                 b.id AS business_id,
                 b.business_name,
                 b.slug AS business_slug,
                 b.logo AS business_logo,
                 NULL::text AS customer_name,
                 NULL::text AS customer_profile_image,
                 NULL::int AS customer_id,
                 p.name AS title,
                 p.description,
                 p.price::text AS price,
                 CASE
                   WHEN p.media_type = 'video' AND NULLIF(BTRIM(p.video), '') IS NOT NULL THEN p.video
                   ELSE COALESCE(NULLIF(BTRIM(p.image), ''), NULLIF(BTRIM(p.video_poster_url), ''), NULLIF(BTRIM(p.video), ''), NULLIF(BTRIM(b.heroImage), ''), b.logo)
                 END AS media_url,
                 CASE WHEN p.media_type = 'video' THEN NULLIF(BTRIM(p.video_poster_url), '') ELSE NULL END AS media_poster_url,
                 CASE
                   WHEN p.media_type = 'video' AND NULLIF(BTRIM(p.video), '') IS NOT NULL THEN 'video'
                   WHEN COALESCE(NULLIF(BTRIM(p.image), ''), NULLIF(BTRIM(p.video_poster_url), ''), NULLIF(BTRIM(p.video), ''), NULLIF(BTRIM(b.heroImage), ''), b.logo) IS NOT NULL THEN 'image'
                   ELSE 'none'
                 END AS media_kind,
                 NULL::text AS service_area,
                 'fixed'::text AS pricing_mode,
                 NULL::text AS price_unit,
                 0::int AS media_count,
                 p.created_at
                 ,concat_ws(' ', to_jsonb(b)->>'location', to_jsonb(b)->>'address', to_jsonb(b)->>'continent', to_jsonb(b)->>'country', to_jsonb(b)->>'county', to_jsonb(b)->>'sub_county', to_jsonb(b)->>'town', to_jsonb(b)->>'ward') AS location_text
            FROM products p
            JOIN businesses b ON b.id = p.business_id
           WHERE p.is_active = TRUE AND b.is_active = TRUE

          UNION ALL

          SELECT 'service'::text AS item_type,
                 s.id AS item_id,
                 b.id AS business_id,
                 b.business_name,
                 b.slug AS business_slug,
                 b.logo AS business_logo,
                 NULL::text AS customer_name,
                 NULL::text AS customer_profile_image,
                 NULL::int AS customer_id,
                 s.name AS title,
                 s.description,
                 CASE WHEN s.pricing_mode = 'fixed' THEN s.price::text ELSE NULL END AS price,
                 COALESCE(s.media->0->>'url', NULLIF(BTRIM(b.heroImage), ''), b.logo) AS media_url,
                 s.media->0->>'poster' AS media_poster_url,
                 COALESCE(s.media->0->>'kind', CASE WHEN COALESCE(NULLIF(BTRIM(b.heroImage), ''), b.logo) IS NULL THEN 'none' ELSE 'image' END) AS media_kind,
                 s.service_area,
                 s.pricing_mode::text AS pricing_mode,
                 s.price_unit::text AS price_unit,
                 GREATEST(jsonb_array_length(s.media) - 1, 0)::int AS media_count,
                 s.created_at
                 ,concat_ws(' ', s.service_area, to_jsonb(b)->>'location', to_jsonb(b)->>'address', to_jsonb(b)->>'continent', to_jsonb(b)->>'country', to_jsonb(b)->>'county', to_jsonb(b)->>'sub_county', to_jsonb(b)->>'town', to_jsonb(b)->>'ward') AS location_text
            FROM business_services s
            JOIN businesses b ON b.id = s.business_id
           WHERE s.is_active = TRUE AND b.is_active = TRUE

          ${customerPostUnion}
       ), ranked_feed AS (
         SELECT social_feed.*,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(
                    'business:' || social_feed.business_id::text,
                    'customer:' || social_feed.customer_id::text
                  )
                  ORDER BY md5($5::text || ':' || social_feed.item_type || ':' || social_feed.item_id::text)
                ) AS business_item_rank
           FROM social_feed
          WHERE ($3 = '' OR concat_ws(' ', social_feed.title, social_feed.description,
                                      social_feed.business_name, social_feed.location_text)
                 ILIKE '%' || $3 || '%')
       )
       SELECT * FROM ranked_feed
       ORDER BY
         CASE WHEN $3 <> '' AND location_text ILIKE '%' || $3 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $4 = 'popular' THEN (
           SELECT COUNT(*) FROM products p
            WHERE p.business_id = ranked_feed.business_id AND p.is_active = TRUE
         ) END DESC NULLS LAST,
         CASE WHEN $4 = 'rating' THEN (
           SELECT COALESCE(AVG(br.rating), 0) FROM business_reviews br
            WHERE br.business_id = ranked_feed.business_id
         ) END DESC NULLS LAST,
         business_item_rank ASC,
         md5($5::text || ':' || COALESCE('business:' || business_id::text, 'customer:' || customer_id::text)),
         md5($5::text || ':' || item_type || ':' || item_id::text)
       LIMIT $1 OFFSET $2
    `, [limit + 1, offset, search, sort, seed]);

    const rows = result.rows;
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return res.json({ success: true, items: rows, page, hasMore, seed });
  } catch (error) {
    console.error('Load marketplace social feed error:', error);
    logError(error, 'Load marketplace social feed');
    return res.status(500).json({ error: 'Unable to load the marketplace feed.' });
  }
});

module.exports = router;
