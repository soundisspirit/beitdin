/**
 * Storage wrapper. Validates what it reads and falls back to defaults when the
 * data is missing or corrupt.
 *
 * Two stores on purpose:
 *   localStorage   lane configuration, which is convenient to keep
 *   sessionStorage the API keys, which are not
 *
 * sessionStorage is scoped to the tab and the browser drops it when the tab
 * closes, so keys never sit on disk waiting to be read by whatever runs on this
 * origin next. The cost is that a returning visitor pastes keys again; their
 * endpoints and model choices are still there.
 */

const PREFIX = 'apb_';
const KEYS_STORE = PREFIX + 'keys';
const SCHEMA_VERSION = 5;

// Default config for 3 slots
const DEFAULT_SLOTS = [
  {
    slotIndex: 0,
    enabled: true,
    service: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    adapterType: 'gemini',
    availableModels: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    selectedModel: 'gemini-1.5-pro',
    status: 'untested',
    lastError: null
  },
  {
    slotIndex: 1,
    enabled: true,
    service: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    adapterType: 'openai-compat',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    selectedModel: 'gpt-4o',
    status: 'untested',
    lastError: null
  },
  {
    slotIndex: 2,
    enabled: true,
    service: 'custom',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    adapterType: 'openai-compat',
    availableModels: [],
    selectedModel: '',
    status: 'untested',
    lastError: null
  }
];

// Always a fresh copy: callers mutate what they get back, and handing out
// DEFAULT_SLOTS itself meant the module constant ended up holding the user's
// API key, which the recovery path below would then persist as the "defaults".
function freshSlots() {
  return structuredClone(DEFAULT_SLOTS);
}

// A slot is only usable if the fields the rest of the app reads are present.
function isUsableSlot(s, i) {
  return s && typeof s === 'object'
    && typeof s.service === 'string'
    && typeof s.adapterType === 'string'
    && typeof s.baseUrl === 'string'
    && Array.isArray(s.availableModels);
}

// Keys are read and written on their own, in the tab-scoped store.
function loadKeys() {
  try {
    const raw = sessionStorage.getItem(KEYS_STORE);
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr) || arr.length !== 3) return ['', '', ''];
    return arr.map(k => (typeof k === 'string' ? k : ''));
  } catch {
    return ['', '', ''];
  }
}

function saveKeys(keys) {
  try {
    // Clearing every key removes the entry rather than storing three empty
    // strings, so "no keys" leaves no trace at all.
    if (keys.every(k => !k)) sessionStorage.removeItem(KEYS_STORE);
    else sessionStorage.setItem(KEYS_STORE, JSON.stringify(keys));
  } catch (e) {
    console.warn('Could not write the API keys to sessionStorage.', e);
  }
}

export function getSlots() {
  const data = load('slots', null);
  if (!Array.isArray(data) || data.length !== 3 || !data.every(isUsableSlot)) {
    const fresh = freshSlots();
    save('slots', fresh);
    return fresh;
  }

  // Anything written by an older version kept the keys on disk. Move them into
  // the tab store and rewrite the persisted copy without them, so upgrading
  // clears the exposure instead of leaving it behind.
  const stranded = data.map(s => (typeof s.apiKey === 'string' ? s.apiKey : ''));
  if (stranded.some(k => k !== '')) {
    saveKeys(stranded);
    save('slots', data.map(s => ({ ...s, apiKey: '' })));
  }

  const keys = loadKeys();
  // slotIndex drives lane routing, so never trust it from storage.
  return data.map((s, i) => ({ ...s, slotIndex: i, apiKey: keys[i] || '' }));
}

export function saveSlots(slots) {
  // The key never reaches localStorage: it is split out here and nowhere else.
  saveKeys(slots.map(s => s.apiKey || ''));
  save('slots', slots.map(s => ({ ...s, apiKey: '' })));
}



function load(keySuffix, defaultValue) {
  try {
    const raw = localStorage.getItem(PREFIX + keySuffix);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`LocalStorage read failed for ${keySuffix}, returning default.`, e);
    return defaultValue;
  }
}

function save(keySuffix, value) {
  try {
    localStorage.setItem(PREFIX + 'schema_version', SCHEMA_VERSION);
    localStorage.setItem(PREFIX + keySuffix, JSON.stringify(value));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert('Your browser local storage is full.');
    }
    console.error(`LocalStorage write failed for ${keySuffix}`, e);
  }
}
