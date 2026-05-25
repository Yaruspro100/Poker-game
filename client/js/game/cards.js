/**
 * Отрисовка карт (карманные и общие)
 */

import { RED_SUITS } from './state.js';

export function renderHoleCards(cards) {
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

export function renderCommunityCards(cards) {
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

export function clearHoleCards() {
    for (let i = 0; i < 2; i++) {
        const el = document.getElementById(`hole-card-${i}`);
        if (el) {
            el.className = 'hole-card';
            el.innerHTML = '';
        }
    }
    const handName = document.getElementById('hand-name');
    if (handName) handName.textContent = '';
}

export function clearCommunityCards() {
    for (let i = 0; i < 5; i++) {
        const el = document.getElementById(`comm-${i}`);
        if (el) { el.className = 'card-slot'; el.innerHTML = ''; }
    }
}

export function clearHandCards() {
    clearHoleCards();
    clearCommunityCards();
}
