import { initUI, updateBoardUI } from './ui.js';
import { initTutorial } from './tutorial.js';

function boot() {
  initUI();
  updateBoardUI();
  initTutorial();
  console.log("beitdin initialized.");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
