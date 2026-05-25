/**
 * authController.js — контроллер аутентификации.
 * Содержит бизнес-логику регистрации и входа:
 * валидацию данных, хеширование пароля, работу с БД,
 * генерацию JWT-токена.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

/**
 * Регистрация нового пользователя.
 * POST /api/auth/register
 * Body: { username, password }
 */
async function register(req, res, next) {
    try {
        const { username, password } = req.body;

        // Валидация входных данных
        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Логин должен быть от 3 до 20 символов' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
        }

        // Проверка на уникальность имени пользователя
        const existing = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Пользователь уже существует' });
        }

        // Хеширование пароля
        // 10 раундов соли — хороший баланс между безопасностью и скоростью.
        const passwordHash = await bcrypt.hash(password, 10);

        // Запись нового пользователя в БД
        await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
            [username, passwordHash]
        );

        return res.status(201).json({ message: 'Пользователь создан' });

    } catch (err) {
        next(err);
    }
}

/**
 * Вход пользователя (получение JWT-токена).
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res, next) {
    try {
        const { username, password } = req.body;

        // Базовая валидация
        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        // Поиск пользователя в БД
        const result = await pool.query(
            'SELECT id, username, password_hash, chips FROM users WHERE username = $1',
            [username]
        );

        // Намеренно одинаковое сообщение — не раскрываем, существует ли логин
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const user = result.rows[0];

        // Проверка пароля
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Генерация уникального session_token для защиты от одновременных сессий
        const sessionToken = crypto.randomBytes(32).toString('hex');
        await pool.query(
            'UPDATE users SET session_token = $1 WHERE id = $2',
            [sessionToken, user.id]
        );

        const io = req.app.get('io');
            if (io) {
                for (const [, socket] of io.sockets.sockets) {
                    if (socket.user && String(socket.user.userId) === String(user.id)) {
                        socket.emit('session-kicked', {
                        reason: 'Выполнен вход с другого устройства',
                        });
                        socket.disconnect(true);
                    }
                }
            }

        // Генерация JWT-токена с session_token
        const token = jwt.sign(
            { userId: user.id, username: user.username, sessionToken },
            process.env.JWT_SECRET,
            { expiresIn: '24h', algorithm: 'HS256' }
        );

        // Сохраняем токен в httpOnly куки
        // httpOnly: true — JS на клиенте не может прочитать куку (защита от XSS).
        // Браузер автоматически отправляет куку при каждом запросе к серверу —
        // это позволяет серверу проверять авторизацию ДО отдачи HTML-страницы.
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 часа в миллисекундах
            sameSite: 'strict',
        });

        // Токен также возвращаем в JSON — нужен клиенту для Socket.io
        return res.status(200).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                chips: user.chips,
            },
        });

    } catch (err) {
        next(err);
    }
}

/**
 * Выход пользователя.
 * POST /api/auth/logout
 * Очищает httpOnly куку с токеном.
 */
function logout(req, res) {
    res.clearCookie('token');
    return res.status(200).json({ message: 'Выход выполнен' });
}

module.exports = { register, login, logout };