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

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { socketAuth } = require('./middleware/jwtMiddleware');
const RoomManager = require('./game/roomManager');

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
    if (!token) return res.redirect('/login');
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return res.redirect('/login');
    }
}

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// Список комнат для лобби
app.get('/api/rooms', requireAuth, (req, res) => {
    res.json(roomManager.getRoomList());
});

app.post('/api/rooms/create', requireAuth, (req, res) => {
    const result = roomManager.createRoom(req.body, req.user.userId, req.user.username);
    if (!result.ok) return res.status(400).json(result);
    res.status(201).json(result);
});

// Защищённые HTML-маршруты — стоят ДО express.static
app.get('/create-room', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'create-room.html'));
});
app.get('/connect-to-room', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'connect-to-room.html'));
});
app.get('/profile', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'profile.html'));
});
app.get('/game', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'game.html'));
});

// Блокируем прямой доступ к защищённым .html файлам
const protectedFiles = ['create-room.html', 'connect-to-room.html', 'profile.html', 'game.html'];
app.use((req, res, next) => {
    const file = req.path.replace(/^\/\//, '');
    if (protectedFiles.includes(file)) {
        // Проверяем токен — если есть, пропускаем; если нет, редиректим
        const token = req.cookies.token;
        if (!token) return res.redirect('/login');
        try {
            jwt.verify(token, process.env.JWT_SECRET);
            return next();  // Авторизован — пусть скачивает .html
        } catch {
            res.clearCookie('token');
            return res.redirect('/login');
        }
    }
    next();
});

// Статические файлы — стоят ПОСЛЕ защищённых маршрутов
app.use(express.static(path.join(__dirname, '..', 'client')));

// Публичные HTML-маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'menu.html'));
});
app.get('/menu', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'menu.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'login.html'));
});
app.get('/registration', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'registration.html'));
});
app.get('/how-to-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'how-to-play.html'));
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