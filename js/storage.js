/**
 * A small atomic localStorage wrapper.
 * Validates what it reads and falls back to defaults when data is missing
 * or corrupt.
 */

const PREFIX = 'apb_';
const SCHEMA_VERSION = 4;

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

export function getSlots() {
  const data = load('slots', DEFAULT_SLOTS);
  // Ensure array is correct size
  if (!Array.isArray(data) || data.length !== 3) {
    save('slots', DEFAULT_SLOTS);
    return DEFAULT_SLOTS;
  }
  return data;
}

export function saveSlots(slots) {
  save('slots', slots);
}

export function clearKeys() {
  const slots = getSlots();
  const clearedSlots = slots.map(slot => ({
    ...slot,
    apiKey: '',
    status: 'untested',
    lastError: null
  }));
  saveSlots(clearedSlots);
  return clearedSlots;
}

export function wipeAllData() {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(PREFIX)) {
      localStorage.removeItem(key);
    }
  });
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
