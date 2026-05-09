document.addEventListener('DOMContentLoaded', () => {

    //  Утилиты: работа с сессией
    //  Токен хранится в httpOnly куке (сервер) — JS его не видит и не трогает.
    //  В localStorage храним только данные пользователя
    //  для отображения в UI и передачи в Socket.io.

    function saveSession(token, user) {
        // Токен нужен только для Socket.io — httpOnly куку JS читать не может
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

    function updateAuthUI() {
        const profileNav = document.querySelector('.profile-nav ul');
        if (!profileNav) return;

        const user = getCurrentUser();

        if (user && getToken()) {
            profileNav.innerHTML = `
                <li><a href="/profile.html">${user.username} (${user.chips} 🪙)</a></li>
                <li><a href="#" id="logout-btn">Выйти</a></li>
            `;
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    // Говорим серверу очистить httpOnly куку
                    await fetch('/api/auth/logout', { method: 'POST' });
                    clearSession();
                    window.location.href = '/menu.html';
                });
            }
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

            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.username || !data.password) {
                loginError.style.display = 'block';
                loginError.textContent = 'Заполните все поля';
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // credentials: 'same-origin' — браузер сохранит куку из ответа
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        username: data.username,
                        password: data.password,
                    }),
                });

                const result = await response.json();

                if (!response.ok) {
                    loginError.style.display = 'block';
                    loginError.textContent = result.error || 'Ошибка входа';
                    return;
                }

                // Сохраняем данные для UI и Socket.io
                saveSession(result.token, result.user);
                window.location.href = '/menu.html';

            } catch (err) {
                loginError.style.display = 'block';
                loginError.textContent = 'Ошибка соединения с сервером';
                console.error('Ошибка входа:', err);
            }
        });
    }

    //  Форма регистрации

    const regForm = document.getElementById('registration-form');
    if (regForm) {
        const regError = document.getElementById('reg-error');

        function showRegError(msg) {
            regError.style.display = 'block';
            regError.textContent = msg;
        }

        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            regError.style.display = 'none';

            const formData = new FormData(regForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.username || !data.password || !data.password_confirm) {
                showRegError('Заполните все поля');
                return;
            }
            if (data.username.length < 3 || data.username.length > 20) {
                showRegError('Логин должен быть от 3 до 20 символов');
                return;
            }
            if (data.password !== data.password_confirm) {
                showRegError('Пароли не совпадают');
                return;
            }
            if (data.password.length < 6) {
                showRegError('Пароль должен содержать минимум 6 символов');
                return;
            }

            try {
                // Шаг 1: Регистрация
                const regResponse = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: data.username,
                        password: data.password,
                    }),
                });

                const regResult = await regResponse.json();

                if (!regResponse.ok) {
                    showRegError(regResult.error || 'Ошибка регистрации');
                    return;
                }

                // Шаг 2: Автоматический вход после регистрации
                const loginResponse = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        username: data.username,
                        password: data.password,
                    }),
                });

                const loginResult = await loginResponse.json();

                if (!loginResponse.ok) {
                    window.location.href = '/login.html';
                    return;
                }

                saveSession(loginResult.token, loginResult.user);
                window.location.href = '/menu.html';

            } catch (err) {
                showRegError('Ошибка соединения с сервером');
                console.error('Ошибка регистрации:', err);
            }
        });
    }

    //  Форма создания комнаты

    const createRoomForm = document.getElementById('create-room-form');
    if (createRoomForm) {
        const createRoomError = document.getElementById('create-room-error');

        function showCreateRoomError(msg) {
            createRoomError.style.display = 'block';
            createRoomError.textContent = msg;
        }

        createRoomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(createRoomForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.room_name || !data.max_players || !data.small_blind ||
                !data.big_blind || !data.min_buyin || !data.max_buyin || !data.room_password) {
                showCreateRoomError('Заполните все поля');
                return;
            }

            const smallBlind = parseInt(data.small_blind);
            const bigBlind = parseInt(data.big_blind);
            const minBuyin = parseInt(data.min_buyin);
            const maxBuyin = parseInt(data.max_buyin);

            if (smallBlind >= bigBlind) {
                showCreateRoomError('Большой блайнд должен быть больше малого');
                return;
            }
            if (minBuyin > maxBuyin) {
                showCreateRoomError('Максимальный бай-ин не может быть меньше минимального');
                return;
            }
            if (minBuyin < bigBlind) {
                showCreateRoomError('Минимальный бай-ин должен быть не меньше большого блайнда');
                return;
            }
            if (data.room_password.length < 4) {
                showCreateRoomError('Пароль комнаты должен содержать минимум 4 символа');
                return;
            }

            const roomId = 'room_' + Date.now();
            localStorage.setItem('createdRoom', JSON.stringify({
                id: roomId,
                name: data.room_name,
                maxPlayers: data.max_players,
                smallBlind,
                bigBlind,
                minBuyin,
                maxBuyin,
                hasPassword: true,
            }));
            window.location.href = '/connect-to-room.html';
        });
    }
});