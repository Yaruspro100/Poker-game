/**
 * deck.js — колода карт.
 * Создаёт стандартную колоду из 52 карт, тасует и раздаёт.
 */

// Ранги и масти
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['h', 'd', 'c', 's']; // hearts, diamonds, clubs, spades

// Числовые значения рангов для сравнения
const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// Читаемые названия для клиента
const RANK_NAMES = {
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};
const SUIT_NAMES = { h: '♥', d: '♦', c: '♣', s: '♠' };

/**
 * Создаёт новую колоду из 52 карт.
 * Каждая карта: { rank, suit, value, display }
 */
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                rank,
                suit,
                value: RANK_VALUES[rank],
                display: `${RANK_NAMES[rank]}${SUIT_NAMES[suit]}`, // например "A♠"
            });
        }
    }
    return deck;
}

/**
 * Тасует колоду алгоритмом Фишера-Йетса.
 * Возвращает новую перетасованную копию.
 */
function shuffle(deck) {
    const d = [...deck];
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

/**
 * Снимает n карт с верха колоды.
 * Изменяет исходный массив!
 */
function deal(deck, n = 1) {
    return deck.splice(0, n);
}

module.exports = { createDeck, shuffle, deal, RANK_VALUES };