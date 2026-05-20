/**
 * server.js — точка входа в приложение.
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
const profileRoutes = require('./profileRoutes');
const { socketAuth } = require('./jwtMiddleware');
const RoomManager = require('./game/RoomManager');

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

// JWT-проверка для всех Socket.io соединений
io.use(socketAuth);

// Менеджер комнат — управляет игровой логикой и Socket.io событиями
const roomManager = new RoomManager(io);

// Express middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Middleware проверки авторизации по кукам (для HTML-страниц)
function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login.html');
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return res.redirect('/login.html');
    }
}

// Защищённые HTML-маршруты — стоят ДО express.static
app.get('/create-room.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'create-room.html'));
});
app.get('/connect-to-room.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'connect-to-room.html'));
});
app.get('/profile.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'profile.html'));
});

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// Список комнат для лобби (connect-to-room.html)
app.get('/api/rooms', requireAuth, (req, res) => {
    res.json(roomManager.getRoomList());
});

app.post('/api/rooms/create', requireAuth, (req, res) => {
    const result = roomManager.createRoom(req.body, req.user.userId, req.user.username);
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
});

app.get('/game.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'game.html'));
});

// Статические файлы — стоят ПОСЛЕ защищённых маршрутов
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'menu.html'));
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