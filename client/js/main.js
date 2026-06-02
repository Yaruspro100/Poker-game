/**
 * Главный файл клиента - инициализация всех модулей
 */

import { initLoginForm, initRegistrationForm, updateAuthUI } from './auth/forms.js';
import { initCreateRoomForm } from './utils/createRoom.js';
import { initLobby } from './utils/lobby.js';
import { initProfile } from './utils/profile.js';
import { startSessionMonitor } from './auth/sessionMonitor.js';

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    initLoginForm();
    initRegistrationForm();
    initCreateRoomForm();
    initLobby();
    initProfile();
    startSessionMonitor();
});