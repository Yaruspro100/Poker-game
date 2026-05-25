/**
 * Состояние игры и константы
 */

export const PHASE_NAMES = {
    waiting:  'Ожидание',
    preflop:  'Префлоп',
    flop:     'Флоп',
    turn:     'Тёрн',
    river:    'Ривер',
    showdown: 'Шоудаун',
    ended:    'Раздача окончена',
};

export const HAND_PHASES = ['preflop', 'flop', 'turn', 'river', 'showdown'];
export const RESULT_OVERLAY_MS = 6000;
export const RED_SUITS = ['♥', '♦'];

export const state = {
    myPlayerId: null,
    myUsername: null,
    roomId: null,
    raiseMin: 0,
    raiseMax: 0,
    bigBlind: 10,
    canAct: false,
    pot: 0,
    isReady: false,
    isSpectating: false,
    myTableChips: 0,
    phase: 'waiting',
    tablePlayers: null,
};

export let resultOverlayTimer = null;

export function setResultOverlayTimer(timer) {
    resultOverlayTimer = timer;
}
