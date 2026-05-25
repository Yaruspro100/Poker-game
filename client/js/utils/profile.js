/**
 * Страница профиля
 */

import { getCurrentUser, saveUserFromApi, clearSession } from '../auth/session.js';
import { updateAuthUI } from '../auth/forms.js';

export function initProfile() {
    if (!window.location.pathname.endsWith('profile')) return;

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
            window.location.href = '/menu';
        } catch { showMessage('delete-message', 'Ошибка соединения', true); }
    });
}
