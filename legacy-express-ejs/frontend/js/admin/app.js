import { apiFetch } from '../modules/api.js';
import { initReservationsTab, loadReservations } from './reservations.js';
import { initGalleryTab, loadGallery } from './gallery.js';
import { initHoursTab, loadHoursTab } from './hours.js';

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginFeedback = document.getElementById('login-feedback');
const logoutBtn = document.getElementById('logout-btn');
const adminUsernameEl = document.getElementById('admin-username');

const TAB_LOADERS = {
  reservations: loadReservations,
  gallery: loadGallery,
  hours: loadHoursTab,
};
const loadedTabs = new Set();

function initTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

async function switchTab(key) {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    const isActive = tab.dataset.tab === key;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  document.querySelectorAll('.admin-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${key}`;
  });

  if (!loadedTabs.has(key)) {
    loadedTabs.add(key);
    await TAB_LOADERS[key]();
  }
}

function showDashboard(username) {
  loginView.hidden = true;
  dashboardView.hidden = false;
  adminUsernameEl.textContent = username;
  switchTab('reservations');
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  loadedTabs.clear();
}

async function checkSession() {
  try {
    const data = await apiFetch('/auth/me');
    showDashboard(data.username);
  } catch (err) {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginFeedback.textContent = '';
  loginFeedback.className = 'form-feedback';

  const username = loginForm.username.value.trim();
  const password = loginForm.password.value;

  try {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { username, password } });
    showDashboard(data.username);
    loginForm.reset();
  } catch (err) {
    loginFeedback.textContent = err.message;
    loginFeedback.classList.add('error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (_) {
    // ignore
  }
  showLogin();
});

initTabs();
initReservationsTab();
initGalleryTab();
initHoursTab();
checkSession();
