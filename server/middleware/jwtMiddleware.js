/**
jwtMiddleware.js — middleware для проверки JWT-токена.
Содержит две версии:
expressAuth — для защиты HTTP-маршрутов Express
socketAuth  — для защиты Socket.io соединений
После успешной проверки данные пользователя доступны как:
req.user       (в Express-маршрутах)
socket.user    (в Socket.io обработчиках)
*/
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); 

/**
Middleware для Express.
Ожидает заголовок: Authorization: Bearer <token>
Пример защищённого маршрута:
app.get('/api/profile', expressAuth, (req, res) => {
  res.json(req.user); // { userId, username }
});
*/
async function expressAuth(req, res, next) {
    try {
        let token;
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        } else if (req.cookies?.token) {
            // Запасной вариант — читаем из httpOnly куки (для браузерных запросов)
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ error: 'Токен отсутствует или имеет неверный формат' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Проверка валидности сессии в БД (защита от одновременных входов)
        const result = await pool.query('SELECT session_token FROM users WHERE id = $1', [decoded.userId]);
        if (result.rows.length === 0 || result.rows[0].session_token !== decoded.sessionToken) {
            res.clearCookie('token');
            return res.status(401).json({ error: 'Сессия истекла: вход выполнен с другого устройства' });
        }

        req.user = {
            userId: decoded.userId,
            username: decoded.username,
        };
        next();
    } catch (err) {
        res.clearCookie('token');
        return res.status(401).json({ error: 'Токен недействителен или истёк' });
    }
}

/**
Middleware для Socket.io.
Подключается через: io.use(socketAuth)
Ожидает токен в: socket.handshake.auth.token
Пример на клиенте:
const socket = io({ auth: { token: localStorage.getItem('token') } });
После успешной проверки в обработчиках доступно socket.user.
*/
async function socketAuth(socket, next) {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) {
            // next(new Error(...)) — стандартный способ отклонить соединение в Socket.io
            return next(new Error('Authentication error: токен не передан'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Проверка валидности сессии в БД для защиты от одновременных сессий
        const result = await pool.query('SELECT session_token FROM users WHERE id = $1', [decoded.userId]);
        if (result.rows.length === 0 || result.rows[0].session_token !== decoded.sessionToken) {
            return next(new Error('Session expired: вход выполнен с другого устройства'));
        }

        // Сохраняем данные пользователя в объект сокета
        socket.user = {
            userId: decoded.userId,
            username: decoded.username,
        };

        next(); // Разрешаем соединение
    } catch (err) {
        return next(new Error('Authentication error: токен недействителен или истёк'));
    }
}

module.exports = { expressAuth, socketAuth };