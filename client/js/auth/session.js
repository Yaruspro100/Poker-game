/**
 * Управление сессией пользователя
 */

export function saveSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('currentUser', JSON.stringify(user));
}

export function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
}

export function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); }
    catch { return null; }
}

export function getToken() {
    return localStorage.getItem('token');
}

export function saveUserFromApi(user) {
    localStorage.setItem('currentUser', JSON.stringify({
        id: user.id,
        username: user.username,
        chips: user.chips,
    }));
}

export async function fetchCurrentUser() {
    if (!getToken()) return getCurrentUser();
    try {
        const res = await fetch('/api/profile/me', { credentials: 'same-origin' });
        if (res.status === 401) {
            clearSession();
            return null;
        }
        if (!res.ok) return getCurrentUser();
        const user = await res.json();
        saveUserFromApi(user);
        return user;
    } catch {
        return getCurrentUser();
    }
}
