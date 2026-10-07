const express = require('express');
const { pool, logError } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const requestedPage = Number.parseInt(req.query.page, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 10;
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const offset = (page - 1) * limit;
  const search = String(req.query.search || '').trim().slice(0, 120);
  const categoryValue = String(req.query.category || '').trim();
  const categoryId = /^\d+$/.test(categoryValue) ? Number.parseInt(categoryValue, 10) : null;
  const sort = ['newest', 'popular', 'rating'].includes(String(req.query.sort || '').toLowerCase())
    ? String(req.query.sort).toLowerCase()
    : 'newest';
  const locationFilters = ['continent', 'country', 'county', 'sub_county', 'town', 'ward']
    .map(field => [field, String(req.query[field] || '').trim().slice(0, 80)])
    .filter(([, value]) => value);

  try {
    const result = await pool.query(`
      SELECT *
        FROM (
          SELECT 'product'::text AS item_type,
                 p.id AS item_id,
                 b.id AS business_id,
                 b.business_name,
                 b.slug AS business_slug,
                 b.logo AS business_logo,
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
                 ,concat_ws(' ', to_jsonb(b)->>'continent', to_jsonb(b)->>'country', to_jsonb(b)->>'county', to_jsonb(b)->>'sub_county', to_jsonb(b)->>'town', to_jsonb(b)->>'ward') AS location_text
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
                 ,concat_ws(' ', to_jsonb(b)->>'continent', to_jsonb(b)->>'country', to_jsonb(b)->>'county', to_jsonb(b)->>'sub_county', to_jsonb(b)->>'town', to_jsonb(b)->>'ward') AS location_text
            FROM business_services s
            JOIN businesses b ON b.id = s.business_id
           WHERE s.is_active = TRUE AND b.is_active = TRUE
       ) AS social_feed
       WHERE ($10::int IS NULL OR EXISTS (
         SELECT 1 FROM business_category_assignments bca
          WHERE bca.business_id = social_feed.business_id AND bca.category_id = $10
       ))
       ORDER BY
         CASE WHEN $3 <> '' AND location_text ILIKE '%' || $3 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $3 <> '' AND concat_ws(' ', title, description, business_name) ILIKE '%' || $3 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $4 <> '' AND location_text ILIKE '%' || $4 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $5 <> '' AND location_text ILIKE '%' || $5 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $6 <> '' AND location_text ILIKE '%' || $6 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $7 <> '' AND location_text ILIKE '%' || $7 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $8 <> '' AND location_text ILIKE '%' || $8 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $9 <> '' AND location_text ILIKE '%' || $9 || '%' THEN 0 ELSE 1 END,
         CASE WHEN $11 = 'popular' THEN (
           SELECT COUNT(*) FROM products p
            WHERE p.business_id = social_feed.business_id AND p.is_active = TRUE
         ) END DESC NULLS LAST,
         CASE WHEN $11 = 'rating' THEN (
           SELECT COALESCE(AVG(br.rating), 0) FROM business_reviews br
            WHERE br.business_id = social_feed.business_id
         ) END DESC NULLS LAST,
         created_at DESC, item_type ASC, item_id DESC
       LIMIT $1 OFFSET $2
    `, [limit + 1, offset, search, ...locationFilters.map(([, value]) => value), ...Array(6 - locationFilters.length).fill(''), categoryId, sort]);

    const rows = result.rows;
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return res.json({ success: true, items: rows, page, hasMore });
  } catch (error) {
    console.error('Load marketplace social feed error:', error);
    logError(error, 'Load marketplace social feed');
    return res.status(500).json({ error: 'Unable to load the marketplace feed.' });
  }
});

module.exports = router;
