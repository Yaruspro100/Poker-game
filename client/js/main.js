/**
 * Главный файл клиента - инициализация всех модулей
 */

import { initLoginForm, initRegistrationForm, updateAuthUI } from './auth/forms.js';
import { initCreateRoomForm } from './utils/create-room.js';
import { initLobby } from './utils/lobby.js';
import { initProfile } from './utils/profile.js';

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    initLoginForm();
    initRegistrationForm();
    initCreateRoomForm();
    initLobby();
    initProfile();
});
