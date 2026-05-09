/**
 * jwtMiddleware.js — middleware для проверки JWT-токена.
 * Содержит две версии:
 *   1. expressAuth — для защиты HTTP-маршрутов Express
 *   2. socketAuth  — для защиты Socket.io соединений
 *
 * После успешной проверки данные пользователя доступны как:
 *   - req.user       (в Express-маршрутах)
 *   - socket.user    (в Socket.io обработчиках)
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware для Express.
 * Ожидает заголовок: Authorization: Bearer <token>
 *
 * Пример защищённого маршрута:
 *   app.get('/api/profile', expressAuth, (req, res) => {
 *       res.json(req.user); // { userId, username }
 *   });
 */
function expressAuth(req, res, next) {
    // Извлекаем заголовок авторизации
    const authHeader = req.headers['authorization'];

    // Проверяем наличие и формат: "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Токен отсутствует или имеет неверный формат' });
    }

    // Вырезаем сам токен (всё после "Bearer ")
    const token = authHeader.slice(7);

    try {
        // jwt.verify выбрасывает исключение, если токен просрочен или подпись неверна
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Записываем данные пользователя в объект запроса —
        // они будут доступны во всех следующих middleware и обработчиках
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
        };

        next(); // Передаём управление следующему middleware
    } catch (err) {
        // TokenExpiredError, JsonWebTokenError, NotBeforeError
        return res.status(401).json({ error: 'Токен недействителен или истёк' });
    }
}

/**
 * Middleware для Socket.io.
 * Подключается через: io.use(socketAuth)
 * Ожидает токен в: socket.handshake.auth.token
 *
 * Пример на клиенте:
 *   const socket = io({ auth: { token: localStorage.getItem('token') } });
 *
 * После успешной проверки в обработчиках доступно socket.user.
 */
function socketAuth(socket, next) {
    const token = socket.handshake.auth?.token;

    if (!token) {
        // next(new Error(...)) — стандартный способ отклонить соединение в Socket.io
        return next(new Error('Authentication error: токен не передан'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

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