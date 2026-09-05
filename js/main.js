import { initUI, updateBoardUI } from './ui.js';
import { initConsent } from './consent.js';

// The single place analytics may ever be loaded from. It runs only when the
// visitor has accepted, so adding a tag here cannot leak past a decline.
//
// Google Analytics is not wired up yet. When it is, two things have to happen
// together or it will silently fail: put the gtag loader in this function, and
// add https://www.googletagmanager.com to script-src in the CSP meta tag in
// index.html. The current policy is script-src 'self' and will block it.
function loadAnalytics() {
  // no analytics configured yet
}

function boot() {
  initUI();
  updateBoardUI();
  initConsent(loadAnalytics);
  console.log("API Agent Board initialized.");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
