import { getSlots, saveSlots } from './storage.js';
import { getModels as getOpenAIModels } from './adapters/openai-compat.js';
import { getModels as getGeminiModels } from './adapters/gemini.js';

let currentSlots = getSlots();

export function getActiveSlots() {
  // Return only enabled slots with a selected model
  return currentSlots.filter(s => s.enabled && s.selectedModel);
}

export function getAllSlots() {
  return currentSlots;
}

export function updateSlot(index, updates, shouldRender = true) {
  currentSlots[index] = { ...currentSlots[index], ...updates };
  saveSlots(currentSlots);
  if (shouldRender) {
    renderSettings();
  }
}

/**
 * Testaa yhteyden ja hakee mallit
 */
export async function testSlot(index) {
  const slot = currentSlots[index];
  
  const gs = document.getElementById('globalStatus');
  if (gs) {
    gs.textContent = `Status: PINGING...`;
    gs.classList.add('blinking');
  }
  
  updateSlot(index, { status: 'testing', lastError: null });
  
  try {
    let models = [];
    if (slot.service === 'gemini' || slot.adapterType === 'gemini') {
      models = await getGeminiModels(slot.baseUrl, slot.apiKey);
    } else {
      models = await getOpenAIModels(slot.baseUrl, slot.apiKey);
    }
    
    // fallback if selected model not found
    let selectedModel = slot.selectedModel;
    if (models.length > 0 && !models.includes(selectedModel)) {
      selectedModel = models[0];
    }
    
    updateSlot(index, { 
      status: 'ok', 
      availableModels: models,
      selectedModel: selectedModel,
      lastError: null
    });
    
  } catch (error) {
    console.error(`Slot ${index} test failed:`, error);
    updateSlot(index, { 
      status: 'error', 
      lastError: error.message || 'connection failed'
    });
  }
  
  if (gs) {
    gs.classList.remove('blinking');
    gs.textContent = 'Status: READY';
  }
}

/**
 * Testaa kaikki aktiiviset slotit rinnakkain (global ping)
 */
export async function pingAllSlots() {
  const enabledSlots = currentSlots.filter(s => s.enabled);
  if (enabledSlots.length === 0) return false;
  
  const promises = enabledSlots.map(enabledSlot => {
    const index = currentSlots.findIndex(s => s.slotIndex === enabledSlot.slotIndex);
    if (index !== -1) {
      return testSlot(index);
    }
    return Promise.resolve();
  });
  
  await Promise.allSettled(promises);
  
  const hasErrors = currentSlots.some(s => s.enabled && s.status === 'error');
  return !hasErrors;
}

/**
 * Renderöi asetuspaneelin sisällön
 */
export function renderSettings() {
  currentSlots.forEach((slot, i) => {
    const container = document.getElementById('settings-' + i);
    if (!container) return;
    
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="color: var(--amber); margin: 0;">[lane_${i + 1}_config]</h3>
      </div>
      
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <label style="color:var(--amber-dim);">> provider:</label>
        <div class="term-select" id="service-select-${i}" style="margin-bottom: 0; flex: 1;">
          <div class="term-select-current">${!slot.enabled ? '[disable_lane]' : slot.service === 'gemini' ? 'google_gemini' : slot.service === 'custom' ? 'custom / local' : slot.service === 'mistral' ? 'mistral' : 'openai'}</div>
          <div class="term-options">
            <div class="term-option ${!slot.enabled ? 'selected' : ''}" data-val="disabled">[disable_lane]</div>
            <div class="term-option ${slot.enabled && slot.service === 'openai' ? 'selected' : ''}" data-val="openai">openai</div>
            <div class="term-option ${slot.enabled && slot.service === 'gemini' ? 'selected' : ''}" data-val="gemini">google_gemini</div>
            <div class="term-option ${slot.enabled && slot.service === 'mistral' ? 'selected' : ''}" data-val="mistral">mistral</div>
            <div class="term-option ${slot.enabled && slot.service === 'custom' ? 'selected' : ''}" data-val="custom">custom / local</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display:block; color:var(--amber-dim); margin-bottom:4px;">> endpoint_url:</label>
        <input type="url" id="url-${i}" value="${slot.baseUrl}" ${!slot.enabled ? 'disabled' : ''} style="width: 100%; background: transparent; border: 0; border-bottom: 1px solid var(--frame); color: var(--amber); font: inherit; padding: 4px 0; outline: none; ${!slot.enabled ? 'opacity: 0.3;' : ''}">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display:block; color:var(--amber-dim); margin-bottom:4px;">> api_key:</label>
        <div style="display: flex; gap: 8px;">
          <input type="password" id="key-${i}" value="${slot.apiKey}" placeholder="empty for local models" autocomplete="off" ${!slot.enabled ? 'disabled' : ''} style="flex: 1; min-width: 0; background: transparent; border: 0; border-bottom: 1px solid var(--frame); color: var(--amber); font: inherit; padding: 4px 0; outline: none; ${!slot.enabled ? 'opacity: 0.3;' : ''}">
          <button type="button" id="test-${i}" ${!slot.enabled || slot.status === 'testing' ? 'disabled' : ''} style="${!slot.enabled ? 'opacity: 0.3;' : ''}">${slot.status === 'testing' ? 'testing...' : 'ping'}</button>
        </div>
        ${slot.enabled && slot.status === 'error' ? `<div style="color: var(--red); margin-top: 6px;">[error: ${slot.lastError}]</div>` : ''}
        ${slot.enabled && slot.status === 'ok' ? `<div style="color: var(--amber); margin-top: 6px;">[ok: ${slot.availableModels.length} models found]</div>` : ''}
      </div>
      
      ${!slot.enabled ? '' : slot.status === 'ok' && slot.availableModels.length > 0 ? `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <label style="color:var(--amber-dim);">> model:</label>
        <div class="term-select" id="model-select-${i}" style="margin-bottom: 0; flex: 1;">
          <div class="term-select-current">${slot.selectedModel || 'select model...'}</div>
          <div class="term-options">
            ${slot.availableModels.map(m => `<div class="term-option ${m === slot.selectedModel ? 'selected' : ''}" data-val="${m}">${m}</div>`).join('')}
          </div>
        </div>
      </div>` : `
      <div style="margin-bottom: 16px; color: var(--frame);">
        > model: [requires ping]
      </div>
      `}
    `;
    
    // Wire up service select
    const sSelect = document.getElementById(`service-select-${i}`);
    if (sSelect) {
      sSelect.querySelector('.term-select-current').addEventListener('click', () => {
        sSelect.classList.toggle('open');
      });
      sSelect.querySelectorAll('.term-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          const val = e.target.getAttribute('data-val');
          if (val === 'disabled') {
            updateSlot(i, { enabled: false });
          } else {
            const updates = { 
              enabled: true,
              service: val, 
              status: 'untested',
              availableModels: [],
              selectedModel: ''
            };
            if (val === 'openai') {
              updates.adapterType = 'openai-compat';
              updates.baseUrl = 'https://api.openai.com/v1';
            } else if (val === 'mistral') {
              updates.adapterType = 'openai-compat';
              updates.baseUrl = 'https://api.mistral.ai/v1';
            } else if (val === 'gemini') {
              updates.adapterType = 'gemini';
              updates.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
            } else {
              updates.adapterType = 'openai-compat';
              updates.baseUrl = 'http://localhost:11434/v1';
            }
            updateSlot(i, updates);
          }
        });
      });
    }

    // Wire up model select
    const mSelect = document.getElementById(`model-select-${i}`);
    if (mSelect) {
      mSelect.querySelector('.term-select-current').addEventListener('click', () => {
        mSelect.classList.toggle('open');
      });
      mSelect.querySelectorAll('.term-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          updateSlot(i, { selectedModel: e.target.getAttribute('data-val') });
        });
      });
    }
    
    const urlEl = document.getElementById(`url-${i}`);
    if (urlEl) {
      urlEl.addEventListener('change', (e) => {
        updateSlot(i, { 
          baseUrl: e.target.value.trim(), 
          status: 'untested',
          availableModels: [],
          selectedModel: ''
        });
      });
    }
    
    const keyEl = document.getElementById(`key-${i}`);
    if (keyEl) {
      keyEl.addEventListener('change', (e) => {
        updateSlot(i, { 
          apiKey: e.target.value.trim(), 
          status: 'untested',
          availableModels: [],
          selectedModel: ''
        });
      });
    }
    
    const testEl = document.getElementById(`test-${i}`);
    if (testEl) {
      testEl.addEventListener('click', () => {
        testSlot(i);
      });
    }
  });
}
