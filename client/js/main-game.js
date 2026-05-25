/**
 * Главный файл игры — подключение к серверу и обработка событий
 */

import { state, PHASE_NAMES, HAND_PHASES } from './game/state.js';
import { renderPlayers, renderEmptySeat, findSeatByPlayerId, renderSeatAtShowdown, renderSeatShowdownCards, syncMyTableChipsFromPlayers } from './game/players.js';
import { renderHoleCards, renderCommunityCards, clearHandCards, clearHoleCards } from './game/cards.js';
import { renderTurnUI, disableAllActions, setupActionButtons } from './game/actions.js';
import { showResult, dismissResultOverlay, updateReadyUI, resetReadyButton, showOverlay, hideOverlay, setActionPrompt, setWaitingForPlayersStatus, updateIdlePrompt } from './game/ui.js';
import { updatePot, updatePhase, clearSidePots, updateRoomHeader } from './game/pot.js';
import { addLog } from './utils/logger.js';

const urlParams = new URLSearchParams(window.location.search);
state.roomId = urlParams.get('roomId');

if (!state.roomId) {
    alert('Комната не указана');
    window.location.href = '/connect-to-room';
}

const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
state.myPlayerId = currentUser.id;
state.myUsername = currentUser.username;

if (!token) {
    window.location.href = '/login';
}

const socket = io({ auth: { token } });

socket.on('connect', () => {
    addLog('Подключено к серверу', 'system');

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
        if (res.handInProgress) {
            addLog('Текущая раздача уже идёт — вы подключитесь к следующей.', 'system');
        }

        socket.emit('get-game-state', { roomId: state.roomId }, (stateRes) => {
            if (stateRes?.ok) renderGameState(stateRes.state);
        });
    });
});

socket.on('connect_error', (err) => {
  if (err.message && (
    err.message.includes('Session expired') ||
    err.message.includes('Authentication error')
  )) {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    alert('Сессия завершена: выполнен вход с другого устройства.');
    window.location.href = '/menu';
    return;
  }
  addLog(`Ошибка подключения: ${err.message}`, 'system');
});

// Сервер шлёт это при логине со второго устройства
socket.on('session-kicked', (data) => {
  socket.disconnect();
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  alert(data?.reason || 'Сессия завершена.');
  window.location.href = '/menu';
});

socket.on('disconnect', () => {
    addLog('Соединение разорвано', 'system');
    disableAllActions();
});

socket.on('account-chips', ({ chips }) => {
    syncAccountChips(chips);
});

socket.on('game-state', (gameState) => {
    renderGameState(gameState);
});

socket.on('hole-cards', ({ holeCards }) => {
    renderHoleCards(holeCards);
});

socket.on('hand-started', ({ dealerSeat, phase, players }) => {
    state.isSpectating = false;
    syncMyTableChipsFromPlayers(players);
    clearHandCards();
    clearSidePots();
    updatePhase(phase);
    renderPlayers(players, phase);
    setActionPrompt('Ожидайте своего хода...');
    addLog('Новая раздача начата', 'system');
    dismissResultOverlay();
    hideOverlay('overlay-ready');
    resetReadyButton();
});

socket.on('blinds-posted', ({ sbPlayerId, bbPlayerId, smallBlind, bigBlind }) => {
    state.bigBlind = bigBlind;
    addLog(`Блайнды: SB ${smallBlind} / BB ${bigBlind} 🪙`, 'system');
});

socket.on('street-changed', ({ phase, communityCards }) => {
    updatePhase(phase);
    renderCommunityCards(communityCards);
    addLog(`Улица: ${PHASE_NAMES[phase] || phase}`, 'system');
    disableAllActions();
    document.getElementById('action-prompt').textContent = 'Ожидайте своего хода...';
    document.getElementById('to-call-display').textContent = '';
});

socket.on('player-turn', (data) => {
    updatePot(data.pot);
    if (data.players) {
        renderPlayers(data.players);
        syncMyTableChipsFromPlayers(data.players);
    }
    renderTurnUI(data);
});

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

socket.on('player-joined', ({ seatIdx, username, chips }) => {
    addLog(`${username} сел за стол (место ${seatIdx + 1})`, 'system');
});

socket.on('player-left', ({ seatIdx, playerId }) => {
    renderEmptySeat(seatIdx);
    addLog(`Игрок покинул стол`, 'system');
    updateIdlePrompt();
});

socket.on('player-temporarily-disconnected', ({ username }) => {
    addLog(`${username} отключился, ожидаем переподключения...`, 'system');
});

socket.on('player-reconnected', ({ username }) => {
    addLog(`${username} переподключился`, 'system');
});

socket.on('waiting-for-players', ({ message }) => {
    dismissResultOverlay();
    hideOverlay('overlay-ready');
    setWaitingForPlayersStatus();
    addLog(message, 'system');
});

socket.on('waiting-next-hand', ({ message }) => {
    addLog(message, 'system');
    state.isSpectating = true;
    disableAllActions();
    hideOverlay('overlay-ready');
    const prompt = document.getElementById('action-prompt');
    if (prompt) prompt.textContent = 'Ожидаете следующую раздачу...';
});

socket.on('awaiting-ready', ({ readyCount, allCount }) => {
    dismissResultOverlay();
    resetReadyButton();
    updateReadyUI(readyCount, allCount);
    setActionPrompt('Подтвердите готовность к раздаче');
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

socket.on('hand-ended-no-showdown', ({ winnerId, winnerUsername, amount, players }) => {
    updatePhase('ended');
    clearHandCards();
    renderPlayers(players, 'ended');
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
    updateIdlePrompt();
});

socket.on('showdown', ({ evaluations, pots, results, communityCards, players }) => {
    updatePhase('showdown');
    renderCommunityCards(communityCards);
    updatePot(0);
    clearSidePots();
    if (players) {
        syncMyTableChipsFromPlayers(players);
        state.tablePlayers = players;
        renderPlayers(players, 'showdown');
    }

    revealAllPlayersCards(evaluations);

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
    state.phase = 'ended';
    updatePhase('ended');
});

function renderGameState(gs) {
    if (!gs) return;
    
    if (gs.roomInfo) updateRoomHeader(gs.roomInfo);
    state.phase = gs.phase || 'waiting';
    updatePhase(gs.phase);
    updatePot(gs.pot);

    const activePhases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    if (activePhases.includes(gs.phase)) {
        hideOverlay('overlay-ready');
    }

    if (gs.communityCards?.length) {
        renderCommunityCards(gs.communityCards);
    }
    if (gs.players) {
        renderPlayers(gs.players, gs.phase);
        syncMyTableChipsFromPlayers(gs.players);
    }

    applySpectatorMode(gs);
    updateIdlePrompt(gs.players);

    const myPlayerData = gs.players?.find(
        p => p?.id != null && String(p.id) === String(state.myPlayerId)
    );
    if (HAND_PHASES.includes(gs.phase)
        && myPlayerData?.holeCards?.length
        && !myPlayerData.holeCards[0].hidden) {
        renderHoleCards(myPlayerData.holeCards);
    } else {
        clearHoleCards();
    }
}

function applySpectatorMode(gs) {
    const me = gs.players?.find(
        p => p?.id != null && String(p.id) === String(state.myPlayerId)
    );
    const spectating = HAND_PHASES.includes(gs.phase) && me?.status === 'out';
    state.isSpectating = spectating;

    if (spectating) {
        disableAllActions();
        hideOverlay('overlay-ready');
        const prompt = document.getElementById('action-prompt');
        if (prompt) prompt.textContent = 'Ожидаете следующую раздачу...';
    } else if (HAND_PHASES.includes(gs.phase)) {
        state.isSpectating = false;
    }
}

function revealAllPlayersCards(evaluations) {
    if (!evaluations?.length) return;

    for (const ev of evaluations) {
        const seatIdx = resolveSeatIdx(ev);
        if (seatIdx == null || seatIdx < 0) continue;

        const player = state.tablePlayers?.[seatIdx];
        if (player) {
            renderSeatAtShowdown(seatIdx, player, ev);
        } else {
            renderSeatShowdownCards(seatIdx, ev.holeCards, ev.handName);
        }
    }

    const myEv = evaluations.find(e => String(e.playerId) === String(state.myPlayerId));
    if (myEv?.holeCards?.length) {
        renderHoleCards(myEv.holeCards);
        const handNameEl = document.getElementById('hand-name');
        if (handNameEl && myEv.handName) handNameEl.textContent = myEv.handName;
    }
}

function resolveSeatIdx(ev) {
    if (ev.seatIdx != null && ev.seatIdx >= 0) return ev.seatIdx;
    return findSeatByPlayerId(ev.playerId);
}

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
        <li><a href="/profile" id="profile-menu-link" title="Баланс на счёте">${user.username} - ${account} 🪙</a></li>
        <li><a href="#" id="logout-btn">Выйти</a></li>
    `;

    document.getElementById('profile-menu-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        leaveTableWithConfirm('/profile');
    });

    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirmLeaveTable()) return;
        leaveRoom(async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href = '/menu';
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

const LEAVE_TABLE_CONFIRM = 'Выйти из-за стола? Все фишки со стола вернутся на ваш счёт.';

function confirmLeaveTable() {
    return confirm(LEAVE_TABLE_CONFIRM);
}

function leaveRoom(onSuccess) {
    socket.emit('leave-room', { roomId: state.roomId }, (res) => {
        if (res?.ok === false) {
            alert(res.error || 'Не удалось выйти из-за стола');
            return;
        }
        if (res?.accountChips != null) syncAccountChips(res.accountChips);
        state.myTableChips = 0;
        socket.disconnect();
        onSuccess?.();
    });
}

function leaveTableAndGo(targetUrl = '/menu') {
    leaveRoom(() => { window.location.href = targetUrl; });
}

function leaveTableWithConfirm(targetUrl = '/menu') {
    if (!confirmLeaveTable()) return;
    leaveTableAndGo(targetUrl);
}

document.getElementById('btn-ready')?.addEventListener('click', () => {
    if (state.isReady || state.isSpectating) return;
    socket.emit('ready', { roomId: state.roomId });
    state.isReady = true;
    const btn = document.getElementById('btn-ready');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Вы готовы';
    }
});

document.getElementById('btn-leave-table')?.addEventListener('click', () => {
    leaveTableWithConfirm('/menu');
});

document.querySelector('header h1 a')?.addEventListener('click', (e) => {
    e.preventDefault();
    leaveTableWithConfirm('/menu');
});

setupActionButtons(socket);
refreshProfileNav();