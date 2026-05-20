/**
 * game.js — клиентская логика покерного стола.
 * Подключается к серверу через Socket.io и управляет UI:
 *   - Отрисовка мест игроков
 *   - Общие карты и банк
 *   - Кнопки действий (fold/check/call/raise/allIn)
 *   - Оверлеи результата
 *   - Лог событий
 */

//  Константы и состояние

// Русские названия фаз для отображения
const PHASE_NAMES = {
    waiting:  'Ожидание',
    preflop:  'Префлоп',
    flop:     'Флоп',
    turn:     'Тёрн',
    river:    'Ривер',
    showdown: 'Шоудаун',
    ended:    'Раздача окончена',
};

// Масти — красные и чёрные для цвета карт
const RED_SUITS = ['♥', '♦'];

// Состояние игры на клиенте
let state = {
    myPlayerId: null,
    myUsername: null,
    roomId: null,
    raiseMin: 0,
    raiseMax: 0,
    bigBlind: 10,
    canAct: false,
    pot: 0,
    isReady: false,
    myTableChips: 0,
};

//  Получаем параметры из URL: ?roomId=xxx

const urlParams = new URLSearchParams(window.location.search);
state.roomId = urlParams.get('roomId');

if (!state.roomId) {
    alert('Комната не указана');
    window.location.href = '/connect-to-room.html';
}

//  Socket.io подключение

const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
state.myPlayerId = currentUser.id;
state.myUsername = currentUser.username;

if (!token) {
    window.location.href = '/login.html';
}

const socket = io({
    auth: { token },
});

socket.on('connect', () => {
    addLog('Подключено к серверу', 'system');

    // Берём параметры входа сохранённые в лобби/при создании комнаты
    const joiningData = JSON.parse(localStorage.getItem('joiningRoom') || '{}');

    socket.emit('join-room', {
        roomId:   state.roomId,
        buyIn:    joiningData.buyIn    || 1000,
        password: joiningData.password || null,
    }, (res) => {
        if (!res?.ok) {
            addLog(`Ошибка входа в комнату: ${res?.error || 'неизвестная ошибка'}`, 'system');
            if (res?.accountChips != null) syncAccountChips(res.accountChips);
            return;
        }

        if (res.accountChips != null) syncAccountChips(res.accountChips);
        if (res.roomInfo) updateRoomHeader(res.roomInfo);
        if (!res.reconnected && joiningData.buyIn) {
            state.myTableChips = joiningData.buyIn;
        }

        localStorage.removeItem('joiningRoom');
        const joinMsg = res.reconnected
            ? `Повторное подключение к столу (место ${res.seatIdx + 1})`
            : `Вы за столом (место ${res.seatIdx + 1}), бай-ин списан со счёта`;
        addLog(joinMsg, 'system');

        // Получаем актуальное состояние игры
        socket.emit('get-game-state', { roomId: state.roomId }, (stateRes) => {
            if (stateRes?.ok) renderGameState(stateRes.state);
        });
    });
});

socket.on('connect_error', (err) => {
    addLog(`Ошибка подключения: ${err.message}`, 'system');
});

socket.on('disconnect', () => {
    addLog('Соединение разорвано', 'system');
    disableAllActions();
});

socket.on('account-chips', ({ chips }) => {
    syncAccountChips(chips);
});

//  Игровые события от сервера

// Полное состояние игры (при подключении / переподключении)
socket.on('game-state', (gameState) => {
    renderGameState(gameState);
});

// Карманные карты — только для конкретного игрока
socket.on('hole-cards', ({ holeCards }) => {
    renderHoleCards(holeCards);
});

// Новая раздача началась
socket.on('hand-started', ({ dealerSeat, phase, players }) => {
    syncMyTableChipsFromPlayers(players);
    clearCommunityCards();
    clearSidePots();
    document.getElementById('hole-card-0').className = 'hole-card';
    document.getElementById('hole-card-1').className = 'hole-card';
    document.getElementById('hole-card-0').innerHTML = '';
    document.getElementById('hole-card-1').innerHTML = '';
    document.getElementById('hand-name').textContent = '';
    updatePhase(phase);
    renderPlayers(players);
    addLog('Новая раздача начата', 'system');
    hideOverlay('overlay-result');
    hideOverlay('overlay-waiting');
    hideOverlay('overlay-ready');
    resetReadyButton();
});

// Блайнды
socket.on('blinds-posted', ({ sbPlayerId, bbPlayerId, smallBlind, bigBlind }) => {
    state.bigBlind = bigBlind;
    addLog(`Блайнды: SB ${smallBlind} / BB ${bigBlind} 🪙`, 'system');
});

// Смена улицы (флоп / тёрн / ривер)
socket.on('street-changed', ({ phase, communityCards }) => {
    updatePhase(phase);
    renderCommunityCards(communityCards);
    addLog(`Улица: ${PHASE_NAMES[phase] || phase}`, 'system');
    disableAllActions();
    document.getElementById('action-prompt').textContent = 'Ожидайте своего хода...';
    document.getElementById('to-call-display').textContent = '';
});

// Ход игрока — обновляем кнопки действий
socket.on('player-turn', (data) => {
    updatePot(data.pot);
    if (data.players) {
        renderPlayers(data.players);
        syncMyTableChipsFromPlayers(data.players);
    }
    renderTurnUI(data);
});

// Действие игрока
socket.on('player-action', ({ playerId, username, action, amount, chips, pot, players }) => {
    updatePot(pot);
    if (players) {
        renderPlayers(players);
        syncMyTableChipsFromPlayers(players);
    } else if (String(playerId) === String(state.myPlayerId) && chips != null) {
        state.myTableChips = chips;
    }
    const actionLabels = {
        fold:  'сбрасывает',
        check: 'чекает',
        call:  `коллирует ${amount} 🪙`,
        raise: `рейзит до ${amount} 🪙`,
        allIn: `идёт ва-банк (${amount} 🪙)`,
    };
    addLog(`${username} ${actionLabels[action] || action}`, 'action');
});

// Игрок присоединился
socket.on('player-joined', ({ seatIdx, username, chips }) => {
    addLog(`${username} сел за стол (место ${seatIdx + 1})`, 'system');
});

// Игрок ушёл
socket.on('player-left', ({ seatIdx, playerId }) => {
    renderEmptySeat(seatIdx);
    addLog(`Игрок покинул стол`, 'system');
});

socket.on('player-temporarily-disconnected', ({ username }) => {
  addLog(`${username} отключился, ожидаем переподключения...`, 'system');
});

// Игрок переподключился
socket.on('player-reconnected', ({ username }) => {
  addLog(`${username} переподключился`, 'system');
});

// Ожидание игроков
socket.on('waiting-for-players', ({ message }) => {
    showOverlay('overlay-waiting');
    hideOverlay('overlay-ready');
    addLog(message, 'system');
});

socket.on('awaiting-ready', ({ readyCount, allCount }) => {
    resetReadyButton();
    updateReadyUI(readyCount, allCount);
    hideOverlay('overlay-waiting');
    // Результат раздачи (overlay-result) остаётся видимым под оверлеем готовности
    showOverlay('overlay-ready');
});

socket.on('player-ready', ({ playerId, readyCount, allCount }) => {
    updateReadyUI(readyCount, allCount);
    if (String(playerId) === String(state.myPlayerId)) {
        state.isReady = true;
        const btn = document.getElementById('btn-ready');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Вы готовы';
        }
    }
    if (readyCount >= allCount && allCount >= 2) {
        hideOverlay('overlay-ready');
    }
});

// Раздача завершена без шоудауна
socket.on('hand-ended-no-showdown', ({ winnerId, winnerUsername, amount, players }) => {
    renderPlayers(players);
    syncMyTableChipsFromPlayers(players);
    updatePot(0);
    clearSidePots();
    showResult([{
        username: winnerUsername,
        amount,
        handName: null,
        isWinner: true,
    }], false);
    addLog(`${winnerUsername} выигрывает ${amount} 🪙 (все сбросили)`, 'win');
    disableAllActions();
});

// Шоудаун
socket.on('showdown', ({ evaluations, pots, results, communityCards, players }) => {
    renderCommunityCards(communityCards);
    updatePot(0);
    clearSidePots();
    if (players) syncMyTableChipsFromPlayers(players);

    // Показываем карты всех игроков
    for (const ev of evaluations) {
        const seat = findSeatByPlayerId(ev.playerId);
        if (seat !== null) {
            renderSeatShowdownCards(seat, ev.holeCards);
        }
    }

    // Формируем данные для оверлея
    const resultItems = results.map(r => ({
        username: r.username,
        amount: r.amount,
        handName: r.hand?.name,
        isWinner: r.amount > 0,
    }));
    showResult(resultItems, true);

    for (const r of results) {
        if (r.amount > 0) {
            addLog(`${r.username} выигрывает ${r.amount} 🪙 (${r.hand?.name || '—'})`, 'win');
        }
    }

    disableAllActions();
});

//  Отрисовка состояния

/**
 * Полная перерисовка из game-state объекта.
 */
/**
Полная перерисовка из game-state объекта.
*/
function renderGameState(gs) {
  if (!gs) return;
  
  if (gs.roomInfo) updateRoomHeader(gs.roomInfo);
  updatePhase(gs.phase);
  updatePot(gs.pot);

  //  Скрываем оверлеи ожидания/готовности, если игра уже активна
  const activePhases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  if (activePhases.includes(gs.phase)) {
    hideOverlay('overlay-waiting');
    hideOverlay('overlay-ready');
  } else if (gs.phase === 'ended') {
    hideOverlay('overlay-waiting');
  }

  if (gs.communityCards?.length) {
    renderCommunityCards(gs.communityCards);
  }
  if (gs.players) {
    renderPlayers(gs.players);
    syncMyTableChipsFromPlayers(gs.players);
  }
  // Обновляем мои карты если они уже пришли
  const myPlayerData = gs.players?.find(p => p?.id === state.myPlayerId);
  if (myPlayerData?.holeCards?.length && !myPlayerData.holeCards[0].hidden) {
    renderHoleCards(myPlayerData.holeCards);
  }
}

/**
 * Отрисовывает все места игроков.
 */
function renderPlayers(players) {
    for (let i = 0; i < 9; i++) {
        const player = players?.[i];
        if (player && player.id) {
            renderOccupiedSeat(i, player);
        } else {
            renderEmptySeat(i);
        }
    }
}

/**
 * Отрисовывает занятое место.
 */
function renderOccupiedSeat(seatIdx, player) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;

    const isMe = String(player.id) === String(state.myPlayerId);
    el.dataset.playerId = player.id;
    const isDealer = false; // дилер придёт из hand-started
    const isFolded = player.status === 'folded';
    const isAllIn = player.status === 'allIn';
    const bet = player.bet || 0;

    let classes = 'seat-inner';
    if (isFolded) classes += ' folded';
    if (isAllIn) classes += ' all-in';

    el.innerHTML = `
        <div class="${classes}">
            <div class="seat-username" title="${player.username}">
                ${isMe ? '★ ' : ''}${player.username}
            </div>
            <div class="seat-chips">${player.chips} 🪙</div>
            <div class="seat-bet">${bet > 0 ? `Ставка: ${bet}` : ''}</div>
            ${isFolded ? '<div style="font-size:0.6rem;color:#9ca3af">сброс</div>' : ''}
            ${isAllIn ? '<div style="font-size:0.6rem;color:#f59e0b">ВА-БАНК</div>' : ''}
            ${player.holeCards?.length > 0 && !player.holeCards[0].hidden
                ? '' // карты покажем отдельно
                : player.status !== 'folded' && player.status !== 'out'
                    ? '<div class="seat-cards"><div class="seat-card-back"></div><div class="seat-card-back"></div></div>'
                    : ''
            }
        </div>
    `;
}

/**
 * Очищает место.
 */
function renderEmptySeat(seatIdx) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;
    delete el.dataset.playerId;
    el.innerHTML = `<div class="seat-inner empty">Свободно</div>`;
}

/**
 * Ищет индекс места по playerId.
 */
function findSeatByPlayerId(playerId) {
    for (let i = 0; i < 9; i++) {
        const el = document.getElementById(`seat-${i}`);
        if (el?.dataset.playerId === String(playerId)) return i;
    }
    return null;
}

/**
 * Показывает карты в месте на шоудауне.
 */
function renderSeatShowdownCards(seatIdx, holeCards) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;
    const cardsEl = el.querySelector('.seat-cards');
    if (cardsEl && holeCards?.length >= 2) {
        cardsEl.innerHTML = holeCards.map(c => `
            <div class="seat-card-face ${RED_SUITS.includes(c.display?.slice(-1)) ? 'red' : 'black'}">
                ${c.display || '?'}
            </div>
        `).join('');
    }
}

//  Карты

/**
 * Рисует карманные карты текущего игрока.
 */
function renderHoleCards(cards) {
    for (let i = 0; i < 2; i++) {
        const el = document.getElementById(`hole-card-${i}`);
        if (!el || !cards[i]) continue;
        const card = cards[i];
        const suit = card.display?.slice(-1) || '';
        const rank = card.display?.slice(0, -1) || '';
        const isRed = RED_SUITS.includes(suit);

        el.className = `hole-card filled ${isRed ? 'red' : 'black'}`;
        el.innerHTML = `
            <div class="card-rank">${rank}</div>
            <div class="card-suit">${suit}</div>
        `;
    }
}

/**
 * Рисует общие карты на столе.
 */
function renderCommunityCards(cards) {
    for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`comm-${i}`);
        if (!el) continue;

        if (cards[i]) {
            const card = cards[i];
            const suit = card.display?.slice(-1) || '';
            const rank = card.display?.slice(0, -1) || '';
            const isRed = RED_SUITS.includes(suit);

            el.className = `card-slot card ${isRed ? 'red' : 'black'}`;
            el.innerHTML = `
                <div class="card-rank">${rank}</div>
                <div class="card-suit">${suit}</div>
            `;
        } else {
            el.className = 'card-slot';
            el.innerHTML = '';
        }
    }
}

function clearCommunityCards() {
    for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`comm-${i}`);
        if (el) { el.className = 'card-slot'; el.innerHTML = ''; }
    }
}

//  Банк и фаза

function updatePot(amount) {
    state.pot = amount || 0;
    document.getElementById('pot-amount').textContent = `${state.pot} 🪙`;
}

function updatePhase(phase) {
    const el = document.getElementById('phase-badge');
    if (el) el.textContent = PHASE_NAMES[phase] || phase;
}

function clearSidePots() {
    document.getElementById('side-pots').innerHTML = '';
}

function renderSidePots(pots) {
    const el = document.getElementById('side-pots');
    if (!el || pots.length <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = pots.map((p, i) =>
        `<span class="side-pot-item">${i === 0 ? 'Основной' : `Сайд-пот ${i}`}: ${p.amount} 🪙</span>`
    ).join('');
}

//  UI хода: кнопки действий

/**
 * Обновляет UI когда наступает ход текущего игрока.
 */
function renderTurnUI(data) {
    const isMyTurn = Number(data.playerId) === Number(state.myPlayerId);

    // Подсвечиваем место чья очередь
    for (let i = 0; i < 9; i++) {
        const inner = document.querySelector(`#seat-${i} .seat-inner`);
        if (inner) inner.classList.remove('active-turn');
    }

    // Находим место игрока чья очередь
    const allSeats = document.querySelectorAll('.seat-inner .seat-username');
    allSeats.forEach(el => {
        if (el.title === data.playerId || el.textContent.trim().includes(data.username)) {
            el.closest('.seat-inner')?.classList.add('active-turn');
        }
    });

    if (!isMyTurn) {
        document.getElementById('action-prompt').textContent =
            `Ход игрока: ${data.username}`;
        document.getElementById('to-call-display').textContent = '';
        disableAllActions();
        return;
    }

    // Мой ход
    state.canAct = true;
    state.raiseMin = data.minRaise;
    state.raiseMax = data.maxRaise;

    document.getElementById('action-prompt').textContent = 'Ваш ход!';
    document.getElementById('to-call-display').textContent =
        data.toCall > 0 ? `Для колла: ${data.toCall} 🪙` : '';

    // Включаем/выключаем кнопки
    setBtn('btn-fold',  true);
    setBtn('btn-check', data.canCheck);
    setBtn('btn-call',  data.canCall, data.toCall > 0 ? `Колл ${data.toCall}` : 'Колл');
    setBtn('btn-raise', data.canRaise);
    setBtn('btn-allin', true);

    // Настраиваем слайдер рейза
    const slider = document.getElementById('raise-slider');
    const input  = document.getElementById('raise-input');
    slider.min = data.minRaise;
    slider.max = data.maxRaise;
    slider.value = data.minRaise;
    input.min = data.minRaise;
    input.max = data.maxRaise;
    input.value = data.minRaise;
}

function setBtn(id, enabled, label = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !enabled;
    if (label) el.textContent = label;
}

function disableAllActions() {
    state.canAct = false;
    ['btn-fold','btn-check','btn-call','btn-raise','btn-allin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
    // Сбрасываем метки колла
    const callBtn = document.getElementById('btn-call');
    if (callBtn) callBtn.textContent = 'Колл';
}

//  Отправка действий

function sendAction(action, amount = 0) {
    if (!state.canAct) return;
    socket.emit('player-action', { roomId: state.roomId, action, amount }, (res) => {
        if (res && !res.ok) {
            addLog(`Ошибка: ${res.error}`, 'system');
        }
    });
    disableAllActions();
}

document.getElementById('btn-fold') .addEventListener('click', () => sendAction('fold'));
document.getElementById('btn-check').addEventListener('click', () => sendAction('check'));
document.getElementById('btn-call') .addEventListener('click', () => sendAction('call'));
document.getElementById('btn-allin').addEventListener('click', () => sendAction('allIn'));

document.getElementById('btn-raise').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('raise-input').value);
    if (!amount || amount < state.raiseMin) {
        addLog(`Минимальный рейз: ${state.raiseMin}`, 'system');
        return;
    }
    sendAction('raise', amount);
});

// Слайдер ↔ поле ввода синхронизируются
document.getElementById('raise-slider').addEventListener('input', (e) => {
    document.getElementById('raise-input').value = e.target.value;
});

document.getElementById('raise-input').addEventListener('input', (e) => {
    const val = Math.min(Math.max(parseInt(e.target.value) || state.raiseMin, state.raiseMin), state.raiseMax);
    document.getElementById('raise-slider').value = val;
});

// Пресеты рейза
document.getElementById('btn-ready')?.addEventListener('click', () => {
    if (state.isReady) return;
    socket.emit('ready', { roomId: state.roomId });
    state.isReady = true;
    const btn = document.getElementById('btn-ready');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Вы готовы';
    }
});

document.getElementById('btn-leave-table')?.addEventListener('click', () => {
    if (!confirm('Выйти из-за стола? Все фишки со стола вернутся на ваш счёт.')) return;
    leaveTableAndGo('/menu.html');
});

function leaveTableAndGo(targetUrl = '/menu.html') {
    socket.emit('leave-room', { roomId: state.roomId }, (res) => {
        if (res?.ok === false) {
            alert(res.error || 'Не удалось выйти из-за стола');
            return;
        }
        if (res?.accountChips != null) syncAccountChips(res.accountChips);
        state.myTableChips = 0;
        socket.disconnect();
        window.location.href = targetUrl;
    });
}

document.querySelectorAll('.btn-raise-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        const mult = btn.dataset.mult;
        let amount;

        if (mult === 'pot') {
            amount = Math.min(state.pot, state.raiseMax);
        } else {
            amount = Math.min(state.bigBlind * parseInt(mult), state.raiseMax);
        }

        amount = Math.max(amount, state.raiseMin);
        document.getElementById('raise-input').value = amount;
        document.getElementById('raise-slider').value = amount;
    });
});

//  Оверлеи

/**
 * Показывает результат раздачи.
 */
function showResult(results, isShowdown) {
    const winners = results.filter(r => r.isWinner);
    const titleEl = document.getElementById('result-title');
    const bodyEl  = document.getElementById('result-body');

    titleEl.textContent = isShowdown ? 'Шоудаун' : 'Раздача окончена';
    bodyEl.innerHTML = winners.map(r => `
        <div class="result-winner">🏆 ${r.username} +${r.amount} 🪙</div>
        ${r.handName ? `<div class="result-hand">${r.handName}</div>` : ''}
    `).join('');

    showOverlay('overlay-result');
    hideOverlay('overlay-ready');
}

function updateReadyUI(readyCount, allCount) {
    const text = `Готовы: ${readyCount} из ${allCount}`;
    const el = document.getElementById('ready-status');
    if (el) el.textContent = text;
}

function resetReadyButton() {
    state.isReady = false;
    const btn = document.getElementById('btn-ready');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Готов к раздаче';
    }
}

function showOverlay(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

function hideOverlay(id) {
    document.getElementById(id)?.classList.add('hidden');
}

//  Лог событий

function addLog(text, type = 'action') {
    const container = document.getElementById('game-log-entries');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `log-entry ${type === 'win' ? 'log-win' : type === 'system' ? 'log-system' : ''}`;
    div.textContent = text;
    container.appendChild(div);

    // Автопрокрутка вниз
    container.scrollTop = container.scrollHeight;

    // Ограничиваем лог 100 записями
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

//  Шапка: комната и баланс

function updateRoomHeader({ roomName, smallBlind, bigBlind }) {
    const nameEl = document.getElementById('room-name-display');
    const blindsEl = document.getElementById('blinds-display');
    if (nameEl) nameEl.textContent = roomName || 'Стол';
    if (blindsEl) blindsEl.textContent = `Блайнды: ${smallBlind}/${bigBlind}`;
}

function syncMyTableChipsFromPlayers(players) {
    const me = players?.find(p => p?.id != null && String(p.id) === String(state.myPlayerId));
    state.myTableChips = me?.chips ?? 0;
}

/** Только баланс на счёте в БД — не суммировать с фишками за столом */
function syncAccountChips(chips) {
    const stored = JSON.parse(localStorage.getItem('currentUser') || '{}');
    stored.chips = chips;
    localStorage.setItem('currentUser', JSON.stringify(stored));
    renderProfileNav();
}

function renderProfileNav() {
    const profileNav = document.querySelector('.profile-nav ul');
    if (!profileNav) return;
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!user?.username) return;

    const account = user.chips ?? 0;

    profileNav.innerHTML = `
        <li><a href="/menu.html" id="profile-menu-link" title="Баланс на счёте">${user.username} - ${account} 🪙</a></li>
        <li><a href="#" id="logout-btn">Выйти</a></li>
    `;

    document.getElementById('profile-menu-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        leaveTableAndGo('/menu.html');
    });

    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        socket.emit('leave-room', { roomId: state.roomId }, async (res) => {
            if (res?.ok === false) {
                alert(res.error || 'Не удалось выйти из-за стола');
                return;
            }
            if (res?.accountChips != null) {
                syncAccountChips(res.accountChips);
            }
            state.myTableChips = 0;
            socket.disconnect();
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href = '/menu.html';
        });
    });
}

async function refreshProfileNav() {
    try {
        const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
        if (!res.ok) return;
        const user = await res.json();
        syncAccountChips(user.chips);
        const stored = JSON.parse(localStorage.getItem('currentUser') || '{}');
        stored.id = user.id;
        stored.username = user.username;
        localStorage.setItem('currentUser', JSON.stringify(stored));
        renderProfileNav();
    } catch {
        renderProfileNav();
    }
}

refreshProfileNav();
