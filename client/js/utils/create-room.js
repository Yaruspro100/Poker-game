/**
 * Форма создания комнаты
 */

import { fetchCurrentUser, saveUserFromApi } from '../auth/session.js';

export function initCreateRoomForm() {
    const createRoomForm = document.getElementById('create-room-form');
    if (!createRoomForm) return;

    const createRoomError = document.getElementById('create-room-error');
    const showErr = (msg) => { createRoomError.style.display = 'block'; createRoomError.textContent = msg; };

    createRoomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        createRoomError.style.display = 'none';

        const data = Object.fromEntries(new FormData(createRoomForm).entries());
        const sb = parseInt(data.small_blind);
        const bb = parseInt(data.big_blind);
        const min = parseInt(data.min_buyin);
        const max = parseInt(data.max_buyin);

        if (!data.room_name) return showErr('Введите название комнаты');
        if (sb >= bb) return showErr('Большой блайнд должен быть больше малого');
        if (min > max) return showErr('Максимальный бай-ин не может быть меньше минимального');
        if (min < bb) return showErr('Минимальный бай-ин должен быть не меньше большого блайнда');
        if (data.room_password && data.room_password.length < 4) {
            return showErr('Пароль комнаты должен содержать минимум 4 символа');
        }

        const submitBtn = createRoomForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Создание...';

        try {
            const me = await fetchCurrentUser();
            if (me && min > me.chips) {
                showErr(`Недостаточно фишек на счёте (есть ${me.chips} 🪙, нужно минимум ${min})`);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Создать комнату';
                return;
            }

            const res = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    roomName:   data.room_name,
                    maxPlayers: parseInt(data.max_players),
                    smallBlind: sb,
                    bigBlind:   bb,
                    minBuyIn:   min,
                    maxBuyIn:   max,
                    password:   data.room_password || null,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                showErr(result.error || 'Ошибка создания комнаты');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Создать комнату';
                return;
            }

            localStorage.setItem('joiningRoom', JSON.stringify({
                roomId: result.roomId,
                buyIn: min,
                password: data.room_password || null,
            }));
            if (me) saveUserFromApi(me);
            window.location.href = `/game?roomId=${result.roomId}`;

        } catch {
            showErr('Ошибка соединения с сервером');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать комнату';
        }
    });
}
