const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' }
});

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'The assistant is receiving too many requests. Please wait a minute and try again.' }
});

module.exports = { generalLimiter, loginLimiter, sensitiveLimiter, assistantLimiter };
