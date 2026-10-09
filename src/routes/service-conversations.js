const express = require('express');
const { pool, logError } = require('../config/database');
const { authMiddleware, customerOnly, businessAdminOnly } = require('../middleware/auth');
const variantService = require('../services/variantService');

const router = express.Router();
const DEFAULT_MESSAGE = 'Can we have a talk about this service please?';

function parseMedia(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (_) { return []; }
  }
  return Array.isArray(value) ? value : [];
}

function validId(raw) {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normaliseBody(raw) {
  return typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
}

async function getConversationForRole(client, req, conversationId, role) {
  const where = role === 'customer'
    ? 'c.id = $1 AND c.customer_id = $2'
    : 'c.id = $1 AND c.business_id = $2';
  const ownerId = role === 'customer' ? req.userId : req.businessId;
  const result = await client.query(`
    SELECT c.id, c.business_id, c.customer_id, c.service_id, c.product_id, c.service_name,
           c.created_at, c.updated_at, c.last_message_at,
           b.name AS business_name, b.slug AS business_slug,
           cu.name AS customer_name
      FROM business_service_conversations c
      JOIN businesses b ON b.id = c.business_id
      JOIN customers cu ON cu.id = c.customer_id
     WHERE ${where}
  `, [conversationId, ownerId]);
  return result.rows[0] || null;
}

async function loadConversation(req, res, role) {
  const conversationId = validId(req.params.id);
  if (!conversationId) return res.status(400).json({ error: 'Invalid conversation.' });
  const client = await pool.connect();
  try {
    const conversation = await getConversationForRole(client, req, conversationId, role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    if (role === 'customer') {
      await client.query(
        "UPDATE business_service_messages SET read_by_customer = TRUE WHERE conversation_id = $1 AND sender_type = 'business'",
        [conversationId]
      );
    } else {
      await client.query(
        "UPDATE business_service_messages SET read_by_business = TRUE WHERE conversation_id = $1 AND sender_type = 'customer'",
        [conversationId]
      );
    }
    const messages = await client.query(
      'SELECT id, sender_type, sender_id, body, media_url, media_kind, media_caption, created_at FROM business_service_messages WHERE conversation_id = $1 ORDER BY created_at, id',
      [conversationId]
    );
    return res.json({ success: true, conversation, messages: messages.rows });
  } catch (error) {
    console.error('Load service conversation error:', error);
    logError(error, 'Load service conversation');
    return res.status(500).json({ error: 'Unable to load this conversation.' });
  } finally {
    client.release();
  }
}

async function sendReply(req, res, role) {
  const conversationId = validId(req.params.id);
  const body = normaliseBody(req.body?.message);
  if (!conversationId) return res.status(400).json({ error: 'Invalid conversation.' });
  if (!body) return res.status(400).json({ error: 'Write a message before sending.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const conversation = await getConversationForRole(client, req, conversationId, role);
    if (!conversation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    const senderId = role === 'customer' ? req.userId : req.userId;
    const result = await client.query(`
      INSERT INTO business_service_messages
        (conversation_id, sender_type, sender_id, body, read_by_customer, read_by_business)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, sender_type, sender_id, body, media_url, media_kind, media_caption, created_at
    `, [conversationId, role, senderId, body, role === 'customer', role === 'business']);
    await client.query(
      'UPDATE business_service_conversations SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );
    await client.query('COMMIT');
    const io = req.app.get('io');
    if (io) {
      const room = role === 'customer' ? `business_${conversation.business_id}` : `customer_${conversation.customer_id}`;
      io.to(room).emit('service-conversation-message', { conversationId, businessId: conversation.business_id });
    }
    return res.status(201).json({ success: true, message: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Send service conversation reply error:', error);
    logError(error, 'Send service conversation reply');
    return res.status(500).json({ error: 'Your message could not be sent. Please try again.' });
  } finally {
    client.release();
  }
}

// Customer starts/reopens the service thread by choosing In-app conversation.
// Only active services and media that belongs to that service are accepted.
router.post('/customer/conversations', authMiddleware, customerOnly, async (req, res) => {
  const slug = String(req.body?.businessSlug || '').trim().slice(0, 180);
  const serviceId = validId(req.body?.serviceId);
  if (!slug || !serviceId) return res.status(400).json({ error: 'Choose a valid business service.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const serviceResult = await client.query(`
      SELECT s.id, s.business_id, s.name, s.description, s.pricing_mode, s.price,
             s.price_unit, s.media, b.slug, b.is_active AS business_is_active
        FROM business_services s
        JOIN businesses b ON b.id = s.business_id
       WHERE b.slug = $1 AND s.id = $2 AND s.is_active = TRUE AND b.is_active = TRUE
       LIMIT 1
    `, [slug, serviceId]);
    const service = serviceResult.rows[0];
    if (!service) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This service is no longer available.' });
    }

    const mediaKind = req.body?.mediaKind === 'image' || req.body?.mediaKind === 'video' ? req.body.mediaKind : null;
    const mediaUrl = typeof req.body?.mediaUrl === 'string' ? req.body.mediaUrl.slice(0, 2000) : null;
    const selectedMedia = mediaUrl && mediaKind
      ? parseMedia(service.media).find(item => item?.url === mediaUrl && item?.kind === mediaKind)
      : null;
    if ((mediaUrl || mediaKind) && !selectedMedia) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That service photo or video is no longer available.' });
    }

    const existing = await client.query(`
      SELECT id FROM business_service_conversations
       WHERE business_id = $1 AND customer_id = $2 AND service_id = $3
       ORDER BY last_message_at DESC LIMIT 1
    `, [service.business_id, req.userId, service.id]);
    let conversationId = existing.rows[0]?.id;
    if (!conversationId) {
      const created = await client.query(`
        INSERT INTO business_service_conversations (business_id, customer_id, service_id, service_name)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [service.business_id, req.userId, service.id, service.name]);
      conversationId = created.rows[0].id;
    }

    const priceLabel = service.pricing_mode === 'negotiable'
      ? 'You said you are free to negotiate'
      : `Ksh ${Number(service.price || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })} ${{ per_service: 'per job', per_item: 'per item', per_hour: 'per hour', per_day: 'per day' }[service.price_unit] || 'per job'}`;
    const body = `${DEFAULT_MESSAGE}\nService: ${service.name}\nPrice -> ${priceLabel}`;
    const inserted = await client.query(`
      INSERT INTO business_service_messages
        (conversation_id, sender_type, sender_id, body, media_url, media_kind, media_caption, read_by_customer, read_by_business)
      VALUES ($1, 'customer', $2, $3, $4, $5, $6, TRUE, FALSE)
      RETURNING id, sender_type, sender_id, body, media_url, media_kind, media_caption, created_at
    `, [conversationId, req.userId, body, selectedMedia?.url || null, selectedMedia?.kind || null, selectedMedia?.caption || null]);
    await client.query(
      'UPDATE business_service_conversations SET updated_at = NOW(), last_message_at = NOW(), service_name = $1 WHERE id = $2',
      [service.name, conversationId]
    );
    await client.query('COMMIT');
    const io = req.app.get('io');
    if (io) io.to(`business_${service.business_id}`).emit('service-conversation-message', { conversationId, businessId: service.business_id });
    return res.status(201).json({ success: true, conversationId, message: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Start service conversation error:', error);
    logError(error, 'Start service conversation');
    return res.status(500).json({ error: 'Could not start this conversation. Please try again.' });
  } finally {
    client.release();
  }
});

// Product inquiries use the same private inbox as service conversations, but
// retain product_id so both sides can return to the exact listing.
router.post('/customer/product-conversations', authMiddleware, customerOnly, async (req, res) => {
  const slug = String(req.body?.businessSlug || '').trim().slice(0, 180);
  const productId = validId(req.body?.productId);
  const variantId = validId(req.body?.variantId);
  if (!slug || !productId) return res.status(400).json({ error: 'Choose a valid product.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productResult = await client.query(`
      SELECT p.id, p.business_id, p.name, p.price, p.image, p.video,
             p.media_type, p.video_poster_url, b.slug, b.is_active AS business_is_active
        FROM products p
        JOIN businesses b ON b.id = p.business_id
       WHERE b.slug = $1 AND p.id = $2 AND p.is_active = TRUE AND b.is_active = TRUE
       LIMIT 1
    `, [slug, productId]);
    const product = productResult.rows[0];
    if (!product) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'This product is no longer available.' });
    }

    let selectedVariant = null;
    if (variantId) {
      selectedVariant = await variantService.getVariantById(variantId, productId);
      if (!selectedVariant || selectedVariant.is_active !== true) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'This product option is no longer available.' });
      }
    }

    const existing = await client.query(`
      SELECT id FROM business_service_conversations
       WHERE business_id = $1 AND customer_id = $2 AND product_id = $3
       ORDER BY last_message_at DESC LIMIT 1
    `, [product.business_id, req.userId, product.id]);
    let conversationId = existing.rows[0]?.id;
    if (!conversationId) {
      const created = await client.query(`
        INSERT INTO business_service_conversations (business_id, customer_id, product_id, service_name)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [product.business_id, req.userId, product.id, `Product: ${product.name}`.slice(0, 180)]);
      conversationId = created.rows[0].id;
    }

    const sharedPrimaryVariant = selectedVariant && (selectedVariant.price === null || selectedVariant.price === undefined)
      ? await variantService.getDefaultVariant(productId)
      : null;
    const selectedPrice = selectedVariant?.price ?? product.price ?? sharedPrimaryVariant?.price;
    const variantLabel = [selectedVariant?.name, selectedVariant?.color_code].filter(Boolean).join(' · ');
    const productLabel = `${product.name}${variantLabel ? ` (${variantLabel})` : ''}`;
    const priceValue = Number(String(selectedPrice || '').replace(/[^0-9.]/g, ''));
    const priceLabel = Number.isFinite(priceValue)
      ? `Ksh ${priceValue.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
      : String(selectedPrice || 'Contact business');
    const body = `Can we have a talk about this product please?\nProduct: ${productLabel}\nPrice -> ${priceLabel}`;
    const variantMediaKind = selectedVariant?.image ? 'image' : selectedVariant?.video ? 'video' : null;
    const mediaKind = variantMediaKind || (product.media_type === 'video' && product.video ? 'video' : (product.image ? 'image' : null));
    const mediaUrl = variantMediaKind === 'image' ? selectedVariant.image
      : variantMediaKind === 'video' ? selectedVariant.video
        : mediaKind === 'video' ? product.video : mediaKind === 'image' ? product.image : null;
    const inserted = await client.query(`
      INSERT INTO business_service_messages
        (conversation_id, sender_type, sender_id, body, media_url, media_kind, media_caption, read_by_customer, read_by_business)
      VALUES ($1, 'customer', $2, $3, $4, $5, $6, TRUE, FALSE)
      RETURNING id, sender_type, sender_id, body, media_url, media_kind, media_caption, created_at
    `, [conversationId, req.userId, body, mediaUrl, mediaKind, productLabel]);
    await client.query(
      'UPDATE business_service_conversations SET updated_at = NOW(), last_message_at = NOW(), service_name = $1 WHERE id = $2',
      [`Product: ${product.name}`.slice(0, 180), conversationId]
    );
    await client.query('COMMIT');
    const io = req.app.get('io');
    if (io) io.to(`business_${product.business_id}`).emit('service-conversation-message', { conversationId, businessId: product.business_id });
    return res.status(201).json({ success: true, conversationId, message: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Start product conversation error:', error);
    logError(error, 'Start product conversation');
    return res.status(500).json({ error: 'Could not start this conversation. Please try again.' });
  } finally {
    client.release();
  }
});

router.get('/customer/conversations', authMiddleware, customerOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.business_id, c.service_id, c.product_id, c.service_name, c.created_at, c.last_message_at,
             b.name AS business_name, b.slug AS business_slug,
             last.body AS last_message, last.media_url AS last_media_url, last.media_kind AS last_media_kind,
             (SELECT COUNT(*)::int FROM business_service_messages m
               WHERE m.conversation_id = c.id AND m.sender_type = 'business' AND m.read_by_customer = FALSE) AS unread_count
        FROM business_service_conversations c
        JOIN businesses b ON b.id = c.business_id
        LEFT JOIN LATERAL (
          SELECT body, media_url, media_kind FROM business_service_messages
           WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
        ) last ON TRUE
       WHERE c.customer_id = $1
       ORDER BY c.last_message_at DESC
       LIMIT 100
    `, [req.userId]);
    return res.json({ success: true, conversations: result.rows });
  } catch (error) {
    console.error('List customer service conversations error:', error);
    logError(error, 'List customer service conversations');
    return res.status(500).json({ error: 'Could not load service conversations.' });
  }
});

router.get('/customer/conversations/:id', authMiddleware, customerOnly, (req, res) => loadConversation(req, res, 'customer'));
router.post('/customer/conversations/:id/messages', authMiddleware, customerOnly, (req, res) => sendReply(req, res, 'customer'));

router.get('/business/conversations', authMiddleware, businessAdminOnly, async (req, res) => {
  try {
    const businessId = req.businessId || validId(req.query.businessId);
    if (!businessId) return res.status(403).json({ error: 'No business is associated with this account.' });
    const result = await pool.query(`
      SELECT c.id, c.business_id, c.customer_id, c.service_id, c.product_id, c.service_name, c.created_at, c.last_message_at,
             cu.name AS customer_name,
             last.body AS last_message, last.media_url AS last_media_url, last.media_kind AS last_media_kind,
             (SELECT COUNT(*)::int FROM business_service_messages m
               WHERE m.conversation_id = c.id AND m.sender_type = 'customer' AND m.read_by_business = FALSE) AS unread_count
        FROM business_service_conversations c
        JOIN customers cu ON cu.id = c.customer_id
        LEFT JOIN LATERAL (
          SELECT body, media_url, media_kind FROM business_service_messages
           WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
        ) last ON TRUE
       WHERE c.business_id = $1
       ORDER BY c.last_message_at DESC
       LIMIT 200
    `, [businessId]);
    return res.json({ success: true, conversations: result.rows });
  } catch (error) {
    console.error('List business service conversations error:', error);
    logError(error, 'List business service conversations');
    return res.status(500).json({ error: 'Could not load service conversations.' });
  }
});

router.get('/business/conversations/:id', authMiddleware, businessAdminOnly, (req, res) => loadConversation(req, res, 'business'));
router.post('/business/conversations/:id/messages', authMiddleware, businessAdminOnly, (req, res) => sendReply(req, res, 'business'));

module.exports = router;
