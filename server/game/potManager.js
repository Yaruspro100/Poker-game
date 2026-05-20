/**
 * potManager.js — расчёт банков и сайд-потов.
 *
 * Сайд-поты нужны когда игрок идёт в олл-ин на сумму меньше
 * текущей ставки. Он может выиграть только ту часть банка,
 * в которую внёс вклад.
 *
 * Пример:
 *   Игрок A (олл-ин 100), B (ставка 300), C (ставка 300)
 *   Основной банк: 100×3 = 300  →  участвуют A, B, C
 *   Сайд-пот 1:  200×2 = 400  →  участвуют B, C
 *
 * Алгоритм: сортируем игроков по суммарному вкладу (totalContributed),
 * на каждом уровне создаём пот из разницы × количество игроков на этом уровне.
 */

const { compareHands } = require('./handEvaluator');

/**
 * Рассчитывает список потов на основе вкладов игроков.
 *
 * @param {Array} players — массив объектов:
 *   { id, totalContributed, folded }
 *   totalContributed — сколько фишек игрок вложил за всю раздачу
 *   folded — сбросил ли карты (участвует в пополнении, но не в выигрыше)
 *
 * @returns {Array} pots — [{ amount, eligiblePlayerIds[] }]
 */
function calculatePots(players) {
    // Берём только тех, кто вложил хоть что-то
    const contributors = players
        .filter(p => p.totalContributed > 0)
        .map(p => ({ ...p })) // копия, чтобы не мутировать
        .sort((a, b) => a.totalContributed - b.totalContributed);

    const pots = [];
    let previousLevel = 0;

    while (contributors.length > 0) {
        const currentLevel = contributors[0].totalContributed;
        const contribution = currentLevel - previousLevel;

        if (contribution > 0) {
            // Все оставшиеся игроки заплатили на этом уровне
            const potAmount = contribution * contributors.length;

            // Претендовать на выигрыш могут только не сбросившие карты
            const eligible = contributors
                .filter(p => !p.folded)
                .map(p => p.id);

            pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
        }

        // Убираем всех, кто исчерпал свой вклад на этом уровне
        while (contributors.length > 0 && contributors[0].totalContributed === currentLevel) {
            contributors.shift();
        }

        previousLevel = currentLevel;
    }

    return pots;
}

/**
 * Распределяет банки между победителями.
 *
 * @param {Array} pots — результат calculatePots
 * @param {Array} evaluations — [{ playerId, hand }] для игроков в шоудауне
 *   hand — результат evaluateBest({ score, rank, name })
 *
 * @returns {Object} winnings — { playerId: amount }
 */
function distributePots(pots, evaluations) {
    const winnings = {};

    for (const pot of pots) {
        // Только игроки, которые имеют право на этот пот
        const eligible = evaluations.filter(e =>
            pot.eligiblePlayerIds.some(id => String(id) === String(e.playerId))
        );

        if (eligible.length === 0) continue;

        // Если только один претендент — он забирает автоматически
        if (eligible.length === 1) {
            const id = eligible[0].playerId;
            winnings[id] = (winnings[id] || 0) + pot.amount;
            continue;
        }

        // Сортируем по силе руки (лучшие — первые)
        eligible.sort((a, b) => compareHands(a.hand, b.hand));

        // Ищем победителей (возможна ничья)
        const bestHand = eligible[0].hand;
        const winners = eligible.filter(e => compareHands(e.hand, bestHand) === 0);

        // Делим пот поровну между победителями
        const share = Math.floor(pot.amount / winners.length);
        const remainder = pot.amount % winners.length; // остаток от деления

        for (const winner of winners) {
            winnings[winner.playerId] = (winnings[winner.playerId] || 0) + share;
        }

        // Остаток фишек — первому победителю (ближайшему к дилеру по позиции)
        if (remainder > 0) {
            winnings[winners[0].playerId] += remainder;
        }
    }

    return winnings;
}

module.exports = { calculatePots, distributePots };