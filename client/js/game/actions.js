/**
 * UI действий игрока (кнопки, слайдеры)
 */

import { state } from './state.js';
import { addLog } from '../utils/logger.js';

export function renderTurnUI(data) {
    const isMyTurn = Number(data.playerId) === Number(state.myPlayerId);

    for (let i = 0; i < 9; i++) {
        const inner = document.querySelector(`#seat-${i} .seat-inner`);
        if (inner) inner.classList.remove('active-turn');
    }

    const allSeats = document.querySelectorAll('.seat-inner .seat-username');
    allSeats.forEach(el => {
        if (el.title === data.playerId || el.textContent.trim().includes(data.username)) {
            el.closest('.seat-inner')?.classList.add('active-turn');
        }
    });

    if (!isMyTurn) {
        document.getElementById('action-prompt').textContent = `Ход игрока: ${data.username}`;
        document.getElementById('to-call-display').textContent = '';
        disableAllActions();
        return;
    }

    state.canAct = true;
    state.raiseMin = data.minRaise;
    state.raiseMax = data.maxRaise;

    document.getElementById('action-prompt').textContent = 'Ваш ход!';
    document.getElementById('to-call-display').textContent =
        data.toCall > 0 ? `Для колла: ${data.toCall} 🪙` : '';

    setBtn('btn-fold',  true);
    setBtn('btn-check', data.canCheck);
    setBtn('btn-call',  data.canCall, data.toCall > 0 ? `Колл ${data.toCall}` : 'Колл');
    setBtn('btn-raise', data.canRaise);
    setBtn('btn-allin', true);

    const slider = document.getElementById('raise-slider');
    const input  = document.getElementById('raise-input');
    slider.min = data.minRaise;
    slider.max = data.maxRaise;
    slider.value = data.minRaise;
    input.min = data.minRaise;
    input.max = data.maxRaise;
    input.value = data.minRaise;
}

export function setBtn(id, enabled, label = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !enabled;
    if (label) el.textContent = label;
}

export function disableAllActions() {
    state.canAct = false;
    ['btn-fold','btn-check','btn-call','btn-raise','btn-allin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
    const callBtn = document.getElementById('btn-call');
    if (callBtn) callBtn.textContent = 'Колл';
}

export function sendAction(socket, action, amount = 0) {
    if (!state.canAct) return;
    socket.emit('player-action', { roomId: state.roomId, action, amount }, (res) => {
        if (res && !res.ok) {
            addLog(`Ошибка: ${res.error}`, 'system');
        }
    });
    disableAllActions();
}

export function setupActionButtons(socket) {
    document.getElementById('btn-fold')?.addEventListener('click', () => sendAction(socket, 'fold'));
    document.getElementById('btn-check')?.addEventListener('click', () => sendAction(socket, 'check'));
    document.getElementById('btn-call')?.addEventListener('click', () => sendAction(socket, 'call'));
    document.getElementById('btn-allin')?.addEventListener('click', () => sendAction(socket, 'allIn'));

    document.getElementById('btn-raise')?.addEventListener('click', () => {
        const amount = parseInt(document.getElementById('raise-input').value);
        if (!amount || amount < state.raiseMin) {
            addLog(`Минимальный рейз: ${state.raiseMin}`, 'system');
            return;
        }
        sendAction(socket, 'raise', amount);
    });

    document.getElementById('raise-slider')?.addEventListener('input', (e) => {
        document.getElementById('raise-input').value = e.target.value;
    });

    document.getElementById('raise-input')?.addEventListener('input', (e) => {
        const val = Math.min(Math.max(parseInt(e.target.value) || state.raiseMin, state.raiseMin), state.raiseMax);
        document.getElementById('raise-slider').value = val;
    });

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
}
