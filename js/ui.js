import { getBoards, saveBoards, runBoard, cancelRun, addCustomBoard, deleteCustomBoard, isBuiltInBoard } from './orchestrator.js';
import { getActiveSlots, renderSettings, getAllSlots, pingAllSlots } from './slots.js';
import { laneMark } from './logos.js';

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

// True once a run has produced results, until they are cleared or a new run
// starts. While set, updateBoardUI leaves the lane status lines alone.
let laneStatusHeld = false;

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
    
    // Only the panels are closed here; the prompt text is deliberately kept.
    
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
    laneStatusHeld = false;
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

  // ---- board actions: new / export / import / delete ----------------------

  // Naming a new board swaps the bar's controls for an inline field. No native
  // dialog: the app's look does not allow one.
  const boardControls = document.getElementById('boardControls');
  const newBoardRow = document.getElementById('newBoardRow');
  const nbName = document.getElementById('nbName');
  const nbError = document.getElementById('nbError');

  const showNewBoardRow = on => {
    boardControls.style.display = on ? 'none' : 'flex';
    newBoardRow.style.display = on ? 'flex' : 'none';
    nbError.textContent = '';
    if (on) { nbName.value = ''; nbName.focus(); }
  };

  document.getElementById('btnNewBoard')?.addEventListener('click', () => showNewBoardRow(true));
  document.getElementById('nbCancel')?.addEventListener('click', () => showNewBoardRow(false));

  const createBoard = () => {
    const name = nbName.value.trim();
    if (!name) {
      nbError.textContent = 'name cannot be empty';
      nbName.focus();
      return;
    }
    const board = {
      id: makeBoardId(name),
      name: name.slice(0, 60),
      // Empty focus is fine: the roles panel is where you fill these in.
      roles: [0, 1, 2].map(i => ({ id: i, title: `lane_${i + 1}`, focus: '' }))
    };
    addCustomBoard(board);
    currentBoardId = board.id;
    showNewBoardRow(false);
    renderBoardSelect();
    updateBoardUI();
    flashStatus(`created: ${board.name}`);
  };

  document.getElementById('nbCreate')?.addEventListener('click', createBoard);
  nbName?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); createBoard(); }
    if (e.key === 'Escape') { e.preventDefault(); showNewBoardRow(false); }
  });

  document.getElementById('btnDownloadBoard')?.addEventListener('click', () => {
    const board = getBoards()[currentBoardId];
    if (!board) return;
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashStatus(`exported: ${board.name}`);
  });

  const uploadInput = document.getElementById('uploadBoardInput');
  document.getElementById('btnUploadBoard')?.addEventListener('click', () => uploadInput?.click());

  uploadInput?.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    // Reset first, so picking the same file twice still fires a change event.
    uploadInput.value = '';
    const { board, error } = parseBoardFile(await file.text());
    if (error) return flashStatus(`import failed: ${error}`, 'var(--red)', 4000);
    addCustomBoard(board);
    currentBoardId = board.id;
    renderBoardSelect();
    updateBoardUI();
    flashStatus(`imported: ${board.name}`);
  });

  // Delete confirms in place rather than in a browser dialog: first click arms
  // the button, second click within 4s does it.
  const btnDelete = document.getElementById('btnDeleteBoard');
  let deleteTimer = null;

  btnDelete?.addEventListener('click', () => {
    if (isBuiltInBoard(currentBoardId)) return;
    if (btnDelete.dataset.armed !== '1') {
      btnDelete.dataset.armed = '1';
      btnDelete.textContent = 'confirm?';
      deleteTimer = setTimeout(() => disarmDelete(btnDelete), 4000);
      return;
    }
    clearTimeout(deleteTimer);
    const name = getBoards()[currentBoardId]?.name || currentBoardId;
    deleteCustomBoard(currentBoardId);
    disarmDelete(btnDelete);
    currentBoardId = Object.keys(getBoards())[0];
    renderBoardSelect();
    updateBoardUI();
    flashStatus(`deleted: ${name}`, 'var(--red)');
  });

  // Warn before unload if md is pending
  window.addEventListener('beforeunload', (e) => {
    if (latestMarkdown && !document.getElementById('btnDownload').disabled) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // The markup carries a year as a fallback; keep it current on every load.
  const year = document.getElementById('creditYear');
  if (year) year.textContent = new Date().getFullYear();

  updateBoardUI();
}

// Board names reach innerHTML and can come from an imported file, so they are
// escaped rather than trusted.
const esc = str => String(str).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The armed state lives on the button so anything that resets the label - a
// board switch, a re-render - clears the state with it.
function disarmDelete(btn) {
  if (!btn) return;
  delete btn.dataset.armed;
  btn.textContent = 'delete';
}

function flashStatus(text, color = 'var(--amber)', ms = 3000) {
  const gs = document.getElementById('globalStatus');
  if (!gs) return;
  gs.textContent = text;
  gs.style.color = color;
  setTimeout(() => { gs.textContent = 'Status: READY'; gs.style.color = ''; }, ms);
}

// A board id has to survive being used as a data-val and an object key.
function makeBoardId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'board';
  const boards = getBoards();
  let id = base, n = 2;
  while (boards[id]) id = `${base}_${n++}`;
  return id;
}

// Shape check for an imported file. Anything unexpected is rejected outright
// rather than half-loaded.
function parseBoardFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'not valid json' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'not a board object' };
  if (typeof data.name !== 'string' || !data.name.trim()) return { error: 'missing board name' };
  if (!Array.isArray(data.roles) || data.roles.length !== 3) return { error: 'board needs exactly 3 roles' };
  const roles = data.roles.map((r, i) => {
    if (!r || typeof r !== 'object') return null;
    if (typeof r.title !== 'string' || typeof r.focus !== 'string') return null;
    return { id: i, title: r.title.slice(0, 120), focus: r.focus.slice(0, 8000) };
  });
  if (roles.some(r => r === null)) return { error: 'every role needs a title and a focus' };
  const name = data.name.trim().slice(0, 60);
  return { board: { id: makeBoardId(name), name, roles } };
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
    `<div class="term-option ${b.id === currentBoardId ? 'selected' : ''}" data-val="${esc(b.id)}">${esc(b.name)}</div>`
  ).join('');

  options.querySelectorAll('.term-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentBoardId = opt.dataset.val;
      opt.closest('.term-select').classList.remove('open');
      disarmDelete(document.getElementById('btnDeleteBoard'));
      renderBoardSelect();
      updateBoardUI();
    });
  });

  const del = document.getElementById('btnDeleteBoard');
  if (del) {
    del.style.display = isBuiltInBoard(currentBoardId) ? 'none' : 'inline-block';
    disarmDelete(del);
  }
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

        // The mark is fixed per lane, so it only ever needs writing once.
        const mark = laneMark(i);
        if (logoEl.textContent !== mark) logoEl.textContent = mark;

        const enabled = allSlots[i].enabled;
        logoEl.style.opacity = enabled ? '1' : '0.15';
        const r = roleElements[i];
        if (r) r.style.opacity = enabled ? '1' : '0.3';
        const s = statusElements[i];
        if (s) {
          if (!laneStatusHeld) s.textContent = enabled ? 'waiting' : 'disabled';
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
  laneStatusHeld = false;
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

  try {
    const resultMd = await runBoard(currentBoardId, brief, handleLaneUpdate, handleGlobalStatus);

    if (resultMd) {
      if (latestMarkdown) {
        latestMarkdown += "\n\n---\n\n" + resultMd;
      } else {
        latestMarkdown = resultMd;
      }
      laneStatusHeld = true;
      document.getElementById('btnDownload').disabled = false;
      const btnClear = document.getElementById('btnClearRuns');
      if (btnClear) {
        btnClear.disabled = false;
        btnClear.style.display = 'inline-block';
      }
    }
  } catch (e) {
    // Without this the controls stay hidden and the rAF loop spins forever, and
    // only a reload gets the app back.
    console.error('run failed', e);
    flashStatus(`error: ${e.message || 'run failed'}`, 'var(--red)', 5000);
    statusElements.forEach(el => { if (el) el.textContent = 'failed'; });
  } finally {
    // Draw whatever is still buffered before stopping, so a failed run keeps the
    // output the lanes did produce. Idempotent: the complete/cancelled path in
    // handleGlobalStatus does the same thing.
    laneBuffers.forEach((buf, i) => {
      if (buf && laneElements[i]) {
        laneElements[i].textContent += buf;
        laneBuffers[i] = '';
      }
    });
    cancelAnimationFrame(rAF_id);
    document.getElementById('btnRun').style.display = 'inline-block';
    document.getElementById('btnCancel').style.display = 'none';
    document.getElementById('briefInput').disabled = false;
  }
}

function handleLaneUpdate(laneIndex, data) {
  if (data.status === 'streaming') {
    // Add to buffer, rAF draws XSS safely
    laneBuffers[laneIndex] += data.text;
    statusElements[laneIndex].textContent = 'running...';
    statusElements[laneIndex].style.color = 'var(--amber)';
    
    // Add the streaming cursor if it is not already there
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
    // Stop the run
    cancelAnimationFrame(rAF_id);
    
    // Make sure whatever is left in the buffers gets drawn
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
        
        // Keep the lane pinned to the bottom
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
  
  // Release the object URL before closing
  document.getElementById('btnDownload').disabled = true;
}
