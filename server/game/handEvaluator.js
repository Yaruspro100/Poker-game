/**
 * handEvaluator.js — определение силы покерной руки.
 *
 * Принимает 2 карманные + до 5 общих карт, находит лучшую из всех
 * комбинаций C(7,5) = 21. Возвращает ранг, числовой score для
 * сравнения и читаемое название комбинации.
 *
 * Ранги комбинаций:
 *   8 — Стрит-флеш (включая Роял)
 *   7 — Каре
 *   6 — Фул-хаус
 *   5 — Флеш
 *   4 — Стрит
 *   3 — Сет
 *   2 — Две пары
 *   1 — Пара
 *   0 — Старшая карта
 */

/**
 * Генерирует все сочетания из k элементов массива arr.
 */
function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

/**
 * Оценивает ровно 5 карт.
 * Возвращает { rank, score[], name }
 * score используется для лексикографического сравнения рук.
 */
function evaluateFive(cards) {
    // Значения по убыванию
    const values = cards.map(c => c.value).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);

    const isFlush = new Set(suits).size === 1;

    // Проверка стрита
    let isStraight = false;
    let straightHigh = values[0];

    if (new Set(values).size === 5 && values[0] - values[4] === 4) {
        isStraight = true;
    }
    // Велосипед: A-2-3-4-5 (тихий стрит, туз играет как 1)
    if (!isStraight &&
        values[0] === 14 && values[1] === 5 &&
        values[2] === 4 && values[3] === 3 && values[4] === 2) {
        isStraight = true;
        straightHigh = 5;
    }

    // Подсчёт групп одинаковых значений
    const countMap = {};
    for (const v of values) countMap[v] = (countMap[v] || 0) + 1;

    // Сортируем группы: сначала по количеству (desc), затем по значению (desc)
    // Это даёт правильный порядок кикеров для сравнения
    const groups = Object.entries(countMap)
        .map(([v, c]) => ({ value: Number(v), count: c }))
        .sort((a, b) => b.count - a.count || b.value - a.value);

    // ---- Определяем комбинацию ----

    if (isFlush && isStraight) {
        const name = straightHigh === 14 ? 'Роял-флеш' : 'Стрит-флеш';
        return { rank: 8, score: [8, straightHigh], name };
    }

    if (groups[0].count === 4) {
        return {
            rank: 7,
            score: [7, groups[0].value, groups[1].value],
            name: 'Каре',
        };
    }

    if (groups[0].count === 3 && groups[1].count === 2) {
        return {
            rank: 6,
            score: [6, groups[0].value, groups[1].value],
            name: 'Фул-хаус',
        };
    }

    if (isFlush) {
        return { rank: 5, score: [5, ...values], name: 'Флеш' };
    }

    if (isStraight) {
        return { rank: 4, score: [4, straightHigh], name: 'Стрит' };
    }

    if (groups[0].count === 3) {
        const kickers = groups.slice(1).map(g => g.value);
        return { rank: 3, score: [3, groups[0].value, ...kickers], name: 'Сет' };
    }

    if (groups[0].count === 2 && groups[1].count === 2) {
        return {
            rank: 2,
            score: [2, groups[0].value, groups[1].value, groups[2].value],
            name: 'Две пары',
        };
    }

    if (groups[0].count === 2) {
        const kickers = groups.slice(1).map(g => g.value);
        return { rank: 1, score: [1, groups[0].value, ...kickers], name: 'Пара' };
    }

    return { rank: 0, score: [0, ...values], name: 'Старшая карта' };
}

/**
 * Сравнивает два score-массива лексикографически.
 * Возвращает: < 0 если a лучше, > 0 если b лучше, 0 если ничья.
 */
function compareScores(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const diff = (b[i] ?? 0) - (a[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Находит лучшую комбинацию из holeCards + communityCards.
 * holeCards: массив из 2 карт игрока
 * communityCards: массив из 3-5 общих карт
 *
 * Возвращает { rank, score, name, bestCards }
 */
function evaluateBest(holeCards, communityCards) {
    const allCards = [...holeCards, ...communityCards];
    const combos = getCombinations(allCards, 5);

    let best = null;
    for (const combo of combos) {
        const result = evaluateFive(combo);
        if (!best || compareScores(result.score, best.score) < 0) {
            best = { ...result, bestCards: combo };
        }
    }
    return best;
}

/**
 * Сравнивает две руки (результаты evaluateBest).
 * Возвращает < 0 если handA лучше, > 0 если handB лучше, 0 если равны.
 */
function compareHands(handA, handB) {
    return compareScores(handA.score, handB.score);
}

module.exports = { evaluateBest, compareHands };