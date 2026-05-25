const pool = require('../config/db');

async function saveGameState(roomId, gameState) {
    await pool.query(
        `INSERT INTO game_states (room_id, config, seats, phase, community_cards, dealer_seat, current_seat, current_bet, street_bets, total_contributed, deck, to_act, last_raise_amount, acted_this_street)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (room_id) DO UPDATE SET
            config = $2, seats = $3, phase = $4, community_cards = $5,
            dealer_seat = $6, current_seat = $7, current_bet = $8,
            street_bets = $9, total_contributed = $10, deck = $11, to_act = $12,
            last_raise_amount = $13, acted_this_street = $14, updated_at = NOW()`,
        [
            roomId,
            JSON.stringify(gameState.config),
            JSON.stringify(gameState.seats),
            gameState.phase,
            JSON.stringify(gameState.communityCards),
            gameState.dealerSeat,
            gameState.currentSeat,
            gameState.currentBet,
            JSON.stringify(gameState.streetBets),
            JSON.stringify(gameState.totalContributed),
            JSON.stringify(gameState.deck),
            JSON.stringify(gameState.toAct),
            gameState.lastRaiseAmount,
            JSON.stringify([...gameState.actedThisStreet])
        ]
    );
}

async function loadGameState(roomId) {
    const result = await pool.query('SELECT * FROM game_states WHERE room_id = $1', [roomId]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
        config: row.config,
        seats: row.seats,
        phase: row.phase,
        communityCards: row.community_cards || [],
        dealerSeat: row.dealer_seat,
        currentSeat: row.current_seat,
        currentBet: row.current_bet,
        streetBets: row.street_bets || {},
        totalContributed: row.total_contributed || {},
        deck: row.deck || [],
        toAct: row.to_act || [],
        lastRaiseAmount: row.last_raise_amount || 0,
        actedThisStreet: row.acted_this_street || []
    };
}

async function deleteGameState(roomId) {
    await pool.query('DELETE FROM game_states WHERE room_id = $1', [roomId]);
}

module.exports = { saveGameState, loadGameState, deleteGameState };
