/**
 * profileController.js — контроллер профиля пользователя.
 * Получение данных, смена логина/пароля, ежечасные фишки, удаление аккаунта.
 */

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

/**
 * GET /api/profile/me
 * Возвращает данные текущего пользователя.
 * Токен читается из httpOnly куки через expressAuth middleware.
 */
async function getMe(req, res, next) {
    try {
        const result = await pool.query(
            'SELECT id, username, chips, last_claim_at FROM users WHERE id = $1',
            [req.user.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/profile/claim-chips
 * Начисляет 500 фишек раз в час.
 * Проверяет last_claim_at — если прошло меньше часа, возвращает ошибку
 * с количеством секунд до следующего получения.
 */
async function claimChips(req, res, next) {
    try {
        const result = await pool.query(
            'SELECT chips, last_claim_at FROM users WHERE id = $1',
            [req.user.userId]
        );
        const user = result.rows[0];
        const now = new Date();

        // Проверяем кулдаун: прошёл ли час с последнего получения фишек
        if (user.last_claim_at) {
            const secondsSinceClaim = (now - new Date(user.last_claim_at)) / 1000;
            const cooldownSeconds = 3600; // 1 час

            if (secondsSinceClaim < cooldownSeconds) {
                const secondsLeft = Math.ceil(cooldownSeconds - secondsSinceClaim);
                return res.status(429).json({
                    error: 'Ещё рано',
                    secondsLeft, // Клиент покажет обратный отсчёт
                });
            }
        }

        // Начисляем 500 фишек и обновляем время последнего получения
        const updated = await pool.query(
            'UPDATE users SET chips = chips + 500, last_claim_at = $1 WHERE id = $2 RETURNING chips',
            [now, req.user.userId]
        );

        res.json({
            message: 'Вы получили 500 фишек!',
            chips: updated.rows[0].chips,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/profile/username
 * Смена логина. Требует подтверждения текущего пароля.
 * Body: { newUsername, password }
 */
async function changeUsername(req, res, next) {
    try {
        const { newUsername, password } = req.body;

        if (!newUsername || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        if (newUsername.length < 3 || newUsername.length > 20) {
            return res.status(400).json({ error: 'Логин должен быть от 3 до 20 символов' });
        }

        // Проверяем текущий пароль
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.userId]
        );
        const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        // Проверяем уникальность нового логина
        const existing = await pool.query(
            'SELECT id FROM users WHERE username = $1 AND id != $2',
            [newUsername, req.user.userId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Этот логин уже занят' });
        }

        await pool.query(
            'UPDATE users SET username = $1 WHERE id = $2',
            [newUsername, req.user.userId]
        );

        res.json({ message: 'Логин успешно изменён' });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/profile/password
 * Смена пароля. Требует текущий пароль.
 * Body: { currentPassword, newPassword }
 */
async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
        }

        // Проверяем текущий пароль
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.userId]
        );
        const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, req.user.userId]
        );

        res.json({ message: 'Пароль успешно изменён' });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/profile
 * Удаление аккаунта. Требует подтверждения пароля.
 * Body: { password }
 */
async function deleteAccount(req, res, next) {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Введите пароль для подтверждения' });
        }

        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.userId]
        );
        const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [req.user.userId]);

        // Очищаем куку — пользователь удалён
        res.clearCookie('token');
        res.json({ message: 'Аккаунт удалён' });
    } catch (err) {
        next(err);
    }
}

module.exports = { getMe, claimChips, changeUsername, changePassword, deleteAccount };