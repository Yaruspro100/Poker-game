/**
 * Лобби - список комнат
 */

import { fetchCurrentUser } from '../auth/session.js';

const PHASE_LABELS = {
    waiting: 'Ожидание', preflop: 'Префлоп', flop: 'Флоп',
    turn: 'Тёрн', river: 'Ривер', showdown: 'Шоудаун', ended: 'Пауза',
};

export function initLobby() {
    const tableListContainer = document.getElementById('table-list-container');
    if (!tableListContainer) return;

    let selectedRoomId = null;
    let selectedRoom = null;
    let accountChips = null;

    fetchCurrentUser().then((user) => {
        if (user?.chips != null) accountChips = user.chips;
    });

    async function loadRooms() {
        try {
            const res = await fetch('/api/rooms', { credentials: 'same-origin' });
            if (!res.ok) return;
            const rooms = await res.json();
            renderRoomList(rooms);
        } catch {}
    }

    function renderRoomList(rooms) {
        if (rooms.length === 0) {
            tableListContainer.innerHTML = `
                <div class="lobby-empty">
                    Нет активных комнат. <a href="/create-room">Создайте первую!</a>
                </div>`;
            return;
        }

        tableListContainer.innerHTML = rooms.map(room => `
            <div class="table-row ${room.roomId === selectedRoomId ? 'active' : ''}"
                 data-room-id="${room.roomId}">
                <div class="table-name">
                    ${room.hasPassword ? '🔒 ' : '🔓 '}${room.roomName}
                </div>
                <div>${room.playerCount}/${room.maxPlayers}</div>
                <div class="stake-val hide-mobile">${room.smallBlind}/${room.bigBlind}</div>
                <div class="hide-mobile">${room.minBuyIn}–${room.maxBuyIn}</div>
                <div class="hide-mobile">${PHASE_LABELS[room.phase] || room.phase}</div>
            </div>
        `).join('');

        tableListContainer.querySelectorAll('.table-row').forEach(row => {
            row.addEventListener('click', () => {
                const room = rooms.find(r => r.roomId === row.dataset.roomId);
                if (room) selectRoom(room);
            });
        });

        if (selectedRoomId) {
            const still = rooms.find(r => r.roomId === selectedRoomId);
            if (still) selectRoom(still);
        }
    }

    function selectRoom(room) {
        selectedRoomId = room.roomId;
        selectedRoom = room;

        document.querySelectorAll('.table-row').forEach(r => {
            r.classList.toggle('active', r.dataset.roomId === room.roomId);
        });

        document.getElementById('detail-table-name').textContent = room.roomName;
        const balanceHint = accountChips != null ? ` | На счёте: ${accountChips} 🪙` : '';
        document.getElementById('buyin-info').textContent =
            `Блайнды: ${room.smallBlind}/${room.bigBlind} | Бай-ин: ${room.minBuyIn}–${room.maxBuyIn} 🪙${balanceHint}`;

        const pwSection = document.getElementById('password-section');
        pwSection.style.display = room.hasPassword ? 'block' : 'none';
        if (!room.hasPassword) document.getElementById('join-password').value = '';

        const buyinSection = document.getElementById('buyin-section');
        buyinSection.style.display = 'block';
        const buyinInput = document.getElementById('join-buyin');
        const maxAffordable = accountChips != null
            ? Math.min(room.maxBuyIn, accountChips)
            : room.maxBuyIn;
        buyinInput.min = room.minBuyIn;
        buyinInput.max = maxAffordable;
        buyinInput.value = Math.min(room.minBuyIn, maxAffordable);
        buyinInput.placeholder = `${room.minBuyIn} – ${maxAffordable}`;
        buyinInput.disabled = maxAffordable < room.minBuyIn;

        document.getElementById('btn-join-table').style.display = 'inline-block';
        document.getElementById('join-error').style.display = 'none';

        renderTableVisual(room);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderTableVisual(room) {
        const visual = document.getElementById('poker-table-visual');
        if (!visual) return;

        const seats = room.seats || [];
        visual.innerHTML = Array.from({ length: room.maxPlayers }, (_, i) => {
            const username = seats[i]?.username;
            const occupied = !!username;
            const label = occupied ? escapeHtml(username) : 'Свободно';
            return `
                <div class="seat lobby-seat-pos-${i} ${occupied ? 'occupied' : 'empty'}">
                    <div class="seat-info">${label}</div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('btn-join-table')?.addEventListener('click', async () => {
        if (!selectedRoom) return;

        const joinError = document.getElementById('join-error');
        const password  = document.getElementById('join-password').value;
        const buyIn     = parseInt(document.getElementById('join-buyin').value);

        joinError.style.display = 'none';

        if (!buyIn || buyIn < selectedRoom.minBuyIn || buyIn > selectedRoom.maxBuyIn) {
            joinError.style.display = 'block';
            joinError.textContent = `Бай-ин: от ${selectedRoom.minBuyIn} до ${selectedRoom.maxBuyIn}`;
            return;
        }
        if (accountChips != null && buyIn > accountChips) {
            joinError.style.display = 'block';
            joinError.textContent = `Недостаточно фишек на счёте (есть ${accountChips} 🪙)`;
            return;
        }
        if (selectedRoom.hasPassword && !password) {
            joinError.style.display = 'block';
            joinError.textContent = 'Введите пароль комнаты';
            return;
        }

        localStorage.setItem('joiningRoom', JSON.stringify({
            roomId: selectedRoom.roomId,
            buyIn,
            password: password || null,
        }));

        window.location.href = `/game?roomId=${selectedRoom.roomId}`;
    });

    loadRooms();
    const refreshInterval = setInterval(loadRooms, 5000);
    window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
}
