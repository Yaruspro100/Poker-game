/**
 * GameLogic.js — основная игровая логика Техасского Холдема.
 *
 * Управляет одной игрой за одним столом:
 *   - Раздача карт
 *   - Блайнды
 *   - Раунды ставок (префлоп, флоп, тёрн, ривер)
 *   - Фолд / Чек / Колл / Рейз / Олл-ин
 *   - Сайд-поты
 *   - Шоудаун и распределение выигрыша
 *
 * Испускает события через callback onEvent(eventName, data),
 * которые RoomManager транслирует через Socket.io.
 */

const { createDeck, shuffle, deal } = require('./deck');
const { evaluateBest } = require('./handEvaluator');
const { calculatePots, distributePots } = require('./potManager');

// Фазы игры
const PHASES = {
    WAITING:  'waiting',   // ждём игроков
    PREFLOP:  'preflop',   // карты розданы, первый раунд ставок
    FLOP:     'flop',      // 3 общие карты
    TURN:     'turn',      // 4-я карта
    RIVER:    'river',     // 5-я карта
    SHOWDOWN: 'showdown',  // вскрытие карт
    ENDED:    'ended',     // раздача окончена
};

// Статусы игрока в текущей раздаче
const PLAYER_STATUS = {
    ACTIVE: 'active',   // в игре, может делать ставки
    FOLDED: 'folded',   // сбросил карты
    ALL_IN: 'allIn',    // пошёл ва-банк
    OUT:    'out',      // нет фишек, не в игре
};

class GameLogic {
    /**
     * @param {Object} config — настройки стола:
     *   { smallBlind, bigBlind, minBuyIn, maxBuyIn, maxPlayers }
     * @param {Function} onEvent — callback(eventName, data) для отправки событий
     */
    constructor(config, onEvent) {
        this.config = config;
        this.onEvent = onEvent || (() => {});

        // Места за столом: массив из maxPlayers слотов (null = пусто)
        this.seats = new Array(config.maxPlayers).fill(null);

        this.phase = PHASES.WAITING;
        this.deck = [];
        this.communityCards = [];    // общие карты на столе

        this.dealerSeat = 0;         // позиция дилера (двигается каждую раздачу)
        this.currentSeat = -1;       // чья сейчас очередь действовать

        // Состояние текущего раунда ставок
        this.currentBet = 0;         // текущая максимальная ставка в этом стрите
        this.streetBets = {};        // { playerId: ставка в этом стрите }
        this.toAct = [];             // очередь игроков, которым нужно действовать
        this.lastRaiseAmount = 0;    // размер последнего повышения (для минимального рейза)
        this.minRaise = 0;           // минимальный рейз

        // Суммарные вклады за всю раздачу (нужно для сайд-потов)
        this.totalContributed = {};  // { playerId: сумма }

        // Кто уже сделал ход на текущей улице (сбрасывается при рейзе)
        this.actedThisStreet = new Set();
    }

    // ============================================================
    //  Управление игроками (сесть / встать)
    // ============================================================

    /**
     * Посадить игрока за стол.
     * @returns {number} номер занятого места или -1 если мест нет
     */
    sitDown(playerId, username, chips) {
        const seatIdx = this.seats.findIndex(s => s === null);
        if (seatIdx === -1) return -1;

        this.seats[seatIdx] = {
            id: playerId,
            username,
            chips,
            holeCards: [],
            status: PLAYER_STATUS.OUT,
            totalContributed: 0,
        };

        this.onEvent('player-joined', { seatIdx, playerId, username, chips });
        return seatIdx;
    }

    /**
     * Убрать игрока со стола.
     */
    standUp(playerId) {
        const idx = this.seats.findIndex(s => s?.id === playerId);
        if (idx === -1) return;
        const player = this.seats[idx];
        this.seats[idx] = null;
        this.onEvent('player-left', { seatIdx: idx, playerId, chips: player.chips });
    }

    getPlayer(playerId) {
        const pid = String(playerId);
        return this.seats.find(s => s?.id != null && String(s.id) === pid) || null;
    }

    getSeatIndex(playerId) {
        const pid = String(playerId);
        return this.seats.findIndex(s => s?.id != null && String(s.id) === pid);
    }

    /** Все занятые места */
    getOccupiedSeats() {
        return this.seats.filter(s => s !== null);
    }

    /** Игроки, участвующие в текущей раздаче (не OUT) */
    getHandPlayers() {
        return this.seats.filter(s => s !== null && s.status !== PLAYER_STATUS.OUT);
    }

    /** Игроки, которые ещё могут делать ставки (не фолд, не олл-ин) */
    getActivePlayers() {
        return this.seats.filter(s => s?.status === PLAYER_STATUS.ACTIVE);
    }

    // ============================================================
    //  Старт новой раздачи
    // ============================================================

    /**
     * Начать новую раздачу. Вызывать после ENDED или в первый раз.
     * Минимум 2 игрока с фишками.
     */
    startHand() {
        const eligible = this.getOccupiedSeats().filter(p => p.chips > 0);
        if (eligible.length < 2) {
            this.onEvent('error', { message: 'Нужно минимум 2 игрока с фишками' });
            return false;
        }

        // Переводим всех в статус ACTIVE (у кого есть фишки) или OUT
        for (const seat of this.seats) {
            if (!seat) continue;
            seat.status = seat.chips > 0 ? PLAYER_STATUS.ACTIVE : PLAYER_STATUS.OUT;
            seat.holeCards = [];
            seat.totalContributed = 0;
        }

        // Сдвигаем дилера на следующего игрока с фишками
        this.dealerSeat = this._nextOccupiedSeat(this.dealerSeat);

        // Перемешиваем и раздаём по 2 карты
        this.deck = shuffle(createDeck());
        this.communityCards = [];
        this.totalContributed = {};

        for (const player of this.getHandPlayers()) {
            player.holeCards = deal(this.deck, 2);
            this.totalContributed[player.id] = 0;
        }

        this.phase = PHASES.PREFLOP;
        this._postBlindsAndStartBetting();

        this.onEvent('hand-started', {
            dealerSeat: this.dealerSeat,
            phase: this.phase,
            players: this._getPublicState(),
        });

        this._emitPlayerHoleCards(); // отправляем каждому его карты приватно
        this._emitTurn();
        return true;
    }

    /**
     * Выставить блайнды и настроить первый раунд ставок.
     */
    _postBlindsAndStartBetting() {
        const sbSeat = this._nextOccupiedSeat(this.dealerSeat);
        const bbSeat = this._nextOccupiedSeat(sbSeat);

        const sb = this.seats[sbSeat];
        const bb = this.seats[bbSeat];

        this.streetBets = {};
        this.currentBet = this.config.bigBlind;
        this.lastRaiseAmount = this.config.bigBlind;
        this.minRaise = this.config.bigBlind * 2;

        // Принудительные ставки
        this._placeForcedBet(sb, this.config.smallBlind);
        this._placeForcedBet(bb, this.config.bigBlind);

        this.onEvent('blinds-posted', {
            sbPlayerId: sb.id,
            bbPlayerId: bb.id,
            smallBlind: this.config.smallBlind,
            bigBlind: this.config.bigBlind,
        });

        this.actedThisStreet = new Set();

        const utgSeat = this._nextOccupiedSeat(bbSeat);
        this.toAct = this._buildActionQueue(utgSeat, null);
    }

    /** Принудительная ставка (блайнд) — может перевести в олл-ин */
    _placeForcedBet(player, amount) {
        const actual = Math.min(amount, player.chips);
        player.chips -= actual;
        this.streetBets[player.id] = (this.streetBets[player.id] || 0) + actual;
        this.totalContributed[player.id] = (this.totalContributed[player.id] || 0) + actual;

        if (player.chips === 0) {
            player.status = PLAYER_STATUS.ALL_IN;
        }
    }

    // ============================================================
    //  Обработка действий игрока
    // ============================================================

    /**
     * Основной метод: обработать действие текущего игрока.
     *
     * @param {string} playerId
     * @param {string} action — 'fold' | 'check' | 'call' | 'raise' | 'allIn'
     * @param {number} amount — для 'raise': итоговый размер ставки (не прибавка!)
     *
     * @returns {{ ok: boolean, error?: string }}
     */
    handleAction(playerId, action, amount = 0) {
        if (this.phase === PHASES.WAITING || this.phase === PHASES.ENDED) {
            return { ok: false, error: 'Игра не идёт' };
        }
        if (String(this.toAct[0]) !== String(playerId)) {
            return { ok: false, error: 'Сейчас не ваш ход' };
        }

        const player = this.getPlayer(playerId);
        if (!player) return { ok: false, error: 'Игрок не найден' };

        const myBet = this.streetBets[playerId] || 0;
        const toCall = this.currentBet - myBet;

        let result;

        switch (action) {
            case 'fold':
                result = this._doFold(player);
                break;
            case 'check':
                result = this._doCheck(player, toCall);
                break;
            case 'call':
                result = this._doCall(player, toCall);
                break;
            case 'raise':
                result = this._doRaise(player, amount, myBet);
                break;
            case 'allIn':
                result = this._doAllIn(player, myBet);
                break;
            default:
                return { ok: false, error: `Неизвестное действие: ${action}` };
        }

        if (!result.ok) return result;

        this.actedThisStreet.add(playerId);

        this.onEvent('player-action', {
            playerId,
            username: player.username,
            action,
            amount: result.amount,
            chips: player.chips,
            pot: this._getTotalPot(),
            players: this._getPublicState(),
        });

        // После рейза очередь уже перестроена — не сдвигаем (иначе пропускается чужой ход)
        if (!result.reopenedBetting) {
            if (this.toAct[0] === playerId) {
                this.toAct.shift();
            } else {
                this.toAct = this.toAct.filter(id => id !== playerId);
            }
        }

        const activePlayers = this.getHandPlayers().filter(
            p => p.status !== PLAYER_STATUS.FOLDED
        );
        if (activePlayers.length === 1) {
            this._endHandWithoutShowdown(activePlayers[0]);
            return { ok: true };
        }

        if (this.toAct.length === 0) {
            if (this._bettingRoundComplete()) {
                this._advancePhase();
            } else {
                this._refillActionQueue();
                if (this.toAct.length === 0) {
                    this._advancePhase();
                } else {
                    this._emitTurn();
                }
            }
        } else {
            this._emitTurn();
        }

        return { ok: true };
    }

    /**
     * Принудительный фолд (выход из-за стола во время раздачи).
     */
    forceFold(playerId) {
        const player = this.getPlayer(playerId);
        if (!player || player.status === PLAYER_STATUS.FOLDED || player.status === PLAYER_STATUS.OUT) {
            return;
        }

        if (this.phase === PHASES.WAITING || this.phase === PHASES.ENDED) {
            return;
        }

        player.status = PLAYER_STATUS.FOLDED;
        this.actedThisStreet.add(playerId);
        this.toAct = this.toAct.filter(id => id !== playerId);

        const activePlayers = this.getHandPlayers().filter(
            p => p.status !== PLAYER_STATUS.FOLDED
        );
        if (activePlayers.length === 1) {
            this._endHandWithoutShowdown(activePlayers[0]);
            return;
        }

        if (this.toAct.length === 0) {
            if (this._bettingRoundComplete()) {
                this._advancePhase();
            } else {
                this._refillActionQueue();
                if (this.toAct.length > 0) this._emitTurn();
            }
        }
    }

    _doFold(player) {
        player.status = PLAYER_STATUS.FOLDED;
        return { ok: true, amount: 0 };
    }

    _doCheck(player, toCall) {
        if (toCall > 0) {
            return { ok: false, error: `Нельзя чекнуть: нужно поставить ${toCall}` };
        }
        return { ok: true, amount: 0 };
    }

    _doCall(player, toCall) {
        // Если не хватает фишек — уходим в олл-ин
        const actual = Math.min(toCall, player.chips);
        player.chips -= actual;
        this.streetBets[player.id] = (this.streetBets[player.id] || 0) + actual;
        this.totalContributed[player.id] = (this.totalContributed[player.id] || 0) + actual;

        if (player.chips === 0) {
            player.status = PLAYER_STATUS.ALL_IN;
        }
        return { ok: true, amount: actual };
    }

    _doRaise(player, totalBetAmount, myBet) {
        // totalBetAmount — итоговая ставка игрока (не прибавка)
        const minTotal = this.currentBet + this.lastRaiseAmount;
        if (totalBetAmount < minTotal) {
            return {
                ok: false,
                error: `Минимальный рейз: ${minTotal} (текущая ставка ${this.currentBet} + рейз ${this.lastRaiseAmount})`,
            };
        }
        if (totalBetAmount > player.chips + myBet) {
            return { ok: false, error: 'Недостаточно фишек' };
        }

        const toAdd = totalBetAmount - myBet;
        player.chips -= toAdd;
        this.streetBets[player.id] = totalBetAmount;
        this.totalContributed[player.id] = (this.totalContributed[player.id] || 0) + toAdd;

        // Запоминаем размер рейза для следующего минимального рейза
        this.lastRaiseAmount = totalBetAmount - this.currentBet;
        this.currentBet = totalBetAmount;

        if (player.chips === 0) {
            player.status = PLAYER_STATUS.ALL_IN;
        }

        this.actedThisStreet.clear();
        this.actedThisStreet.add(player.id);

        const seatIdx = this.getSeatIndex(player.id);
        this.toAct = this._buildActionQueue(
            this._nextOccupiedSeat(seatIdx),
            player.id
        );

        return { ok: true, amount: totalBetAmount, reopenedBetting: true };
    }

    _doAllIn(player, myBet) {
        const allInAmount = player.chips;
        const totalBet = myBet + allInAmount;

        player.chips = 0;
        this.streetBets[player.id] = totalBet;
        this.totalContributed[player.id] = (this.totalContributed[player.id] || 0) + allInAmount;
        player.status = PLAYER_STATUS.ALL_IN;

        if (totalBet > this.currentBet) {
            this.lastRaiseAmount = totalBet - this.currentBet;
            this.currentBet = totalBet;

            this.actedThisStreet.clear();
            this.actedThisStreet.add(player.id);

            const seatIdx = this.getSeatIndex(player.id);
            this.toAct = this._buildActionQueue(
                this._nextOccupiedSeat(seatIdx),
                player.id
            );

            return { ok: true, amount: allInAmount, reopenedBetting: true };
        }

        return { ok: true, amount: allInAmount, reopenedBetting: false };
    }

    // ============================================================
    //  Переход между улицами
    // ============================================================

    _advancePhase() {
        // Если все оставшиеся игроки в олл-ин — открываем карты без ставок
        const canAct = this.getActivePlayers();

        switch (this.phase) {
            case PHASES.PREFLOP:
                this.phase = PHASES.FLOP;
                deal(this.deck, 1);
                this.communityCards.push(...deal(this.deck, 3));
                break;
            case PHASES.FLOP:
                this.phase = PHASES.TURN;
                deal(this.deck, 1); // сжечь карту
                this.communityCards.push(...deal(this.deck, 1));
                break;
            case PHASES.TURN:
                this.phase = PHASES.RIVER;
                deal(this.deck, 1);
                this.communityCards.push(...deal(this.deck, 1));
                break;
            case PHASES.RIVER:
                this._doShowdown();
                return;
        }

        this.onEvent('street-changed', {
            phase: this.phase,
            communityCards: this.communityCards,
        });

        this.streetBets = {};
        this.currentBet = 0;
        this.lastRaiseAmount = this.config.bigBlind;
        this.actedThisStreet = new Set();

        const firstSeat = this._nextOccupiedSeat(this.dealerSeat);
        this.toAct = this._buildActionQueue(firstSeat, null);

        // Если некому ставить (все в олл-ин) — пропускаем стрит
        if (this.toAct.length === 0 || canAct.length < 2) {
            this._advancePhase();
            return;
        }

        this._emitTurn();
    }

    // ============================================================
    //  Шоудаун и раздача выигрыша
    // ============================================================

    _doShowdown() {
        this.phase = PHASES.SHOWDOWN;

        // Оцениваем руки всех не-фолднувших игроков
        const evaluations = this.getHandPlayers()
            .filter(p => p.status !== PLAYER_STATUS.FOLDED)
            .map(p => ({
                playerId: p.id,
                username: p.username,
                hand: evaluateBest(p.holeCards, this.communityCards),
                holeCards: p.holeCards,
            }));

        // Считаем поты (основной + сайд-поты)
        const potPlayers = this.getHandPlayers().map(p => ({
            id: p.id,
            totalContributed: this.totalContributed[p.id] || 0,
            folded: p.status === PLAYER_STATUS.FOLDED,
        }));
        const pots = calculatePots(potPlayers);
        const winnings = distributePots(pots, evaluations);

        const results = [];
        for (const [playerId, amount] of Object.entries(winnings)) {
            const player = this.getPlayer(playerId);
            const winAmount = Number(amount) || 0;
            if (player && winAmount > 0) {
                player.chips += winAmount;
            }
            const eval_ = evaluations.find(e => String(e.playerId) === String(playerId));
            results.push({
                playerId: player?.id ?? playerId,
                username: player?.username ?? eval_?.username,
                amount: winAmount,
                hand: eval_?.hand,
                holeCards: eval_?.holeCards,
            });
        }

        this._clearPotContributions();
        this.phase = PHASES.ENDED;

        this.onEvent('showdown', {
            communityCards: this.communityCards,
            evaluations: evaluations.map(e => ({
                playerId: e.playerId,
                username: e.username,
                holeCards: e.holeCards,
                handName: e.hand.name,
            })),
            pots,
            results,
            players: this._getPublicState(),
        });
    }

    /** Раздача заканчивается без шоудауна — последний оставшийся забирает банк */
    _endHandWithoutShowdown(winner) {
        const totalPot = this._getTotalPot();
        winner.chips += totalPot;
        this._clearPotContributions();

        this.phase = PHASES.ENDED;

        this.onEvent('hand-ended-no-showdown', {
            winnerId: winner.id,
            winnerUsername: winner.username,
            amount: totalPot,
            players: this._getPublicState(),
        });
    }

    // ============================================================
    //  Вспомогательные методы
    // ============================================================

    /** Нужно ли игроку ещё действовать на этой улице */
    _hasPendingAction(player) {
        if (player.status !== PLAYER_STATUS.ACTIVE) return false;
        if ((this.streetBets[player.id] || 0) < this.currentBet) return true;
        return !this.actedThisStreet.has(player.id);
    }

    /** Все активные игроки уравняли ставки и сделали ход */
    _bettingRoundComplete() {
        const active = this.getActivePlayers();
        if (active.length === 0) return true;
        return active.every(p => !this._hasPendingAction(p));
    }

    _refillActionQueue() {
        const firstSeat = this._nextOccupiedSeat(this.dealerSeat);
        this.toAct = this._buildActionQueue(firstSeat, null);
    }

    /**
     * Очередь ходов: игроки, которым нужно уравнять ставку или ответить на рейз.
     */
    _buildActionQueue(startSeat, excludeId = null) {
        const queue = [];
        let seat = startSeat;
        let checked = 0;

        while (checked < this.seats.length) {
            const player = this.seats[seat];
            if (player && player.id !== excludeId && this._hasPendingAction(player)) {
                queue.push(player.id);
            }
            seat = (seat + 1) % this.seats.length;
            checked++;
        }

        return queue;
    }

    /** Следующее занятое место с фишками (по кругу) */
    _nextOccupiedSeat(fromSeat) {
        let seat = (fromSeat + 1) % this.seats.length;
        for (let i = 0; i < this.seats.length; i++) {
            if (this.seats[seat] && this.seats[seat].chips > 0) return seat;
            seat = (seat + 1) % this.seats.length;
        }
        return fromSeat;
    }

    /** Сумма всех ставок в текущей раздаче (включая предыдущие стриты) */
    _getTotalPot() {
        return Object.values(this.totalContributed).reduce((a, b) => a + b, 0);
    }

    /** Обнуляем вклады в банк после завершения раздачи */
    _clearPotContributions() {
        this.streetBets = {};
        for (const seat of this.seats) {
            if (seat) this.totalContributed[seat.id] = 0;
        }
    }

    /** Публичное состояние (без карт других игроков) */
    _getPublicState() {
        return this.seats.map((s, idx) => {
            if (!s) return null;
            return {
                seatIdx: idx,
                id: s.id,
                username: s.username,
                chips: s.chips,
                status: s.status,
                bet: this.streetBets[s.id] || 0,
                totalContributed: this.totalContributed[s.id] || 0,
                // карты не раскрываем
            };
        });
    }

    /**
     * Возвращает состояние игры с точки зрения конкретного игрока:
     * его карты открыты, чужие — нет.
     */
    getStateForPlayer(playerId) {
        return {
            phase: this.phase,
            communityCards: this.communityCards,
            pot: this._getTotalPot(),
            currentBet: this.currentBet,
            currentTurn: this.toAct[0] || null,
            dealerSeat: this.dealerSeat,
            players: this.seats.map((s, idx) => {
                if (!s) return null;
                return {
                    seatIdx: idx,
                    id: s.id,
                    username: s.username,
                    chips: s.chips,
                    status: s.status,
                    bet: this.streetBets[s.id] || 0,
                    // Карты: своих показываем, чужих — нет
                    holeCards: s.id === playerId ? s.holeCards : s.holeCards.map(() => ({ hidden: true })),
                };
            }),
        };
    }

    /** Отправляем каждому игроку его карты приватно */
    _emitPlayerHoleCards() {
        for (const player of this.getHandPlayers()) {
            this.onEvent('deal-hole-cards', {
                targetPlayerId: player.id, // RoomManager отправит только этому игроку
                holeCards: player.holeCards,
            });
        }
    }

    /** Оповещаем всех, чья очередь ходить */
    _emitTurn() {
        const currentPlayerId = this.toAct[0];
        if (!currentPlayerId) return;

        const player = this.getPlayer(currentPlayerId);
        const myBet = this.streetBets[currentPlayerId] || 0;
        const toCall = Math.max(0, this.currentBet - myBet);

        // Доступные действия
        const canCheck = toCall === 0;
        const canCall  = toCall > 0 && player.chips > toCall;
        const canRaise = player.chips > toCall;
        const minRaise = this.currentBet + this.lastRaiseAmount;

        this.onEvent('player-turn', {
            playerId: currentPlayerId,
            username: player?.username,
            toCall,
            canCheck,
            canCall,
            canRaise,
            minRaise,
            maxRaise: (player?.chips || 0) + myBet,
            pot: this._getTotalPot(),
            phase: this.phase,
            players: this._getPublicState(),
        });
    }
}

module.exports = GameLogic;