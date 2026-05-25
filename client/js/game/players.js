/**
 * Отрисовка игроков за столом
 */

import { state, RED_SUITS, HAND_PHASES } from './state.js';

export function renderPlayers(players, phase = state.phase) {
    state.tablePlayers = players;
    for (let i = 0; i < 9; i++) {
        const player = players?.[i];
        if (player && player.id) {
            renderOccupiedSeat(i, player, phase);
        } else {
            renderEmptySeat(i);
        }
    }
}

export function renderOccupiedSeat(seatIdx, player, phase = 'waiting') {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;

    const isMe = String(player.id) === String(state.myPlayerId);
    el.dataset.playerId = player.id;
    const isFolded = player.status === 'folded';
    const isAllIn = player.status === 'allIn';
    const isWaiting = player.status === 'out' && HAND_PHASES.includes(phase);
    const inHand = HAND_PHASES.includes(phase) && !isWaiting && player.status !== 'out';
    const bet = player.bet || 0;

    let classes = 'seat-inner';
    if (isFolded) classes += ' folded';
    if (isAllIn) classes += ' all-in';
    if (isWaiting) classes += ' waiting-next';

    el.innerHTML = `
        <div class="${classes}">
            <div class="seat-username" title="${player.username}">
                ${isMe ? '★ ' : ''}${player.username}
            </div>
            <div class="seat-chips">${player.chips} 🪙</div>
            <div class="seat-bet">${bet > 0 ? `Ставка: ${bet}` : ''}</div>
            ${isWaiting ? '<div class="seat-waiting-label">ожидает</div>' : ''}
            ${isFolded ? '<div style="font-size:0.6rem;color:#9ca3af">сброс</div>' : ''}
            ${isAllIn ? '<div style="font-size:0.6rem;color:#f59e0b">ВА-БАНК</div>' : ''}
            ${player.holeCards?.length > 0 && !player.holeCards[0].hidden
                ? ''
                : inHand && !isFolded
                    ? '<div class="seat-cards"><div class="seat-card-back"></div><div class="seat-card-back"></div></div>'
                    : ''
            }
        </div>
    `;
}

export function renderEmptySeat(seatIdx) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;
    delete el.dataset.playerId;
    el.innerHTML = `<div class="seat-inner empty">Свободно</div>`;
}

export function findSeatByPlayerId(playerId) {
    for (let i = 0; i < 9; i++) {
        const el = document.getElementById(`seat-${i}`);
        if (el?.dataset.playerId === String(playerId)) return i;
    }
    return null;
}

function seatCardsHtml(holeCards) {
    if (!holeCards?.length) return '';
    return holeCards.map(c => {
        const suit = c.display?.slice(-1) || '';
        const isRed = RED_SUITS.includes(suit);
        return `<div class="seat-card-face ${isRed ? 'red' : 'black'}">${c.display || '?'}</div>`;
    }).join('');
}

export function renderSeatAtShowdown(seatIdx, player, ev) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;

    const isMe = String(player.id) === String(state.myPlayerId);
    const isFolded = player.status === 'folded';
    const bet = player.bet || 0;
    const cardsHtml = seatCardsHtml(ev.holeCards);

    let classes = 'seat-inner';
    if (isFolded) classes += ' folded';
    if (player.status === 'allIn') classes += ' all-in';

    el.dataset.playerId = player.id;
    el.innerHTML = `
        <div class="${classes}">
            <div class="seat-username" title="${player.username}">
                ${isMe ? '★ ' : ''}${player.username}
            </div>
            <div class="seat-chips">${player.chips} 🪙</div>
            <div class="seat-bet">${bet > 0 ? `Ставка: ${bet}` : ''}</div>
            ${isFolded ? '<div style="font-size:0.6rem;color:#9ca3af">сброс</div>' : ''}
            ${player.status === 'allIn' ? '<div style="font-size:0.6rem;color:#f59e0b">ВА-БАНК</div>' : ''}
            <div class="seat-cards seat-cards-revealed">${cardsHtml}</div>
            ${ev.handName ? `<div class="seat-hand-name">${ev.handName}</div>` : ''}
        </div>
    `;
}

export function renderSeatShowdownCards(seatIdx, holeCards, handName) {
    const el = document.getElementById(`seat-${seatIdx}`);
    if (!el) return;

    const inner = el.querySelector('.seat-inner');
    if (!inner) return;

    let cardsEl = inner.querySelector('.seat-cards');
    if (!cardsEl) {
        cardsEl = document.createElement('div');
        cardsEl.className = 'seat-cards seat-cards-revealed';
        inner.appendChild(cardsEl);
    } else {
        cardsEl.className = 'seat-cards seat-cards-revealed';
    }
    cardsEl.innerHTML = seatCardsHtml(holeCards);

    if (handName) {
        let handEl = inner.querySelector('.seat-hand-name');
        if (!handEl) {
            handEl = document.createElement('div');
            handEl.className = 'seat-hand-name';
            inner.appendChild(handEl);
        }
        handEl.textContent = handName;
    }
}

export function syncMyTableChipsFromPlayers(players) {
    const me = players?.find(p => p?.id != null && String(p.id) === String(state.myPlayerId));
    state.myTableChips = me?.chips ?? 0;
}

export function clearTurnHighlights() {
    for (let i = 0; i < 9; i++) {
        document.querySelector(`#seat-${i} .seat-inner`)?.classList.remove('active-turn');
    }
}

export function countSeatedPlayers(players) {
    if (players) {
        return players.filter(p => p && p.id).length;
    }
    let n = 0;
    for (let i = 0; i < 9; i++) {
        if (document.getElementById(`seat-${i}`)?.dataset.playerId) n++;
    }
    return n;
}
