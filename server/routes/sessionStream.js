const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Хранилище активных SSE-соединений: Map<userId(string), Set<res>>
const sseClients = new Map();

/**
 * Отправить событие конкретному пользователю по всем его активным SSE-соединениям.
 */
function notifyUser(userId, event, data) {
  const clients = sseClients.get(String(userId));
  if (!clients || clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// GET /api/session/stream
router.get('/stream', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.sendStatus(401);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.sendStatus(401);
  }

  const userId = String(decoded.userId);

  // Заголовки SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Подтверждение, что поток открыт
  res.write('event: connected\ndata: {}\n\n');

  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);

  req.on('close', () => {
    const set = sseClients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) sseClients.delete(userId);
  });
});

// Правильный экспорт для CommonJS
module.exports = { router, notifyUser };