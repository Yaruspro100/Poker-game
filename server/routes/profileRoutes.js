/**
 * profileRoutes.js — маршруты профиля пользователя.
 * Все маршруты защищены через expressAuth (требуют валидный JWT в куке).
 */

const express = require('express');
const router = express.Router();
const { expressAuth } = require('../middleware/jwtMiddleware');
const { getMe, claimChips, changeUsername, changePassword, deleteAccount } = require('../controllers/profileController');

// Применяем expressAuth ко всем маршрутам профиля
router.use(expressAuth);

router.get('/me', getMe);
router.post('/claim-chips', claimChips);
router.put('/username', changeUsername);
router.put('/password', changePassword);
router.delete('/', deleteAccount);

module.exports = router;