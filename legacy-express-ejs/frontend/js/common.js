import { initNav } from './modules/nav.js';

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

initNav();
