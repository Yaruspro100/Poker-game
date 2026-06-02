import { getToken, clearSession } from './session.js';

let eventSource = null;

export function startSessionMonitor() {
    // Не запускаем если нет токена (страницы /login, /registration)
    if (!getToken()) return;

    // Если уже запущен — не дублируем
    if (eventSource) return;

    // БАГ 2 ИСПРАВЛЕН: присваиваем во внешнюю переменную, не const
    eventSource = new EventSource('/api/session/stream');

    // БАГ 1 ИСПРАВЛЕН: слушаем 'session-kicked', а не 'kick'
    eventSource.addEventListener('session-kicked', (event) => {
        try {
            const data = JSON.parse(event.data);
            alert(data.reason || 'Вы вошли в аккаунт с другого устройства. Сессия завершена.');
        } catch {
            alert('Вы вошли в аккаунт с другого устройства. Сессия завершена.');
        }

        clearSession();
        stopSessionMonitor();
        window.location.href = '/login';
    });

    eventSource.onerror = () => {
        // Тихо — EventSource сам переподключится
    };
}

export function stopSessionMonitor() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}