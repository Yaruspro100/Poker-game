/**
 * chipWallet.js — операции с балансом фишек на счёте пользователя.
 */

const pool = require('./db');

async function getBalance(userId) {
    const result = await pool.query('SELECT chips FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.chips ?? 0;
}

/**
 * Списать фишки (бай-ин). Атомарно: не списывает, если недостаточно.
 */
async function deductChips(userId, amount) {
    const result = await pool.query(
        'UPDATE users SET chips = chips - $2 WHERE id = $1 AND chips >= $2 RETURNING chips',
        [userId, amount]
    );
    if (result.rowCount === 0) {
        const chips = await getBalance(userId);
        return { ok: false, error: 'Недостаточно фишек на счёте', chips };
    }
    return { ok: true, chips: result.rows[0].chips };
}

/**
 * Вернуть фишки на счёт (кэшаут со стола).
 */
async function addChips(userId, amount) {
    if (amount <= 0) {
        const chips = await getBalance(userId);
        return { ok: true, chips };
    }
    const result = await pool.query(
        'UPDATE users SET chips = chips + $2 WHERE id = $1 RETURNING chips',
        [userId, amount]
    );
    return { ok: true, chips: result.rows[0].chips };
}

module.exports = { getBalance, deductChips, addChips };
