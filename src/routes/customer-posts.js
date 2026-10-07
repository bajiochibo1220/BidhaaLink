const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { pool, logError } = require('../config/database');
const { authMiddleware, customerOnly } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      fs.mkdir(uploadDir, { recursive: true }).then(() => callback(null, uploadDir), callback);
    },
    filename: (req, file, callback) => callback(null, `customer-${crypto.randomUUID()}${extensions[file.mimetype] || '.bin'}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (extensions[file.mimetype]) return callback(null, true);
    callback(new Error('Choose a JPEG, PNG, WebP, GIF, MP4, or WebM file.'));
  }
});

function receiveFile(field) {
  return (req, res, next) => upload.single(field)(req, res, error => {
    if (error) return res.status(400).json({ error: error.message || 'Unable to receive this upload.' });
    next();
  });
}

async function removeTemporaryFile(file) {
  if (file?.path) await fs.unlink(file.path).catch(() => {});
}

router.post('/', authMiddleware, customerOnly, receiveFile('media'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a photo or video to post.' });

  try {
    const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const mediaUrl = await uploadToCloudinary(file.path, {
      folder: `customer_posts/${req.userId}`,
      resource_type: mediaType === 'video' ? 'video' : 'image'
    });
    const caption = String(req.body.caption || '').trim().slice(0, 2000);
    const result = await pool.query(`
      INSERT INTO customer_social_posts (customer_id, media_url, media_type, caption)
      VALUES ($1, $2, $3, $4)
      RETURNING id, media_url, media_type, caption, created_at
    `, [req.userId, mediaUrl, mediaType, caption]);
    const customer = await pool.query(
      'SELECT name, username, profile_image FROM customers WHERE id = $1',
      [req.userId]
    );
    return res.status(201).json({ success: true, post: { ...result.rows[0], ...customer.rows[0] } });
  } catch (error) {
    console.error('Create customer social post error:', error);
    logError(error, 'Create customer social post');
    return res.status(500).json({ error: 'Unable to publish your post. Please try again.' });
  } finally {
    await removeTemporaryFile(file);
  }
});

router.get('/mine', authMiddleware, customerOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, media_url, media_type, caption, created_at
        FROM customer_social_posts
       WHERE customer_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC, id DESC
       LIMIT 100
    `, [req.userId]);
    return res.json({ success: true, posts: result.rows });
  } catch (error) {
    logError(error, 'Load customer social posts');
    return res.status(500).json({ error: 'Unable to load your posts.' });
  }
});

router.delete('/:id', authMiddleware, customerOnly, async (req, res) => {
  const postId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: 'Invalid post.' });
  try {
    const result = await pool.query(`
      UPDATE customer_social_posts
         SET is_active = FALSE
       WHERE id = $1 AND customer_id = $2 AND is_active = TRUE
       RETURNING id
    `, [postId, req.userId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Post not found.' });
    return res.json({ success: true });
  } catch (error) {
    logError(error, 'Delete customer social post');
    return res.status(500).json({ error: 'Unable to remove this post.' });
  }
});

router.put('/profile-photo', authMiddleware, customerOnly, receiveFile('avatar'), async (req, res) => {
  const file = req.file;
  if (!file || !file.mimetype.startsWith('image/')) {
    await removeTemporaryFile(file);
    return res.status(400).json({ error: 'Choose a JPEG, PNG, WebP, or GIF profile photo.' });
  }
  try {
    const profileImage = await uploadToCloudinary(file.path, {
      folder: `customer_profiles/${req.userId}`,
      resource_type: 'image'
    });
    const result = await pool.query(
      'UPDATE customers SET profile_image = $1 WHERE id = $2 RETURNING profile_image',
      [profileImage, req.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Customer account not found.' });
    return res.json({ success: true, profile_image: result.rows[0].profile_image });
  } catch (error) {
    logError(error, 'Update customer profile photo');
    return res.status(500).json({ error: 'Unable to update your profile photo.' });
  } finally {
    await removeTemporaryFile(file);
  }
});

module.exports = router;
