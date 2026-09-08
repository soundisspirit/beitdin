import { tutorialApi } from './ui.js';

/**
 * beitdin - Interactive Tutorial State Machine
 * Guided walkthrough mirroring the YouTube tutorial video workflow.
 * Strictly dependency-free, zero-network, and XSS-safe.
 */

const SAMPLE_BRIEF = `We are building a new browser-based HR tool that combines real-time collaborative document editing with live payroll data. The goal is to allow up to 50 HR managers to simultaneously edit employee contracts while seeing the company-wide budget impact update in real-time. We need to ship the MVP in 3 months. What are your immediate thoughts, critical red flags, and the first steps we should take?`;

const SIMULATED_DATA = [
  {
    lane: 0,
    role: 'product_manager',
    latency: 984,
    text: `# Immediate Thoughts, Red Flags & First Steps for HR Tool MVP

## User Value & Scope
- Core Value Prop: Real-time collaboration + live payroll impact is a differentiator for HR teams managing contracts at scale.
- Target Users: 50 concurrent HR managers need intuitive, conflict-free editing with instant financial feedback to prevent budget overruns.

## Critical Red Flags
- Scope Creep: A 3-month MVP timeline is extremely aggressive. Strip out custom reporting and deep ERP syncs for v1.
- Regulatory Compliance: Live payroll figures are subject to GDPR/HIPAA audit trails.

## First Steps
1. Lock down minimum required contract fields and budget impact calculation formulas.
2. Conduct user interviews with HR managers to validate the financial feedback UI.`
  },
  {
    lane: 1,
    role: 'tech_lead',
    latency: 1240,
    text: `### Immediate Technical Thoughts
1. Complexity of Requirements:
- Real-time collaborative editing requires robust CRDT/OT algorithms (e.g., Yjs or Automerge).
- Live payroll data integration demands server-authoritative aggregate calculations.

### Critical Technical Risks
- Scalability: 50 simultaneous active editors per document can strain WebSocket connections and conflict resolution threads.
- Data Security: Financial aggregates must never be calculated client-side; strictly enforce permissions on every keystroke payload.

### First Steps
1. Prototype WebSocket cluster and benchmark CRDT sync latency under 50-client load.
2. Design append-only audit event log schema for financial compliance.`
  },
  {
    lane: 2,
    role: 'ux_designer',
    latency: 1410,
    text: `# UX & Interaction Flow Analysis

## User Experience Priorities
- Real-time Clarity: Presenting instantaneous company-wide budget updates alongside contract text risks cognitive overload.
- Collaborator Awareness: Clear visual presence indicators (cursors, colored selections) to prevent conflicting edits.

## Critical Red Flags
- Accidental Budget Commits: Edits that alter salary tiers must have explicit visual confirmation gates.
- Accessibility: Ensure the live financial ticker is readable and accessible for screen readers.

## First Steps
1. Prototype split-pane contract editor and real-time financial impact banner.
2. Test conflict-resolution UX when two managers alter salary fields concurrently.`
  }
];

// Step definitions matching video workflow
const STEPS = [
  {
    id: 'intro',
    title: 'supercharge_your_planning: multi-angle perspectives',
    body: 'run multiple llms together, bringing different perspectives from different providers and models toward one single goal. three specialists read your brief at the same time and hand you one document with all three outputs.',
    tip: 'this is not a model comparison tool unless you want it to be. the lanes analyze different aspects of the same brief so the angles stack up in one file that you can hand onward.',
    view: 'main',
    targets: ['header', 'lanesWrap'],
    actions: []
  },
  {
    id: 'settings',
    title: 'settings: providers & tab-session security',
    body: 'configure three provider endpoints side-by-side: openai, google gemini, mistral, or local models via ollama. test endpoints using [ping] or [ping_all_lanes] to discover available models, or disable a lane to run with two.',
    tip: 'security note: api keys live in browser session storage (scoped to this tab and dropped on tab close). your browser communicates directly with the ai provider—no backend, no middleman, zero tracking.',
    view: 'settings',
    targets: ['settingsBtn', 'settings0'],
    actions: []
  },
  {
    id: 'roles',
    title: 'roles & boards: defining specialist angles',
    body: 'roles define the lens each model looks through. custom system prompts allow one lane to critique architectural scalability while another probes security or product prioritization. switch between boards (e.g. architecture_board, product_board) create new or export/import your own json configs.',
    tip: 'boards are saved in local storage so your custom panels of specialists persist across visits.',
    view: 'roles',
    targets: ['rolesBtn', 'boardSelect', 'roles0'],
    actions: []
  },
  {
    id: 'brief',
    title: 'crafting the planning brief',
    body: 'the brief is your task, architectural problem, or product initiative. paste your brief here, set your constraints, and let the specialists turn every stone before you commit to implementation.',
    tip: 'click [load_sample_brief] below to paste the collaborative hr app brief demo.',
    view: 'main',
    targets: ['briefInput'],
    actions: [
      { id: 'loadBrief', label: 'load_sample_brief', run: loadSampleBrief }
    ]
  },
  {
    id: 'run',
    title: 'concurrent 3-lane parallel execution',
    body: 'pressing [run] dispatches the brief to all three configured endpoints in parallel. outputs stream simultaneously. responses are injected via textcontent for strict xss protection.',
    tip: 'click [simulate_parallel_run] to preview how concurrent streaming looks and feels right now without using api keys.',
    view: 'main',
    targets: ['runBtn', 'lanes'],
    actions: [
      { id: 'simRun', label: 'simulate_parallel_run', run: startSimulation }
    ]
  },
  {
    id: 'shuffle',
    title: 'role shuffling: multiplying perspectives',
    body: '[shuffle_roles] swaps the role personas across the three models while keeping your api connections fixed. running again gives you three brand-new expert angles on the exact same brief.',
    tip: 'click [try_shuffle] below to see the specialist titles and marks rotate across the lanes.',
    view: 'main',
    targets: ['shuffleBtn'],
    actions: [
      { id: 'tryShuffle', label: 'try_shuffle', run: triggerShuffle }
    ]
  },
  {
    id: 'compile',
    title: 'accumulating markdown & download',
    body: 'every run automatically appends into a single structured markdown document. shuffle roles, run again, and download a single compiled deliverable containing all 6 or 9 expert analyses ready to hand to your team.',
    tip: '[clear_runs] resets session outputs when you are ready to start a new brief.',
    view: 'main',
    targets: ['downloadBtn', 'clearRunsBtn'],
    actions: []
  },
  {
    id: 'finish',
    title: 'ready to supercharge your planning',
    body: 'you now know the full beitdin workflow: configure providers in [settings], set specialist roles in [roles], paste your brief, and let llms interrogate your topic.',
    tip: 'click [exit_tutorial] to start exploring and planning your own projects. if you like this project consider to support by [buy_me_a_coffee].',
    view: 'about',
    targets: ['aboutBtn', 'youtubeTutorial', 'buyCoffeeBtn'],
    actions: [
      { id: 'exitTut', label: 'exit_tutorial', run: exitTutorial },
      { id: 'buyCoffee', label: 'buy_me_a_coffee', run: () => window.open('https://www.buymeacoffee.com/soundisspirit', '_blank', 'noopener,noreferrer') }
    ]
  }
];

let active = false;
let currentStepIndex = 0;
let initialViewSnapshot = 'main';
let initialBriefSnapshot = '';
let briefInjectedByTutorial = false;
const simulationTimers = new Set();
let hudEl = null;
let backdropEl = null;

export function initTutorial() {
  const btn = document.getElementById('btnTutorial');
  if (!btn) {
    console.warn('[tutorial] #btnTutorial button not found in DOM.');
    return;
  }

  btn.addEventListener('click', () => {
    if (active) {
      exitTutorial();
    } else {
      startTutorial();
    }
  });

  const laneBtn = document.getElementById('btnLaneTutorial');
  if (laneBtn) {
    laneBtn.addEventListener('click', () => {
      if (active) {
        exitTutorial();
      } else {
        startTutorial();
      }
    });
  }

  window.addEventListener('keydown', handleKeyDown);
}

export function startTutorial() {
  if (active) return;
  
  if (tutorialApi.isRunActive()) {
    alert('A live run is currently in progress. Please wait for it to complete or cancel it before starting the tutorial.');
    return;
  }

  active = true;
  currentStepIndex = 0;
  initialViewSnapshot = tutorialApi.getActiveView();
  initialBriefSnapshot = tutorialApi.getBrief();
  briefInjectedByTutorial = false;

  const btn = document.getElementById('btnTutorial');
  if (btn) {
    btn.textContent = 'exit_tutorial';
    btn.classList.add('active');
    btn.style.color = '';
  }

  createOverlayElements();
  renderStep(0);
}

export function exitTutorial() {
  if (!active) return;

  stopSimulation();
  clearHighlights();

  // Restore brief only if it was untouched by user after tutorial injection
  if (briefInjectedByTutorial && tutorialApi.getBrief() === SAMPLE_BRIEF) {
    tutorialApi.setBrief(initialBriefSnapshot);
  }

  // Restore initial view
  tutorialApi.setActiveView(initialViewSnapshot);

  // Remove HUD and backdrop
  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }
  if (backdropEl) {
    backdropEl.remove();
    backdropEl = null;
  }

  const btn = document.getElementById('btnTutorial');
  if (btn) {
    btn.textContent = 'tutorial';
    btn.classList.remove('active');
    btn.style.color = '';
  }

  active = false;
}

function createOverlayElements() {
  backdropEl = document.createElement('div');
  backdropEl.className = 'tutorial-backdrop active';
  document.body.appendChild(backdropEl);

  hudEl = document.createElement('aside');
  hudEl.id = 'tutorialHud';
  hudEl.setAttribute('role', 'dialog');
  hudEl.setAttribute('aria-label', 'interactive tutorial guide');
  document.body.appendChild(hudEl);
}

function renderStep(index) {
  if (index < 0 || index >= STEPS.length) return;

  // Stop any ongoing simulation if moving away from simulation step
  stopSimulation();

  currentStepIndex = index;
  const step = STEPS[currentStepIndex];

  // Apply target view
  if (step.view) {
    tutorialApi.setActiveView(step.view);
  }

  // Update target highlighting
  clearHighlights();
  if (step.targets && step.targets.length > 0) {
    step.targets.forEach(targetName => {
      const el = tutorialApi.getTutorialTarget(targetName);
      if (el) {
        el.classList.add('tutorial-highlight');
      }
    });

    // Scroll first primary target into view smoothly
    const primary = tutorialApi.getTutorialTarget(step.targets[0]);
    if (primary && typeof primary.scrollIntoView === 'function') {
      primary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Render HUD content
  if (!hudEl) return;

  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === STEPS.length - 1;

  hudEl.innerHTML = `
    <div class="tutorial-hud-header">
      <div class="tutorial-hud-title">
        <span>> beitdin_tutorial</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="tutorial-hud-counter">[step ${currentStepIndex + 1} of ${STEPS.length}]</span>
        <button class="tutorial-hud-close" id="tutHudClose" title="exit tutorial">exit</button>
      </div>
    </div>
    <div class="tutorial-hud-body">
      <h3 class="tutorial-step-name">> ${esc(step.title)}</h3>
      <p class="tutorial-step-desc">${esc(step.body)}</p>
      ${step.tip ? `<p class="tutorial-step-tip">${esc(step.tip)}</p>` : ''}
      <div class="tutorial-hud-actions" id="tutStepActions"></div>
    </div>
    <div class="tutorial-hud-footer">
      <div class="tutorial-hud-keys">keys: &larr; &rarr; / esc</div>
      <div class="tutorial-hud-nav">
        <button class="tutorial-hud-btn" id="tutBtnPrev" ${isFirst ? 'disabled' : ''}>&lt; prev</button>
        <button class="tutorial-hud-btn primary" id="tutBtnNext">${isLast ? 'finish' : 'next &gt;'}</button>
      </div>
    </div>
  `;

  // Attach nav buttons
  hudEl.querySelector('#tutHudClose')?.addEventListener('click', exitTutorial);
  hudEl.querySelector('#tutBtnPrev')?.addEventListener('click', () => {
    if (currentStepIndex > 0) renderStep(currentStepIndex - 1);
  });
  hudEl.querySelector('#tutBtnNext')?.addEventListener('click', () => {
    if (currentStepIndex < STEPS.length - 1) {
      renderStep(currentStepIndex + 1);
    } else {
      exitTutorial();
    }
  });

  // Attach custom action buttons for this step
  const actionsContainer = hudEl.querySelector('#tutStepActions');
  if (actionsContainer && step.actions) {
    step.actions.forEach(act => {
      const b = document.createElement('button');
      b.className = 'tutorial-action-btn';
      b.textContent = act.label;
      b.addEventListener('click', act.run);
      actionsContainer.appendChild(b);
    });
  }
}

function clearHighlights() {
  document.querySelectorAll('.tutorial-highlight').forEach(el => {
    el.classList.remove('tutorial-highlight');
  });
}

function handleKeyDown(e) {
  if (!active) return;

  // Don't intercept arrow keys if user is typing in an input or textarea
  const target = e.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
    if (e.key === 'Escape') {
      target.blur();
      exitTutorial();
    }
    return;
  }

  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (currentStepIndex < STEPS.length - 1) {
      renderStep(currentStepIndex + 1);
    } else {
      exitTutorial();
    }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (currentStepIndex > 0) {
      renderStep(currentStepIndex - 1);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    exitTutorial();
  }
}

function loadSampleBrief() {
  tutorialApi.setBrief(SAMPLE_BRIEF);
  briefInjectedByTutorial = true;
  const input = tutorialApi.getTutorialTarget('briefInput');
  if (input) {
    input.focus();
    input.classList.add('tutorial-highlight');
  }
}

function triggerShuffle() {
  tutorialApi.shuffleRoles();
}

function startSimulation() {
  stopSimulation();

  tutorialApi.setActiveView('main');
  tutorialApi.setSimulationMode(true);

  // Disable simulation button while running
  const simBtn = hudEl?.querySelector('.tutorial-action-btn');
  if (simBtn) simBtn.disabled = true;

  // Mirror real run: immediately set active lanes to waiting... with var(--frame-hi)
  for (let i = 0; i < 3; i++) {
    const statusEl = tutorialApi.getLaneStatusElement(i);
    if (statusEl) {
      statusEl.textContent = 'waiting...';
      statusEl.style.color = 'var(--frame-hi)';
    }
  }

  SIMULATED_DATA.forEach(item => {
    const laneIndex = item.lane;
    const contentEl = tutorialApi.getLaneContentElement(laneIndex);
    const statusEl = tutorialApi.getLaneStatusElement(laneIndex);

    if (!contentEl) return;

    // Mark as simulation artifact for clean teardown
    contentEl.setAttribute('data-tutorial-simulation', 'true');
    contentEl.textContent = '';
    contentEl.classList.add('streaming-cursor');

    // Stagger arrival slightly to mirror realistic network latency
    const startDelay = 200 + laneIndex * 150;
    const startTimerId = window.setTimeout(() => {
      simulationTimers.delete(startTimerId);

      if (statusEl) {
        statusEl.textContent = 'running...';
        statusEl.style.color = 'var(--amber)';
      }

      const fullText = item.text;
      let cursor = 0;
      const chunkSize = 4;
      const intervalMs = 28;

      const timerId = window.setInterval(() => {
        cursor = Math.min(cursor + chunkSize, fullText.length);
        // OWASP LLM05 mitigation: textContent only
        contentEl.textContent = fullText.substring(0, cursor);

        // Keep pinned to bottom
        if (contentEl.parentElement) {
          contentEl.parentElement.scrollTop = contentEl.parentElement.scrollHeight;
        }

        if (cursor >= fullText.length) {
          window.clearInterval(timerId);
          simulationTimers.delete(timerId);
          contentEl.classList.remove('streaming-cursor');
          if (statusEl) {
            statusEl.textContent = `done (${item.latency}ms)`;
            statusEl.style.color = 'var(--amber)';
          }

          // Re-enable sim button when all finished
          if (simulationTimers.size === 0 && simBtn) {
            simBtn.disabled = false;
          }
        }
      }, intervalMs);

      simulationTimers.add(timerId);
    }, startDelay);

    simulationTimers.add(startTimerId);
  });
}

function stopSimulation() {
  simulationTimers.forEach(id => window.clearInterval(id));
  simulationTimers.clear();

  // Clean simulated elements and reset lane statuses
  document.querySelectorAll('[data-tutorial-simulation="true"]').forEach(el => {
    el.textContent = '';
    el.classList.remove('streaming-cursor');
    el.removeAttribute('data-tutorial-simulation');
  });

  for (let i = 0; i < 3; i++) {
    const statusEl = tutorialApi.getLaneStatusElement(i);
    if (statusEl) {
      statusEl.textContent = 'waiting';
      statusEl.style.color = 'var(--frame-hi)';
    }
  }

  tutorialApi.setSimulationMode(false);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
