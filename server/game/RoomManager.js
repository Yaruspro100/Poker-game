/**
 * RoomManager.js — менеджер покерных комнат.
 */

const GameLogic = require('./gameLogic');
const chipWallet = require('./chipWallet');
const { saveGameState, loadGameState, deleteGameState } = require('./gameState');

const RESULT_BEFORE_READY_MS = 12000;

// Время ожидания переподключения игрока (мс).
// Если игрок не вернётся за это время — убираем со стола.
const RECONNECT_GRACE_MS = 15000;

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this._registerSocketEvents();
        this._restoreActiveRooms();
    }

    async _restoreActiveRooms() {
        const pool = require('../config/db');
        try {
            const result = await pool.query('SELECT room_id FROM game_states WHERE phase != $1', ['ended']);
            for (const row of result.rows) {
                await this.restoreRoom(row.room_id);
            }
            console.log(`Восстановлено ${result.rows.length} активных комнат`);
        } catch (err) {
            console.error('Ошибка восстановления комнат:', err);
        }
    }

    _registerSocketEvents() {
        this.io.on('connection', (socket) => {
            const playerId = socket.user.userId;
            const username = socket.user.username;

            console.log(`Socket подключился: ${username} (${socket.id})`);

            socket.on('create-room', (data, callback) => {
                const result = this.createRoom(data, playerId, username);
                callback?.(result);
            });

            socket.on('join-room', async (data, callback) => {
                const result = await this.joinRoom(socket, data, playerId, username);
                callback?.(result);
            });

            socket.on('leave-room', async (data, callback) => {
                const result = await this.leaveRoom(socket, data?.roomId, playerId, { force: true });
                callback?.(result);
            });

            socket.on('player-action', (data, callback) => {
                const result = this.handlePlayerAction(data, playerId);
                callback?.(result);
            });

            socket.on('get-game-state', (data, callback) => {
                const result = this.getGameState(data?.roomId, playerId);
                callback?.(result);
            });

            socket.on('ready', (data) => {
                this.playerReady(data?.roomId, playerId);
            });

            socket.on('disconnect', async () => {
                console.log(`Socket отключился: ${username} (${socket.id})`);
                await this._handleDisconnect(socket, playerId, username);
            });
        });
    }

    createRoom(data, creatorId, creatorUsername) {
        const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const config = {
            roomName: data.roomName || 'Покерный стол',
            smallBlind: Number(data.smallBlind) || 5,
            bigBlind: Number(data.bigBlind) || 10,
            minBuyIn: Number(data.minBuyIn) || 100,
            maxBuyIn: Number(data.maxBuyIn) || 3000,
            maxPlayers: Math.min(9, Math.max(2, Number(data.maxPlayers) || 9)),
            password: data.password || null,
        };

        const game = new GameLogic(config, (eventName, eventData) => {
            this._handleGameEvent(roomId, eventName, eventData);
        });

        this.rooms.set(roomId, {
            game,
            config,
            players: new Map(),        // socketId → playerId
            readyPlayers: new Set(),
            autoStartTimer: null,
            disconnectTimers: new Map(), // playerId → таймер удаления со стола
        });

        console.log(`Комната создана: ${roomId} (${config.roomName})`);
        return { ok: true, roomId, config };
    }

    async joinRoom(socket, data, playerId, username) {
        const { roomId, buyIn, password } = data;
        const room = this.rooms.get(roomId);

        if (!room) return { ok: false, error: 'Комната не найдена' };
        if (room.config.password && room.config.password !== password) {
            return { ok: false, error: 'Неверный пароль' };
        }

        // Отменяем таймер удаления — игрок переподключился вовремя
        if (room.disconnectTimers.has(playerId)) {
            clearTimeout(room.disconnectTimers.get(playerId));
            room.disconnectTimers.delete(playerId);
            console.log(`Игрок ${username} переподключился вовремя, таймер отменён`);
        }

        // Повторное подключение — игрок уже за столом
        const existing = room.game.getPlayer(playerId);
        if (existing) {
            socket.join(roomId);
            room.players.set(socket.id, playerId);
            this._emitGameState(socket, room, playerId);
            const accountChips = await chipWallet.getBalance(playerId);

            if (room.game.toAct[0] 
            && String(room.game.toAct[0]) === String(playerId)
            && !['waiting', 'ended'].includes(room.game.phase)) {
                room.game._emitTurn();
            }

            // Сообщаем всем что игрок вернулся
            socket.to(roomId).emit('player-reconnected', { playerId, username });

            return {
                ok: true,
                seatIdx: room.game.getSeatIndex(playerId),
                accountChips,
                roomInfo: this._roomInfo(room),
                reconnected: true,
            };
        }

        // Первый вход — списываем бай-ин
        const actualBuyIn = Number(buyIn);
        if (actualBuyIn < room.config.minBuyIn || actualBuyIn > room.config.maxBuyIn) {
            return { ok: false, error: `Бай-ин должен быть от ${room.config.minBuyIn} до ${room.config.maxBuyIn}` };
        }

        const deduct = await chipWallet.deductChips(playerId, actualBuyIn);
        if (!deduct.ok) {
            return { ok: false, error: deduct.error, accountChips: deduct.chips };
        }

        const seatIdx = room.game.sitDown(playerId, username, actualBuyIn);
        if (seatIdx === -1) {
            await chipWallet.addChips(playerId, actualBuyIn);
            const accountChips = await chipWallet.getBalance(playerId);
            return { ok: false, error: 'Нет свободных мест', accountChips };
        }

        socket.join(roomId);
        room.players.set(socket.id, playerId);

        const inHand = !['waiting', 'ended'].includes(room.game.phase);

        this._broadcastGameState(roomId);

        socket.to(roomId).emit('player-joined-room', {
            playerId, username, seatIdx, chips: actualBuyIn,
        });

        if (inHand) {
            socket.emit('waiting-next-hand', {
                message: 'Раздача уже идёт. Вы подключитесь к следующей после её окончания.',
            });
        } else {
            this._promptReady(roomId);
        }

        return {
            ok: true,
            seatIdx,
            accountChips: deduct.chips,
            roomInfo: this._roomInfo(room),
            handInProgress: inHand,
        };
    }

    async leaveRoom(socket, roomId, playerId, { force = false } = {}) {
        const room = this.rooms.get(roomId);
        if (!room) return { ok: false, error: 'Комната не найдена' };

        // Отменяем таймер если был
        if (room.disconnectTimers.has(playerId)) {
            clearTimeout(room.disconnectTimers.get(playerId));
            room.disconnectTimers.delete(playerId);
        }

        room.players.delete(socket.id);
        socket.leave(roomId);

        if (!force) {
            const hasOtherSocket = [...room.players.values()].some(pid => pid === playerId);
            if (hasOtherSocket) return { ok: true };
        }

        let seated = room.game.getPlayer(playerId);
        if (!seated) {
            return { ok: true, accountChips: await chipWallet.getBalance(playerId) };
        }

        const inHand = !['waiting', 'ended'].includes(room.game.phase);
        if (inHand && force) {
            room.game.forceFold(playerId);
            seated = room.game.getPlayer(playerId);
            if (!seated) {
                return { ok: true, accountChips: await chipWallet.getBalance(playerId) };
            }
        }

        const tableChips = seated.chips;
        room.readyPlayers.delete(playerId);
        room.game.standUp(playerId);

        const cashOut = await chipWallet.addChips(playerId, tableChips);
        socket.emit('account-chips', { chips: cashOut.chips });

        this.io.to(roomId).emit('player-left-room', { playerId });
        this._promptReady(roomId);

        if (room.players.size === 0) {
            clearTimeout(room.autoStartTimer);
            this.rooms.delete(roomId);
            await deleteGameState(roomId);
            console.log(`Комната удалена: ${roomId}`);
        }

        return { ok: true, accountChips: cashOut.chips, cashedOut: tableChips };
    }

    handlePlayerAction(data, playerId) {
        const { roomId, action, amount } = data;
        const room = this.rooms.get(roomId);
        if (!room) return { ok: false, error: 'Комната не найдена' };
        return room.game.handleAction(playerId, action, Number(amount) || 0);
    }

    getGameState(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) return { ok: false, error: 'Комната не найдена' };
        return {
            ok: true,
            state: { ...room.game.getStateForPlayer(playerId), roomInfo: this._roomInfo(room) },
        };
    }

    playerReady(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        if (!['waiting', 'ended'].includes(room.game.phase)) return;

        const player = room.game.getPlayer(playerId);
        if (!player || player.chips <= 0) return;

        room.readyPlayers.add(playerId);

        const eligible = room.game.getOccupiedSeats().filter(p => p.chips > 0);
        const allCount = eligible.length;
        const readyCount = [...room.readyPlayers].filter(id =>
            eligible.some(p => p.id === id)
        ).length;

        this.io.to(roomId).emit('player-ready', { playerId, readyCount, allCount });

        if (readyCount >= allCount && allCount >= 2) {
            this._startHand(roomId);
        }
    }

    _handleGameEvent(roomId, eventName, eventData) {
        if (eventName === 'deal-hole-cards') {
            const { targetPlayerId, holeCards } = eventData;
            const socketId = this._getSocketId(roomId, targetPlayerId);
            if (socketId) {
                this.io.to(socketId).emit('hole-cards', { holeCards });
            }
            return;
        }

        this.io.to(roomId).emit(eventName, eventData);

        if (eventName === 'player-joined' || eventName === 'player-left') {
            this._broadcastGameState(roomId);
        }

        if (eventName === 'showdown' || eventName === 'hand-ended-no-showdown') {
            const room = this.rooms.get(roomId);
            if (!room) return;
            clearTimeout(room.autoStartTimer);
            room.autoStartTimer = setTimeout(() => {
                this._promptReady(roomId);
            }, RESULT_BEFORE_READY_MS);
        }

        // Автосохранение после каждого события
        this._saveRoomState(roomId);
    }

    _promptReady(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        clearTimeout(room.autoStartTimer);
        room.readyPlayers.clear();

        const eligible = room.game.getOccupiedSeats().filter(p => p.chips > 0);

        if (eligible.length < 2) {
            this.io.to(roomId).emit('waiting-for-players', {
                message: 'Ждём минимум 2 игроков с фишками...',
            });
            return;
        }

        if (!['waiting', 'ended'].includes(room.game.phase)) return;

        this.io.to(roomId).emit('awaiting-ready', {
            readyCount: 0,
            allCount: eligible.length,
        });
    }

    _startHand(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        const readyIds = [...room.readyPlayers];
        room.readyPlayers.clear();
        const started = room.game.startHand(readyIds);
        if (!started) {
            this.io.to(roomId).emit('waiting-for-players', {
                message: 'Ждём минимум 2 игроков с фишками...',
            });
        }
    }

    /**
     * При дисконнекте даём игроку RECONNECT_GRACE_MS миллисекунд
     * на переподключение. Если не вернулся — убираем со стола.
     */
    async _handleDisconnect(socket, playerId, username) {
        for (const [roomId, room] of this.rooms.entries()) {
            if (!room.players.has(socket.id)) continue;

            // Убираем сокет из маппинга, но игрока из игры НЕ трогаем
            room.players.delete(socket.id);

            // Уведомляем остальных о временном дисконнекте
            this.io.to(roomId).emit('player-temporarily-disconnected', {
                playerId,
                username,
                reconnectMs: RECONNECT_GRACE_MS,
            });

            console.log(`${username} отключился, ждём ${RECONNECT_GRACE_MS / 1000}с...`);

            // Запускаем таймер — если не вернётся, убираем со стола
            const timer = setTimeout(async () => {
                room.disconnectTimers.delete(playerId);
                console.log(`${username} не переподключился, убираем со стола`);

                // Создаём фиктивный сокет для leaveRoom (игрок уже отключён)
                const ghostSocket = {
                    id: `ghost_${playerId}`,
                    emit: () => {},
                    leave: () => {},
                };

                await this.leaveRoom(ghostSocket, roomId, playerId, { force: true });
            }, RECONNECT_GRACE_MS);

            room.disconnectTimers.set(playerId, timer);
        }
    }

    _roomInfo(room) {
        return {
            roomName: room.config.roomName,
            smallBlind: room.config.smallBlind,
            bigBlind: room.config.bigBlind,
        };
    }

    _emitGameState(socket, room, playerId) {
        const state = room.game.getStateForPlayer(playerId);
        socket.emit('game-state', { ...state, roomInfo: this._roomInfo(room) });
    }

    _broadcastGameState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        for (const [socketId, pid] of room.players.entries()) {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) this._emitGameState(socket, room, pid);
        }
    }

    _getSocketId(roomId, playerId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        for (const [socketId, pid] of room.players.entries()) {
            if (pid === playerId) return socketId;
        }
        return null;
    }

    getRoomList() {
        const list = [];
        for (const [roomId, room] of this.rooms.entries()) {
            const players = room.game.getOccupiedSeats();
            list.push({
                roomId,
                roomName: room.config.roomName,
                playerCount: players.length,
                seats: room.game.seats.map(s => (s ? { username: s.username } : null)),
                maxPlayers: room.config.maxPlayers,
                smallBlind: room.config.smallBlind,
                bigBlind: room.config.bigBlind,
                minBuyIn: room.config.minBuyIn,
                maxBuyIn: room.config.maxBuyIn,
                hasPassword: !!room.config.password,
                phase: room.game.phase,
            });
        }
        return list;
    }

    async _saveRoomState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        try {
            await saveGameState(roomId, {
                config: room.config,
                seats: room.game.seats,
                phase: room.game.phase,
                communityCards: room.game.communityCards,
                dealerSeat: room.game.dealerSeat,
                currentSeat: room.game.currentSeat,
                currentBet: room.game.currentBet,
                streetBets: room.game.streetBets,
                totalContributed: room.game.totalContributed,
                deck: room.game.deck,
                toAct: room.game.toAct,
                lastRaiseAmount: room.game.lastRaiseAmount,
                actedThisStreet: [...room.game.actedThisStreet]
            });
        } catch (err) {
            console.error(`Ошибка сохранения состояния комнаты ${roomId}:`, err);
        }
    }

    async restoreRoom(roomId) {
        const state = await loadGameState(roomId);
        if (!state) return null;

        const game = new GameLogic(state.config, (eventName, eventData) => {
            this._handleGameEvent(roomId, eventName, eventData);
        });

        game.seats = state.seats;
        game.phase = state.phase;
        game.communityCards = state.communityCards;
        game.dealerSeat = state.dealerSeat;
        game.currentSeat = state.currentSeat;
        game.currentBet = state.currentBet;
        game.streetBets = state.streetBets;
        game.totalContributed = state.totalContributed;
        game.deck = state.deck;
        game.toAct = state.toAct;
        game.lastRaiseAmount = state.lastRaiseAmount || state.config.bigBlind;
        game.actedThisStreet = new Set(state.actedThisStreet || []);

        this.rooms.set(roomId, {
            game,
            config: state.config,
            players: new Map(),
            readyPlayers: new Set(),
            autoStartTimer: null,
            disconnectTimers: new Map(),
        });

        // Если игра в активной фазе и есть очередь ходов — отправляем событие о текущем ходе
        if (game.toAct.length > 0 && !['waiting', 'ended'].includes(game.phase)) {
            game._emitTurn();
        }

        console.log(`Комната восстановлена: ${roomId}`);
        return { ok: true, roomId };
    }
}

module.exports = RoomManager;