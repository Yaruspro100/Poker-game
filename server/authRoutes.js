/**
 * authRoutes.js — маршруты аутентификации.
 */

const express = require('express');
const router = express.Router();
const { register, login, logout } = require('./authController');

// POST /api/auth/register — регистрация
router.post('/register', register);

// POST /api/auth/login — вход, получение токена и установка куки
router.post('/login', login);

// POST /api/auth/logout — выход, очистка куки
router.post('/logout', logout);

module.exports = router;