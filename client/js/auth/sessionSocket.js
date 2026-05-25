/**
 * Монитор сессии через Socket.io.
 * Подключается на всех страницах и слушает событие session-kicked.
 * При получении — автоматически редиректит на /login.
 */
import { clearSession, getToken } from './session.js';

let socket = null;
let fallbackInterval = null;

function redirectToMenu(reason) {
  clearSession();
  const path = window.location.pathname;

  // Не трогаем страницы логина/регистрации — они и так публичные
  if (path === '/login' || path === '/registration') return;

  // Если уже на меню — просто перезагружаем, чтобы updateAuthUI()
  // перерисовал шапку (убрал имя пользователя, показал "Войти")
  if (path === '/' || path === '/menu') {
    alert(reason || 'Сессия завершена.');
    window.location.reload();
    return;
  }

  // Со всех остальных страниц — редирект в меню
  alert(reason || 'Сессия завершена.');
  window.location.href = '/menu';
}

export function startSessionSocket() {
  const token = getToken();
  if (!token) return; // Не подключаться если не авторизован

  // Не подключаться на странице логина/регистрации
  const path = window.location.pathname;
  if (path === '/login' || path === '/registration') return;

  // На странице /game уже есть свой Socket.io (в main-game.js)
  // Там session-kicked обрабатывается отдельно — не дублируем
  if (path === '/game') return;

  // Подключаем Socket.io только для мониторинга
  if (typeof io === 'undefined') return; // Socket.io не загружен

  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  // Мгновенный кик от сервера
  socket.on('session-kicked', (data) => {
    redirectToMenu(data?.reason || 'Выполнен вход с другого устройства');
  });

  // Если сервер отклонил подключение (токен невалидный)
  socket.on('connect_error', (err) => {
  if (err.message && (
    err.message.includes('Session expired') ||
    err.message.includes('Authentication error')
  )) {
    redirectToMenu('Сессия завершена: выполнен вход с другого устройства.');
  }
});

  socket.on('disconnect', () => {
    // Соединение потеряно — запускаем fallback polling
    startFallbackPolling();
  });

  socket.on('connect', () => {
    // Соединение восстановлено — убираем fallback
    stopFallbackPolling();
  });
}

/**
 * Fallback: если Socket.io отвалился, проверяем сессию через HTTP.
 * Раз в 60 секунд — минимальная нагрузка.
 */
function startFallbackPolling() {
  if (fallbackInterval) return;
  fallbackInterval = setInterval(async () => {
    if (!getToken()) { stopFallbackPolling(); return; }
    try {
      const res = await fetch('/api/profile/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (res.status === 401) {
        stopFallbackPolling();
        redirectToMenu('Сессия завершена: выполнен вход с другого устройства.');
      }
    } catch {
      // Сетевая ошибка — пробуем в следующий раз
    }
  }, 60000); // 60 секунд
}

function stopFallbackPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}

export function stopSessionSocket() {
  stopFallbackPolling();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}