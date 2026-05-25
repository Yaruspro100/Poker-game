/**
 * Лог событий игры
 */

export function addLog(text, type = 'action') {
    const container = document.getElementById('game-log-entries');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `log-entry ${type === 'win' ? 'log-win' : type === 'system' ? 'log-system' : ''}`;
    div.textContent = text;
    container.appendChild(div);

    container.scrollTop = container.scrollHeight;

    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}
