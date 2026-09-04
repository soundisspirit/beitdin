import { initUI, updateBoardUI } from './ui.js';

function boot() {
  initUI();
  updateBoardUI();
  console.log("API Agent Board initialized.");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
