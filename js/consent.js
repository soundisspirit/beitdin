/**
 * Cookie consent gate.
 *
 * Nothing analytics-related may load before this returns 'granted'. The banner
 * is not decoration: onGrant is the only path that runs the loader, so a
 * decline means the script is never fetched and no cookie is ever set.
 *
 * The choice is kept under the app's apb_ prefix, so "wipe all data" clears it
 * too and the banner comes back, which is the right behaviour for a reset.
 */

const KEY = 'apb_consent';
const GRANTED = 'granted';
const DENIED = 'denied';

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
    // If we cannot remember the answer we still honour it for this page view.
    console.warn('could not persist the consent choice', e);
  }
}

/**
 * @param {() => void} onGrant runs once, and only if consent is granted:
 *        now if it was granted earlier, or on the accept click.
 */
export function initConsent(onGrant = () => {}) {
  const bar = document.getElementById('consentBar');
  const decided = getConsent();

  if (decided === GRANTED) {
    onGrant();
    return;
  }
  if (decided === DENIED) return;

  if (!bar) return;
  bar.hidden = false;

  document.getElementById('consentAccept')?.addEventListener('click', () => {
    remember(GRANTED);
    bar.hidden = true;
    onGrant();
  });

  document.getElementById('consentDecline')?.addEventListener('click', () => {
    remember(DENIED);
    bar.hidden = true;
  });
}

/** Clears the stored answer so the banner asks again on the next load. */
export function resetConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('could not clear the consent choice', e);
  }
}
