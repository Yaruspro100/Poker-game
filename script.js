document.addEventListener('DOMContentLoaded', () => {

    //  Утилиты сессии

    function saveSession(token, user) {
        localStorage.setItem('token', token);
        localStorage.setItem('currentUser', JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
    }

    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('currentUser')); }
        catch { return null; }
    }

    function getToken() {
        return localStorage.getItem('token');
    }

    //  Навигация

    function saveUserFromApi(user) {
        localStorage.setItem('currentUser', JSON.stringify({
            id: user.id,
            username: user.username,
            chips: user.chips,
        }));
    }

    async function fetchCurrentUser() {
        if (!getToken()) return getCurrentUser();
        try {
            const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
            if (!res.ok) return getCurrentUser();
            const user = await res.json();
            saveUserFromApi(user);
            return user;
        } catch {
            return getCurrentUser();
        }
    }

    async function updateAuthUI() {
        const profileNav = document.querySelector('.profile-nav ul');
        if (!profileNav) return;

        const user = getToken() ? await fetchCurrentUser() : getCurrentUser();

        if (user && getToken()) {
            profileNav.innerHTML = `
            <ul>
                <li><a href="/profile.html">${user.username} - ${user.chips} 🪙</a></li>
                <li><a href="#" id="logout-btn">Выйти</a></li>
            </ul>
            `;
            document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
                e.preventDefault();
                await fetch('/api/auth/logout', { method: 'POST' });
                clearSession();
                window.location.href = '/menu.html';
            });
        } else {
            profileNav.innerHTML = `
            <ul>
                <li><a href="/registration.html">Зарегистрироваться</a></li>
                <li><a href="/login.html">Войти</a></li>
            </ul>
            `;
        }
    }
    updateAuthUI();

    //  Форма входа

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const loginError = document.getElementById('login-error');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.style.display = 'none';
            const data = Object.fromEntries(new FormData(loginForm).entries());

            if (!data.username || !data.password) {
                loginError.style.display = 'block';
                loginError.textContent = 'Заполните все поля';
                return;
            }

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username: data.username, password: data.password }),
                });
                const result = await res.json();

                if (!res.ok) {
                    loginError.style.display = 'block';
                    loginError.textContent = result.error || 'Ошибка входа';
                    return;
                }

                saveSession(result.token, result.user);
                window.location.href = '/menu.html';
            } catch {
                loginError.style.display = 'block';
                loginError.textContent = 'Ошибка соединения с сервером';
            }
        });
    }

    //  Форма регистрации

    const regForm = document.getElementById('registration-form');
    if (regForm) {
        const regError = document.getElementById('reg-error');
        const showRegError = (msg) => { regError.style.display = 'block'; regError.textContent = msg; };

        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            regError.style.display = 'none';
            const data = Object.fromEntries(new FormData(regForm).entries());

            if (!data.username || !data.password || !data.password_confirm) return showRegError('Заполните все поля');
            if (data.username.length < 3 || data.username.length > 20) return showRegError('Логин должен быть от 3 до 20 символов');
            if (data.password !== data.password_confirm) return showRegError('Пароли не совпадают');
            if (data.password.length < 6) return showRegError('Пароль должен содержать минимум 6 символов');

            try {
                const regRes = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: data.username, password: data.password }),
                });
                const regResult = await regRes.json();
                if (!regRes.ok) return showRegError(regResult.error || 'Ошибка регистрации');

                const loginRes = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username: data.username, password: data.password }),
                });
                const loginResult = await loginRes.json();
                if (!loginRes.ok) { window.location.href = '/login.html'; return; }

                saveSession(loginResult.token, loginResult.user);
                window.location.href = '/menu.html';
            } catch {
                showRegError('Ошибка соединения с сервером');
            }
        });
    }

    //  Форма создания комнаты
    //  POST /api/rooms/create → получаем roomId
    //  → переходим в лобби

    const createRoomForm = document.getElementById('create-room-form');
    if (createRoomForm) {
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

                // Переходим в лобби — там будет наша комната
                localStorage.setItem('joiningRoom', JSON.stringify({
                    roomId: result.roomId,
                    buyIn: min, // минимальный бай-ин по умолчанию
                    password: data.room_password || null,
                }));
                if (me) saveUserFromApi(me);
                window.location.href = `/game.html?roomId=${result.roomId}`;

            } catch {
                showErr('Ошибка соединения с сервером');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Создать комнату';
            }
        });
    }

    //  Лобби: список комнат

    const tableListContainer = document.getElementById('table-list-container');
    if (tableListContainer) {
        let selectedRoomId = null;
        let selectedRoom = null;
        let accountChips = null;

        fetchCurrentUser().then((user) => {
            if (user?.chips != null) accountChips = user.chips;
            updateAuthUI();
        });

        const PHASE_LABELS = {
            waiting: 'Ожидание', preflop: 'Префлоп', flop: 'Флоп',
            turn: 'Тёрн', river: 'Ривер', showdown: 'Шоудаун', ended: 'Пауза',
        };

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
                        Нет активных комнат. <a href="/create-room.html">Создайте первую!</a>
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
                    <div>
                        <button class="btn-join-small" data-room-id="${room.roomId}">Войти</button>
                    </div>
                </div>
            `).join('');

            tableListContainer.querySelectorAll('.table-row').forEach(row => {
                row.addEventListener('click', () => {
                    const room = rooms.find(r => r.roomId === row.dataset.roomId);
                    if (room) selectRoom(room);
                });
            });

            tableListContainer.querySelectorAll('.btn-join-small').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const room = rooms.find(r => r.roomId === btn.dataset.roomId);
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

        function renderTableVisual(room) {
            const visual = document.getElementById('poker-table-visual');
            const positions = [
                { top: '80%', left: '50%' }, { top: '68%', left: '15%' },
                { top: '40%', left: '5%'  }, { top: '15%', left: '15%' },
                { top: '5%',  left: '38%' }, { top: '5%',  left: '62%' },
                { top: '15%', left: '82%' }, { top: '40%', left: '90%' },
                { top: '68%', left: '82%' },
            ];

            visual.innerHTML = positions.slice(0, room.maxPlayers).map((pos, i) => `
                <div class="seat" style="top:${pos.top};left:${pos.left};">
                    <div class="seat-avatar" style="
                        background:${i < room.playerCount ? '#268751' : '#333'};
                        border-color:${i < room.playerCount ? '#4ade80' : 'rgba(255,255,255,0.3)'};"></div>
                    <div class="seat-info">${i < room.playerCount ? '●' : '○'}</div>
                </div>
            `).join('');
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

            // Сохраняем параметры входа — game.js заберёт их при подключении
            localStorage.setItem('joiningRoom', JSON.stringify({
                roomId: selectedRoom.roomId,
                buyIn,
                password: password || null,
            }));

            window.location.href = `/game.html?roomId=${selectedRoom.roomId}`;
        });

        loadRooms();
        const refreshInterval = setInterval(loadRooms, 5000);
        window.addEventListener('beforeunload', () => clearInterval(refreshInterval));
    }

    //  Страница профиля

    if (!window.location.pathname.endsWith('profile.html')) return;

    const btnClaim        = document.getElementById('btn-claim');
    const claimTimer      = document.getElementById('claim-timer');
    const profileUsername = document.getElementById('profile-username');
    const profileChips    = document.getElementById('profile-chips');
    let countdownInterval = null;

    function showMessage(elementId, text, isError = false) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'profile-message ' + (isError ? 'profile-message-error' : 'profile-message-success');
    }

    function startCountdown(secondsLeft) {
        btnClaim.disabled = true;
        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                btnClaim.disabled = false;
                btnClaim.textContent = 'Получить 500 фишек 🎁';
                claimTimer.textContent = '';
                return;
            }
            const h = Math.floor(secondsLeft / 3600);
            const m = Math.floor((secondsLeft % 3600) / 60);
            const s = secondsLeft % 60;
            const pad = n => String(n).padStart(2, '0');
            claimTimer.textContent = `Следующее получение через: ${pad(h)}:${pad(m)}:${pad(s)}`;
        }, 1000);
    }

    async function loadProfile() {
        try {
            const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
            if (!res.ok) return;
            const user = await res.json();
            profileUsername.textContent = user.username;
            profileChips.textContent = `${user.chips} 🪙`;
            saveUserFromApi(user);
            if (user.last_claim_at) {
                const sl = Math.ceil(3600 - (Date.now() - new Date(user.last_claim_at)) / 1000);
                if (sl > 0) { btnClaim.textContent = 'Получить 500 фишек 🎁'; startCountdown(sl); return; }
            }
            btnClaim.disabled = false;
            btnClaim.textContent = 'Получить 500 фишек 🎁';
        } catch {}
    }
    loadProfile();

    btnClaim.addEventListener('click', async () => {
        btnClaim.disabled = true;
        try {
            const res = await fetch('/api/profile/claim-chips', { method: 'POST', credentials: 'same-origin' });
            const result = await res.json();
            if (!res.ok) { if (result.secondsLeft) startCountdown(result.secondsLeft); return; }
            profileChips.textContent = `${result.chips} 🪙`;
            const stored = getCurrentUser();
            if (stored) saveUserFromApi({ ...stored, chips: result.chips });
            updateAuthUI();
            startCountdown(3600);
        } catch { btnClaim.disabled = false; }
    });

    document.getElementById('btn-change-username')?.addEventListener('click', async () => {
        const newUsername = document.getElementById('new-username').value.trim();
        const password    = document.getElementById('confirm-password-username').value;
        try {
            const res = await fetch('/api/profile/username', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ newUsername, password }) });
            const result = await res.json();
            if (!res.ok) { showMessage('username-message', result.error, true); return; }
            showMessage('username-message', result.message);
            profileUsername.textContent = newUsername;
            const stored = getCurrentUser();
            if (stored) saveUserFromApi({ ...stored, username: newUsername });
            updateAuthUI();
            document.getElementById('new-username').value = '';
            document.getElementById('confirm-password-username').value = '';
        } catch { showMessage('username-message', 'Ошибка соединения', true); }
    });

    document.getElementById('btn-change-password')?.addEventListener('click', async () => {
        const cp = document.getElementById('current-password').value;
        const np = document.getElementById('new-password').value;
        const nc = document.getElementById('new-password-confirm').value;
        if (np !== nc) { showMessage('password-message', 'Новые пароли не совпадают', true); return; }
        try {
            const res = await fetch('/api/profile/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ currentPassword: cp, newPassword: np }) });
            const result = await res.json();
            if (!res.ok) { showMessage('password-message', result.error, true); return; }
            showMessage('password-message', result.message);
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('new-password-confirm').value = '';
        } catch { showMessage('password-message', 'Ошибка соединения', true); }
    });

    document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
        const password = document.getElementById('delete-password').value;
        if (!confirm('Вы уверены? Это действие необратимо.')) return;
        try {
            const res = await fetch('/api/profile', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password }) });
            const result = await res.json();
            if (!res.ok) { showMessage('delete-message', result.error, true); return; }
            clearSession();
            window.location.href = '/menu.html';
        } catch { showMessage('delete-message', 'Ошибка соединения', true); }
    });
});