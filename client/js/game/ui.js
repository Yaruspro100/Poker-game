/**
 * Управление оверлеями (результаты, готовность)
 */

import { state, RESULT_OVERLAY_MS, resultOverlayTimer, setResultOverlayTimer, HAND_PHASES } from './state.js';
import { clearHandCards } from './cards.js';
import { renderPlayers, clearTurnHighlights, countSeatedPlayers } from './players.js';
import { disableAllActions } from './actions.js';

export function showResult(results, isShowdown) {
    const winners = results.filter(r => r.isWinner);
    const titleEl = document.getElementById('result-title');
    const bodyEl  = document.getElementById('result-body');

    titleEl.textContent = isShowdown ? 'Шоудаун — победитель' : 'Раздача окончена';
    bodyEl.innerHTML = winners.map(r => `
        <div class="result-winner">🏆 ${r.username} +${r.amount} 🪙</div>
        ${r.handName ? `<div class="result-hand">${r.handName}</div>` : ''}
    `).join('');

    document.getElementById('overlay-result')?.classList.remove('hidden');
    hideOverlay('overlay-ready');

    clearTimeout(resultOverlayTimer);
    const timer = setTimeout(dismissResultOverlay, RESULT_OVERLAY_MS);
    setResultOverlayTimer(timer);
}

export function dismissResultOverlay() {
    clearTimeout(resultOverlayTimer);
    setResultOverlayTimer(null);
    document.getElementById('overlay-result')?.classList.add('hidden');
    clearHandCards();
    if (state.tablePlayers) {
        renderPlayers(state.tablePlayers, state.phase);
    }
    updateIdlePrompt();
}

export function updateReadyUI(readyCount, allCount) {
    const text = `Готовы: ${readyCount} из ${allCount}`;
    const el = document.getElementById('ready-status');
    if (el) el.textContent = text;
}

export function resetReadyButton() {
    state.isReady = false;
    const btn = document.getElementById('btn-ready');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Готов к раздаче';
    }
}

export function showOverlay(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

export function hideOverlay(id) {
    document.getElementById(id)?.classList.add('hidden');
}

export function setActionPrompt(text) {
    const prompt = document.getElementById('action-prompt');
    const toCall = document.getElementById('to-call-display');
    if (prompt) prompt.textContent = text;
    if (toCall) toCall.textContent = '';
}

export function setWaitingForPlayersStatus() {
    disableAllActions();
    clearTurnHighlights();
    clearHandCards();
    setActionPrompt('Ожидание игроков');
}

export function updateIdlePrompt(players) {
    if (HAND_PHASES.includes(state.phase) || state.isSpectating) return;

    const seated = countSeatedPlayers(players);
    if (seated < 2) {
        setWaitingForPlayersStatus();
    } else if (state.phase === 'ended') {
        clearHandCards();
        clearTurnHighlights();
        disableAllActions();
        setActionPrompt('Подтвердите готовность к раздаче');
    }
}
