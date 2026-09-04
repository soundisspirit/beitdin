import { getBoards, saveBoards, runBoard, cancelRun, addCustomBoard, deleteCustomBoard, isBuiltInBoard } from './orchestrator.js';
import { getActiveSlots, renderSettings, getAllSlots, pingAllSlots } from './slots.js';
import { clearKeys } from './storage.js';
import { LOGOS, startTamagotchis } from './logos.js';

let settingsMode = false;
let aboutMode = false;
let rolesMode = false;


let latestMarkdown = null;

// UI buffers for rAF batching
const laneBuffers = ['', '', ''];
const laneElements = [
  document.getElementById('content-0'),
  document.getElementById('content-1'),
  document.getElementById('content-2')
];
const statusElements = [
  document.getElementById('status-0'),
  document.getElementById('status-1'),
  document.getElementById('status-2')
];
const roleElements = [
  document.getElementById('role-0'),
  document.getElementById('role-1'),
  document.getElementById('role-2')
];

let rAF_id = null;

// Board state
let currentBoardId = 'architecture';

export function initUI() {
  renderBoardSelect();

  const bSelect = document.getElementById('board-select-wrapper');
  if (bSelect) {
    bSelect.querySelector('.term-select-current').addEventListener('click', () => {
      bSelect.classList.toggle('open');
    });
  }


  for (let i = 0; i < 3; i++) {
    const titleEl = document.getElementById('role-title-' + i);
    const focusEl = document.getElementById('role-focus-' + i);
    
    const updateRole = () => {
      const boards = getBoards();
      const b = boards[currentBoardId];
      if (b && b.roles[i]) {
        if (titleEl) b.roles[i].title = titleEl.value;
        if (focusEl) b.roles[i].focus = focusEl.value;
        saveBoards(boards);
        updateBoardUI(); // refresh the headers
      }
    };
    
    if (titleEl) {
      titleEl.addEventListener('input', updateRole);
    }
    if (focusEl) {
      focusEl.addEventListener('input', updateRole);
    }
  }

  
  // Modals
  
  
  
  document.getElementById('btnShuffleRoles')?.addEventListener('click', () => {
    const boards = getBoards();
    const board = boards[currentBoardId];
    if (board && board.roles && board.roles.length > 1) {
      for (let i = board.roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [board.roles[i], board.roles[j]] = [board.roles[j], board.roles[i]];
      }
      saveBoards(boards);
      updateBoardUI();
      
      const gs = document.getElementById('globalStatus');
      gs.textContent = "success: roles shuffled";
      gs.style.color = 'var(--amber)';
      setTimeout(() => { gs.textContent = 'Status: READY'; gs.style.color = ''; }, 3000);
    }
  });

  document.getElementById('btnRoles')?.addEventListener('click', (e) => {
    if (settingsMode) { document.getElementById('btnSettings').click(); }
    if (aboutMode) { document.getElementById('btnAbout').click(); }
    rolesMode = !rolesMode;
    if (rolesMode) {
      e.target.textContent = 'close_roles';
      updateBoardUI(); // ensure inputs are populated
      const topBar = document.getElementById('rolesTopBar');
      if (topBar) topBar.style.display = 'flex';
      const pA = document.getElementById('promptArea');
      const pF = document.getElementById('promptFooter');
      if (pA) pA.style.visibility = 'hidden';
      if (pF) pF.style.visibility = 'hidden';
      
      for (let i = 0; i < 3; i++) {
        const c = document.getElementById('content-'+i);
        const r = document.getElementById('roles-'+i);
        if (c) c.style.display = 'none';
        if (r) r.style.display = 'block';
      }
    } else {
      e.target.textContent = 'roles';
      const topBar = document.getElementById('rolesTopBar');
      if (topBar) topBar.style.display = 'none';
      const pA = document.getElementById('promptArea');
      const pF = document.getElementById('promptFooter');
      if (pA) pA.style.visibility = 'visible';
      if (pF) pF.style.visibility = 'visible';
      
      for (let i = 0; i < 3; i++) {
        const c = document.getElementById('content-'+i);
        const r = document.getElementById('roles-'+i);
        if (c) c.style.display = 'block';
        if (r) r.style.display = 'none';
      }
    }
  });

  
  document.getElementById('homeLogo')?.addEventListener('click', () => {
    if (settingsMode) document.getElementById('btnSettings').click();
    if (aboutMode) document.getElementById('btnAbout').click();
    if (rolesMode) document.getElementById('btnRoles').click();
    
    // Optionally clear prompt? "lähtötilas" probably just means closing tabs.
    // If they want to clear the prompt: document.getElementById('briefInput').value = '';
    
    const gs = document.getElementById('globalStatus');
    gs.textContent = "Status: READY";
    gs.style.color = '';
  });

  document.getElementById('btnAbout')?.addEventListener('click', (e) => {
    if (settingsMode) { document.getElementById('btnSettings').click(); }
    if (rolesMode) { document.getElementById('btnRoles').click(); }
    aboutMode = !aboutMode;
    if (aboutMode) {
      e.target.textContent = 'close_about';
      for (let i = 0; i < 3; i++) {
        const c = document.getElementById('content-'+i);
        const a = document.getElementById('about-'+i);
        if (c) c.style.display = 'none';
        if (a) a.style.display = 'block';
      }
    } else {
      e.target.textContent = 'about';
      for (let i = 0; i < 3; i++) {
        const c = document.getElementById('content-'+i);
        const a = document.getElementById('about-'+i);
        if (c) c.style.display = 'block';
        if (a) a.style.display = 'none';
      }
    }
  });

  document.getElementById('btnSettings').addEventListener('click', (e) => {
    if (aboutMode) { document.getElementById('btnAbout').click(); }
    if (rolesMode) { document.getElementById('btnRoles').click(); }
    settingsMode = !settingsMode;
    if (settingsMode) {
      e.target.textContent = 'close_settings';
      renderSettings();
      for (let i=0; i<3; i++) {
        const c = document.getElementById('content-'+i);
        const s = document.getElementById('settings-'+i);
        if(c) c.style.display = 'none';
        if(s) s.style.display = 'block';
      }
    } else {
      e.target.textContent = 'settings';
      updateBoardUI(); // ensure names and logos are updated
      for (let i=0; i<3; i++) {
        const c = document.getElementById('content-'+i);
        const s = document.getElementById('settings-'+i);
        if(c) c.style.display = 'block';
        if(s) s.style.display = 'none';
      }
    }
  });
  
    
  document.querySelectorAll('.close-dialog').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dialogId = e.target.getAttribute('data-dialog');
      const d = document.getElementById(dialogId); if(d.tagName==='DIALOG'){d.close();}else{d.classList.remove('open');}
    });
  });

  

  

  

  // Global Ping
  document.getElementById('btnPingAll').addEventListener('click', async () => {
    const btn = document.getElementById('btnPingAll');
    btn.textContent = 'pinging...';
    btn.disabled = true;
    
    // Dynamic import
    const { pingAllSlots } = await import('./slots.js');
    const success = await pingAllSlots();
    
    if (success) {
      btn.textContent = 'ping_ok';
      btn.style.color = 'var(--amber)';
    } else {
      btn.textContent = 'ping_fail';
      btn.style.color = 'var(--red)';
    }
    
    setTimeout(() => {
      btn.textContent = 'ping_all_slots';
      btn.style.color = '';
      btn.disabled = false;
    }, 3000);
  });

  // Brief length counter
  const briefInput = document.getElementById('briefInput');
  briefInput.addEventListener('input', () => {
    const len = briefInput.value.length;
    document.getElementById('charCount').textContent = `${len} / 12000 char`;
    
    if (len > 12000) {
      briefInput.value = briefInput.value.substring(0, 12000);
    }
  });

  
  // Run / Cancel
  document.getElementById('btnRun').addEventListener('click', startRun);
  document.getElementById('btnCancel').addEventListener('click', () => {
    cancelRun();
  });
  
  
  document.getElementById('btnClearRuns')?.addEventListener('click', () => {
    latestMarkdown = null;
    
    // Clear UI lanes text content
    laneBuffers.fill('');
    laneElements.forEach(el => {
      if(el) el.textContent = '';
    });
    
    // Reset statuses to waiting or disabled
    const activeSlots = getActiveSlots();
    statusElements.forEach((el, i) => {
      if(el) {
        el.textContent = activeSlots.find(s => s.slotIndex === i) ? 'waiting...' : 'disabled';
        el.style.color = 'var(--frame-hi)';
      }
    });

    document.getElementById('btnDownload').disabled = true;
    const btnClear = document.getElementById('btnClearRuns');
    if (btnClear) {
      btnClear.disabled = true;
      btnClear.style.display = 'none';
    }
    
    const gs = document.getElementById('globalStatus');
    gs.textContent = "Status: CLEARED";
    gs.style.color = 'var(--amber)';
    setTimeout(() => { gs.textContent = 'Status: READY'; gs.style.color = ''; }, 2000);
  });
  document.getElementById('btnDownload').addEventListener('click', downloadMarkdown);

  // Warn before unload if md is pending
  window.addEventListener('beforeunload', (e) => {
    if (latestMarkdown && !document.getElementById('btnDownload').disabled) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  updateBoardUI();

  // Lanes carry their data-provider now, so the mascots can start.
  startTamagotchis();
}

function renderBoardSelect() {
  const boards = getBoards();
  const current = document.getElementById('board-select-current');
  const options = document.getElementById('board-options');
  if (!current || !options) return;

  if (!boards[currentBoardId]) currentBoardId = Object.keys(boards)[0];
  const board = boards[currentBoardId];

  current.textContent = board ? board.name : '';

  options.innerHTML = Object.values(boards).map(b =>
    `<div class="term-option ${b.id === currentBoardId ? 'selected' : ''}" data-val="${b.id}">${b.name}</div>`
  ).join('');

  options.querySelectorAll('.term-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentBoardId = opt.dataset.val;
      opt.closest('.term-select').classList.remove('open');
      renderBoardSelect();
      updateBoardUI();
    });
  });

  const del = document.getElementById('btnDeleteBoard');
  if (del) del.style.display = isBuiltInBoard(currentBoardId) ? 'none' : 'inline-block';
}

export function updateBoardUI() {
  const boards = getBoards();
  const board = boards[currentBoardId];
  
  const allSlots = getAllSlots();
    if (board) {
      board.roles.forEach((role, i) => {
        const roleEl = document.getElementById('role-' + i);
        if (roleEl) roleEl.textContent = role.title;
        
        const titleInput = document.getElementById('role-title-' + i);
        if (titleInput && document.activeElement !== titleInput) {
          titleInput.value = role.title;
        }
        
        const focusInput = document.getElementById('role-focus-' + i);
        if (focusInput && document.activeElement !== focusInput) {
          focusInput.value = role.focus;
        }
      });
      
      for (let i = 0; i < 3; i++) {
        const logoEl = document.getElementById('logo-' + i);
        if (!logoEl || !allSlots[i]) continue;

        // Only restamp the mark when the provider actually changed: this runs on
        // every keystroke in the role fields, and a rewrite mid-blink would
        // clobber the frame and restart the bob animation.
        const service = allSlots[i].service || 'openai';
        if (logoEl.dataset.provider !== service) {
          logoEl.dataset.provider = service;
          // A silent fallback here is how a half-added provider stays invisible:
          // it renders as some other mark and looks like it works.
          if (!LOGOS[service]) console.warn(`no tamagotchi mark for provider "${service}"`);
          logoEl.textContent = LOGOS[service] || LOGOS.custom;
        }

        const enabled = allSlots[i].enabled;
        logoEl.style.opacity = enabled ? '1' : '0.15';
        const r = roleElements[i];
        if (r) r.style.opacity = enabled ? '1' : '0.3';
        const s = statusElements[i];
        if (s) {
          s.textContent = enabled ? 'waiting' : 'disabled';
          s.style.opacity = enabled ? '1' : '0.3';
        }
      }
    }
}

async function startRun() {
  console.log("BTN RUN CLICKED!");
  const brief = document.getElementById('briefInput').value.trim();
  if (brief.length < 10) {
    const gs = document.getElementById('globalStatus');
    gs.textContent = "error: brief must be at least 10 chars";
    gs.style.color = 'var(--red)';
    setTimeout(() => { gs.textContent = 'Status: READY'; gs.style.color = ''; }, 3000);
    return;
  }
  
  const activeSlots = getActiveSlots();
  if (activeSlots.length === 0) {
    const gs = document.getElementById('globalStatus');
    gs.textContent = "error: no active slots. check settings.";
    gs.style.color = 'var(--red)';
    setTimeout(() => { gs.textContent = 'Status: READY'; gs.style.color = ''; }, 3000);
    return;
  }

  // Reset UI
  laneBuffers.fill('');
  laneElements.forEach(el => {
    if(el) el.textContent = '';
  });
  statusElements.forEach((el, i) => {
    if(el) {
      el.textContent = activeSlots.find(s => s.slotIndex === i) ? 'waiting...' : 'disabled';
      el.style.color = 'var(--frame-hi)';
    }
  });
  

  document.getElementById('btnRun').style.display = 'none';
  document.getElementById('btnCancel').style.display = 'inline-block';
  document.getElementById('briefInput').disabled = true;

  console.log("REACHED rAF!");
  // Start rAF update
  rAF_id = requestAnimationFrame(flushLaneBuffers);

  const resultMd = await runBoard(currentBoardId, brief, handleLaneUpdate, handleGlobalStatus);
  
  if (resultMd) {
    if (latestMarkdown) {
      latestMarkdown += "\n\n---\n\n" + resultMd;
    } else {
      latestMarkdown = resultMd;
    }
    document.getElementById('btnDownload').disabled = false;
    const btnClear = document.getElementById('btnClearRuns');
    if (btnClear) {
      btnClear.disabled = false;
      btnClear.style.display = 'inline-block';
    }
  }
}

function handleLaneUpdate(laneIndex, data) {
  if (data.status === 'streaming') {
    // Add to buffer, rAF draws XSS safely
    laneBuffers[laneIndex] += data.text;
    statusElements[laneIndex].textContent = 'running...';
    statusElements[laneIndex].style.color = 'var(--amber)';
    
    // Lisätään kursori jos puuttuu
    if (!laneElements[laneIndex].classList.contains('streaming-cursor')) {
      laneElements[laneIndex].classList.add('streaming-cursor');
    }
  } else if (data.status === 'complete') {
    statusElements[laneIndex].textContent = `done (${data.stats.latencyMs}ms)`;
    statusElements[laneIndex].style.color = 'var(--amber)';
    laneElements[laneIndex].classList.remove('streaming-cursor');
  } else if (data.status === 'error') {
    statusElements[laneIndex].textContent = `error: ${data.error}`;
    statusElements[laneIndex].style.color = 'var(--red)';
    laneElements[laneIndex].classList.remove('streaming-cursor');
  }
}

function handleGlobalStatus(status) {
  const gs = document.getElementById('globalStatus');
  gs.textContent = `Status: ${status.toUpperCase()}`;
  if (status === 'running' || status === 'waiting') {
    gs.classList.add('blinking');
  }
  
  if (status === 'complete' || status === 'cancelled') {
    gs.classList.remove('blinking');
    // Lopetetaan ajo
    cancelAnimationFrame(rAF_id);
    
    // Varmistetaan että loput puskurista piirretään
    laneBuffers.forEach((buf, i) => {
      if (buf && laneElements[i]) {
        laneElements[i].textContent += buf;
        laneBuffers[i] = '';
      }
    });

    document.getElementById('btnRun').style.display = 'inline-block';
    document.getElementById('btnCancel').style.display = 'none';
    document.getElementById('briefInput').disabled = false;
    
    if (status === 'cancelled') {
      gs.textContent = "Status: CANCELLED";
      statusElements.forEach(el => el.textContent = 'Cancelled');
    }
  }
}

// rAF loop for rendering buffers
function flushLaneBuffers() {
  let scrolled = false;
  for (let i = 0; i < 3; i++) {
    if (laneBuffers[i]) {
      const el = laneElements[i];
      if (el) {
        // NOTE: OWASP LLM05 mitigation
        el.textContent += laneBuffers[i];
        laneBuffers[i] = '';
        
        // Auto-scrollataan pohjaan
        const parent = el.parentElement;
        if (parent) {
          parent.scrollTop = parent.scrollHeight;
        }
      }
    }
  }
  rAF_id = requestAnimationFrame(flushLaneBuffers);
}

function downloadMarkdown() {
  if (!latestMarkdown) return;
  
  const blob = new Blob([latestMarkdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-board-result-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Vapautetaan ennenkuin suljetaan
  document.getElementById('btnDownload').disabled = true;
}
