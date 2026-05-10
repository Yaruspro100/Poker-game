document.addEventListener('DOMContentLoaded', () => {

    //  Утилиты

    function saveSession(token, user) {
        localStorage.setItem('token', token);
        localStorage.setItem('currentUser', JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
    }

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('currentUser'));
        } catch {
            return null;
        }
    }

    function getToken() {
        return localStorage.getItem('token');
    }

    //  Обновление UI навигации

    async function updateAuthUI() {
        const profileNav = document.querySelector('.profile-nav ul');
        if (!profileNav) return;

        let user = getCurrentUser();

        // Если в localStorage пусто — запрашиваем у сервера
        if (!user) {
            try {
                const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
                if (res.ok) {
                    user = await res.json();
                    localStorage.setItem('currentUser', JSON.stringify(user));
                }
            } catch {}
        }

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
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username: data.username, password: data.password }),
                });
                const result = await response.json();

                if (!response.ok) {
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

        const showRegError = (msg) => {
            regError.style.display = 'block';
            regError.textContent = msg;
        };

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

    const createRoomForm = document.getElementById('create-room-form');
    if (createRoomForm) {
        const createRoomError = document.getElementById('create-room-error');
        const showErr = (msg) => { createRoomError.style.display = 'block'; createRoomError.textContent = msg; };

        createRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(createRoomForm).entries());

            if (!data.room_name || !data.max_players || !data.small_blind ||
                !data.big_blind || !data.min_buyin || !data.max_buyin || !data.room_password) {
                return showErr('Заполните все поля');
            }

            const sb = parseInt(data.small_blind), bb = parseInt(data.big_blind);
            const min = parseInt(data.min_buyin), max = parseInt(data.max_buyin);

            if (sb >= bb) return showErr('Большой блайнд должен быть больше малого');
            if (min > max) return showErr('Максимальный бай-ин не может быть меньше минимального');
            if (min < bb) return showErr('Минимальный бай-ин должен быть не меньше большого блайнда');
            if (data.room_password.length < 4) return showErr('Пароль комнаты должен содержать минимум 4 символа');

            localStorage.setItem('createdRoom', JSON.stringify({
                id: 'room_' + Date.now(), name: data.room_name,
                maxPlayers: data.max_players, smallBlind: sb, bigBlind: bb,
                minBuyin: min, maxBuyin: max, hasPassword: true,
            }));
            window.location.href = '/connect-to-room.html';
        });
    }

    //  Страница профиля

    const isProfilePage = window.location.pathname.endsWith('profile.html');
    if (!isProfilePage) return;

    const btnClaim = document.getElementById('btn-claim');
    const claimTimer = document.getElementById('claim-timer');
    const profileUsername = document.getElementById('profile-username');
    const profileChips = document.getElementById('profile-chips');

    let countdownInterval = null;

    // Показываем сообщение под формой: success или error
    function showMessage(elementId, text, isError = false) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'profile-message ' + (isError ? 'profile-message-error' : 'profile-message-success');
    }

    // Запускаем обратный отсчёт на кнопке получения фишек
    function startCountdown(secondsLeft) {
        btnClaim.disabled = true;
        clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                btnClaim.disabled = false;
                btnClaim.textContent = 'Получить 500 фишек';
                claimTimer.textContent = '';
                return;
            }
            const h = Math.floor(secondsLeft / 3600);
            const m = Math.floor((secondsLeft % 3600) / 60);
            const s = secondsLeft % 60;
            const pad = (n) => String(n).padStart(2, '0');
            claimTimer.textContent = `Следующее получение через: ${pad(h)}:${pad(m)}:${pad(s)}`;
        }, 1000);
    }

    // Загружаем данные профиля с сервера
    async function loadProfile() {
        try {
            const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
            if (!res.ok) return;
            const user = await res.json();

            profileUsername.textContent = user.username;
            profileChips.textContent = `${user.chips} 🪙`;

            // Обновляем localStorage
            const stored = getCurrentUser();
            if (stored) {
                stored.username = user.username;
                stored.chips = user.chips;
                localStorage.setItem('currentUser', JSON.stringify(stored));
            }

            // Проверяем кулдаун для кнопки фишек
            if (user.last_claim_at) {
                const secondsSince = (Date.now() - new Date(user.last_claim_at)) / 1000;
                const secondsLeft = Math.ceil(3600 - secondsSince);
                if (secondsLeft > 0) {
                    btnClaim.textContent = 'Получить 500 фишек';
                    startCountdown(secondsLeft);
                    return;
                }
            }

            // Кулдаун прошёл — кнопка активна
            btnClaim.disabled = false;
            btnClaim.textContent = 'Получить 500 фишек';
        } catch (err) {
            console.error('Ошибка загрузки профиля:', err);
        }
    }
    loadProfile();

    // Получение фишек
    btnClaim.addEventListener('click', async () => {
        btnClaim.disabled = true;
        try {
            const res = await fetch('/api/profile/claim-chips', {
                method: 'POST',
                credentials: 'same-origin',
            });
            const result = await res.json();

            if (!res.ok) {
                // 429 — ещё не прошёл час
                if (result.secondsLeft) startCountdown(result.secondsLeft);
                return;
            }

            // Обновляем отображение фишек
            profileChips.textContent = `${result.chips} 🪙`;
            const stored = getCurrentUser();
            if (stored) {
                stored.chips = result.chips;
                localStorage.setItem('currentUser', JSON.stringify(stored));
            }
            // Обновляем шапку
            updateAuthUI();
            startCountdown(3600);
        } catch (err) {
            console.error('Ошибка получения фишек:', err);
            btnClaim.disabled = false;
        }
    });

    // Смена логина
    document.getElementById('btn-change-username').addEventListener('click', async () => {
        const newUsername = document.getElementById('new-username').value.trim();
        const password = document.getElementById('confirm-password-username').value;

        try {
            const res = await fetch('/api/profile/username', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ newUsername, password }),
            });
            const result = await res.json();

            if (!res.ok) {
                showMessage('username-message', result.error, true);
                return;
            }

            showMessage('username-message', result.message);
            profileUsername.textContent = newUsername;

            // Обновляем localStorage и шапку
            const stored = getCurrentUser();
            if (stored) {
                stored.username = newUsername;
                localStorage.setItem('currentUser', JSON.stringify(stored));
            }
            updateAuthUI();

            document.getElementById('new-username').value = '';
            document.getElementById('confirm-password-username').value = '';
        } catch {
            showMessage('username-message', 'Ошибка соединения', true);
        }
    });

    // Смена пароля
    document.getElementById('btn-change-password').addEventListener('click', async () => {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const newPasswordConfirm = document.getElementById('new-password-confirm').value;

        if (newPassword !== newPasswordConfirm) {
            showMessage('password-message', 'Новые пароли не совпадают', true);
            return;
        }

        try {
            const res = await fetch('/api/profile/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const result = await res.json();

            if (!res.ok) {
                showMessage('password-message', result.error, true);
                return;
            }

            showMessage('password-message', result.message);
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('new-password-confirm').value = '';
        } catch {
            showMessage('password-message', 'Ошибка соединения', true);
        }
    });

    // Удаление аккаунта
    document.getElementById('btn-delete-account').addEventListener('click', async () => {
        const password = document.getElementById('delete-password').value;

        // Дополнительное подтверждение в браузере
        if (!confirm('Вы уверены? Это действие необратимо — аккаунт будет удалён навсегда.')) return;

        try {
            const res = await fetch('/api/profile', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password }),
            });
            const result = await res.json();

            if (!res.ok) {
                showMessage('delete-message', result.error, true);
                return;
            }

            clearSession();
            window.location.href = '/menu.html';
        } catch {
            showMessage('delete-message', 'Ошибка соединения', true);
        }
    });
});