/**
 * Управление банком и фазами игры
 */

import { state, PHASE_NAMES } from './state.js';

export function updatePot(amount) {
    state.pot = amount || 0;
    document.getElementById('pot-amount').textContent = `${state.pot} 🪙`;
}

export function updatePhase(phase) {
    state.phase = phase || 'waiting';
    const el = document.getElementById('phase-badge');
    if (el) el.textContent = PHASE_NAMES[phase] || phase;
}

export function clearSidePots() {
    document.getElementById('side-pots').innerHTML = '';
}

export function renderSidePots(pots) {
    const el = document.getElementById('side-pots');
    if (!el || pots.length <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = pots.map((p, i) =>
        `<span class="side-pot-item">${i === 0 ? 'Основной' : `Сайд-пот ${i}`}: ${p.amount} 🪙</span>`
    ).join('');
}

export function updateRoomHeader({ roomName, smallBlind, bigBlind }) {
    const nameEl = document.getElementById('room-name-display');
    const blindsEl = document.getElementById('blinds-display');
    if (nameEl) nameEl.textContent = roomName || 'Стол';
    if (blindsEl) blindsEl.textContent = `Блайнды: ${smallBlind}/${bigBlind}`;
}
