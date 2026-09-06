import { initUI, updateBoardUI } from './ui.js';

function boot() {
  initUI();
  updateBoardUI();
  console.log("beitdin initialized.");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
