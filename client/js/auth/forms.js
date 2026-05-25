/**
 * Формы входа и регистрации
 */

import { saveSession, clearSession } from './session.js';

export function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

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
            window.location.href = '/menu';
        } catch {
            loginError.style.display = 'block';
            loginError.textContent = 'Ошибка соединения с сервером';
        }
    });
}

export function initRegistrationForm() {
    const regForm = document.getElementById('registration-form');
    if (!regForm) return;

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
            if (!loginRes.ok) { window.location.href = '/login'; return; }

            saveSession(loginResult.token, loginResult.user);
            window.location.href = '/menu';
        } catch {
            showRegError('Ошибка соединения с сервером');
        }
    });
}

export async function updateAuthUI() {
    const profileNav = document.querySelector('.profile-nav ul');
    if (!profileNav) return;

    const { getToken, fetchCurrentUser, getCurrentUser, clearSession } = await import('./session.js');
    const user = getToken() ? await fetchCurrentUser() : getCurrentUser();

    if (user && getToken()) {
        profileNav.innerHTML = `
        <ul>
            <li><a href="/profile">${user.username} - ${user.chips} 🪙</a></li>
            <li><a href="#" id="logout-btn">Выйти</a></li>
        </ul>
        `;
        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await fetch('/api/auth/logout', { method: 'POST' });
            clearSession();
            window.location.href = '/menu';
        });
    } else {
        profileNav.innerHTML = `
        <ul>
            <li><a href="/registration">Зарегистрироваться</a></li>
            <li><a href="/login">Войти</a></li>
        </ul>
        `;
    }
}
