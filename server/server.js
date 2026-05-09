/**
 * server.js — точка входа в приложение.
 * Защита страниц происходит на сервере через httpOnly куки —
 * браузер никогда не получает HTML защищённой страницы без валидного токена.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

const authRoutes = require('./authRoutes');
const { socketAuth } = require('./jwtMiddleware');

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
io.use(socketAuth);

// Express middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser()); // Читает куки из запроса и кладёт в req.cookies

//  Middleware проверки авторизации по кукам
//  Проверяет httpOnly куку 'token' ДО отдачи HTML.
//  Если токен невалиден — редирект на /login.html.
function requireAuth(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect('/login.html');
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next(); // Токен валиден — отдаём страницу
    } catch {
        // Токен просрочен или подделан — чистим куку и редиректим
        res.clearCookie('token');
        return res.redirect('/login.html');
    }
}

//  Защищённые HTML-маршруты
//  ВАЖНО: должны стоять ДО express.static,
//  иначе статика отдаст файл раньше проверки!
app.get('/create-room.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'create-room.html'));
});
app.get('/connect-to-room.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'connect-to-room.html'));
});
app.get('/profile.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'profile.html'));
});

// Маршруты API
app.use('/api/auth', authRoutes);

// Статические файлы (публичные страницы)
// Стоит ПОСЛЕ защищённых маршрутов
app.use(express.static(path.join(__dirname, '..')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'menu.html'));
});

// Socket.io
io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.user.username} (${socket.id})`);

    socket.emit('welcome', {
        message: `Добро пожаловать, ${socket.user.username}!`,
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.user.username} (${socket.id})`);
    });
});

// Глобальный обработчик ошибок
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Необработанная ошибка:', err);
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
    res.status(statusCode).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

// Запуск
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});