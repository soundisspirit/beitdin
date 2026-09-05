/**
 * Cookie consent gate.
 *
 * Nothing analytics-related may load except through onGrant, which runs only
 * when consent is granted. A decline therefore means the script is never
 * fetched and no cookie is ever set.
 *
 * The answer is kept under the app's apb_ prefix, so "wipe all data" clears it
 * too and the banner comes back, which is the right behaviour for a reset.
 */

const KEY = 'apb_consent';
const GRANTED = 'granted';
const DENIED = 'denied';

let bar = null;
let onGrantFn = () => {};
let grantRan = false;
let wired = false;

export function getConsent() {
  try {
    const v = localStorage.getItem(KEY);
    return v === GRANTED || v === DENIED ? v : null;
  } catch {
    // Private mode or blocked storage: treat as undecided and ask again.
    return null;
  }
}

function remember(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch (e) {
    // If the answer cannot be stored we still honour it for this page view.
    console.warn('could not persist the consent choice', e);
  }
}

function choose(value) {
  remember(value);
  if (bar) bar.hidden = true;

  if (value === GRANTED) {
    if (!grantRan) {
      grantRan = true;
      onGrantFn();
    }
    return;
  }

  // Withdrawing after accepting: the tag is already in this document and
  // stopping it properly means starting over without it.
  if (grantRan) location.reload();
}

/**
 * @param {() => void} onGrant runs once, and only with consent: now if it was
 *        granted before, or when accept is pressed.
 */
export function initConsent(onGrant = () => {}) {
  onGrantFn = onGrant;
  bar = document.getElementById('consentBar');
  if (!bar) return;

  if (!wired) {
    document.getElementById('consentAccept')?.addEventListener('click', () => choose(GRANTED));
    document.getElementById('consentDecline')?.addEventListener('click', () => choose(DENIED));
    // Withdrawing has to be as easy as consenting, so the control is permanent
    // rather than only shown while the banner is up.
    document.getElementById('btnCookieSettings')?.addEventListener('click', openConsentSettings);
    wired = true;
  }

  const decided = getConsent();
  if (decided === GRANTED) {
    bar.hidden = true;
    grantRan = true;
    onGrant();
    return;
  }
  bar.hidden = decided === DENIED;
}

/** Reopens the banner so the current answer can be changed. */
export function openConsentSettings() {
  if (bar) bar.hidden = false;
}
