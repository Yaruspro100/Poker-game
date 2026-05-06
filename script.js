document.addEventListener('DOMContentLoaded', () => {
    // Обновление навигации
    function updateAuthUI() {
        const profileNav = document.querySelector('.profile-nav ul');
        if (!profileNav) return;

        const loggedIn = localStorage.getItem('loggedIn') === 'true';

        if (loggedIn) {
            profileNav.innerHTML = '<li><a href="profile.html">Профиль</a></li>';
        } else {
            profileNav.innerHTML = `
                <li><a href="registration.html">Зарегистрироваться</a></li>
                <li><a href="login.html">Войти</a></li>
            `;
        }
    }

    // Применяем навигацию сразу при загрузке любой страницы
    updateAuthUI();

    // Защита страницы профиля от гостей
    if (window.location.pathname.includes('profile.html')) {
        if (localStorage.getItem('loggedIn') !== 'true') {
            window.location.href = 'login.html';
        }
    }

    // Форма входа
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const loginError = document.getElementById('login-error');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.username || !data.password) {
                if (loginError) {
                    loginError.style.display = 'block';
                    loginError.textContent = 'Заполните все поля';
                }
                return;
            }

            // Здесь должен быть реальный fetch-запрос к серверу
            // fetch('/api/login', { method: 'POST', ... })

            // Имитация успешного входа
            localStorage.setItem('loggedIn', 'true');
            window.location.href = 'menu.html';
        });
    }

    // Форма регистрации
    const regForm = document.getElementById('registration-form');
    if (regForm) {
        const regError = document.getElementById('reg-error');
        regForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(regForm);
            const data = Object.fromEntries(formData.entries());

            if (!data.username || !data.password || !data.password_confirm) {
                showRegError('Заполните все поля');
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

            // Заглушка успешной регистрации
            localStorage.setItem('loggedIn', 'true');
            localStorage.setItem('registeredUser', data.username);
            window.location.href = 'menu.html';
        });

        function showRegError(msg) {
            if (regError) {
                regError.style.display = 'block';
                regError.textContent = msg;
            }
        }
    }

    // Форма создания комнаты
    const createRoomForm = document.getElementById('create-room-form');
    if (createRoomForm) {
        const createRoomError = document.getElementById('create-room-error');

        function showCreateRoomError(msg) {
            if (createRoomError) {
                createRoomError.style.display = 'block';
                createRoomError.textContent = msg;
            }
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
                hasPassword: true
            }));
            window.location.href = 'connect-to-room.html';
        });
    }
});