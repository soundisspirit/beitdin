import { getActiveSlots } from './slots.js';
import { call as callOpenAI } from './adapters/openai-compat.js';
import { call as callGemini } from './adapters/gemini.js';

let activeRunControllers = [];
let isRunning = false;
let runGeneration = 0;   // bumped per run, so a stale run cannot speak for a live one

// simple built-in boards
const DEFAULT_BOARDS = {
  architecture: {
    id: "architecture",
    name: "architecture_board",
    roles: [
      { id: 0, title: "technical_architect", focus: "Focus on scalability, architecture patterns and system structure. Do not design UI or UX." },
      { id: 1, title: "security_expert", focus: "Focus on security, attack vectors and data protection. Do not design features." },
      { id: 2, title: "functional_architect", focus: "Focus on business logic, functional requirements and mapping user needs to system capabilities." }
    ]
  },
  product: {
    id: "product",
    name: "product_board",
    roles: [
      { id: 0, title: "product_manager", focus: "Focus on user value, business goals and feature prioritization." },
      { id: 1, title: "ux_designer", focus: "Focus on user experience, accessibility and interface flow." },
      { id: 2, title: "tech_lead", focus: "Focus on feasibility, technical debt and development speed." }
    ]
  }
};

let BOARDS = null;

// Every read hands back a fresh copy of the shipped boards, so editing a role
// can never reach through and mutate DEFAULT_BOARDS itself.
function freshDefaults() {
  return structuredClone(DEFAULT_BOARDS);
}

// A board is only usable if it has a name and exactly three roles that each
// carry a title and a focus. Anything else in storage is ignored rather than
// half-loaded.
function isUsableBoard(b) {
  return b && typeof b === 'object'
    && typeof b.name === 'string'
    && Array.isArray(b.roles) && b.roles.length === 3
    && b.roles.every(r => r && typeof r.title === 'string' && typeof r.focus === 'string');
}

export function getBoards() {
  if (BOARDS) return BOARDS;
  BOARDS = freshDefaults();
  try {
    const saved = localStorage.getItem('api_agent_boards');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Saved boards win over the defaults, including edits to the two shipped
      // ones. Overwriting them here is what used to discard every role edit on
      // reload.
      for (const [id, board] of Object.entries(parsed || {})) {
        if (isUsableBoard(board)) BOARDS[id] = { ...board, id };
      }
    }
  } catch (e) {
    console.warn('stored boards were unreadable, falling back to defaults', e);
    BOARDS = freshDefaults();
  }
  return BOARDS;
}

// Put the two shipped boards back the way they came, leaving custom ones alone.
export function resetBuiltInBoards() {
  const boards = getBoards();
  Object.assign(boards, freshDefaults());
  saveBoards(boards);
  return boards;
}

export function saveBoards(boards) {
  BOARDS = boards;
  localStorage.setItem('api_agent_boards', JSON.stringify(BOARDS));
}

export function addCustomBoard(board) {
  const boards = getBoards();
  boards[board.id] = board;
  saveBoards(boards);
}

// The two shipped boards cannot be renamed away or deleted.
export function isBuiltInBoard(id) {
  return id in DEFAULT_BOARDS;
}

export function deleteCustomBoard(id) {
  if (isBuiltInBoard(id)) return;
  const boards = getBoards();
  delete boards[id];
  saveBoards(boards);
}

export function cancelRun() {
  if (!isRunning) return;
  activeRunControllers.forEach(ctrl => ctrl.abort());
  activeRunControllers = [];
  isRunning = false;
  runGeneration++;   // anything still in flight now belongs to a dead run
  return true;
}

export async function runBoard(boardId, brief, onLaneUpdate, onStatusChange) {
  if (isRunning) {
    throw new Error("run is already in progress.");
  }
  
  const slots = getActiveSlots();
  if (slots.length === 0) {
    throw new Error("no active slots. configure settings first.");
  }

  const board = getBoards()[boardId];
  if (!board) {
    throw new Error("unknown board.");
  }

  isRunning = true;
  const myGeneration = ++runGeneration;
  activeRunControllers = [];
  onStatusChange('running');

  // for combined markdown storage
  const finalResults = new Array(3).fill(null);

  try {
    // One abort controller per lane
    const lanePromises = slots.map(async (slot) => {
      const index = slot.slotIndex; // Use actual UI lane index
      const controller = new AbortController();
      activeRunControllers.push(controller);
      
      const role = board.roles[index] || board.roles[0]; // fallback if more slots than roles
      const systemPrompt = `You are the ${role.title}. ${role.focus}\nAnswer clearly and structure your output in Markdown. Do not write a preamble, just the output.`;
      
      const adapterCall = slot.adapterType === 'gemini' ? callGemini : callOpenAI;
      
      let laneText = "";
      
      // Drive the adapter's async generator
      try {
        const stream = adapterCall(slot, systemPrompt, brief, null, controller.signal);
        
        for await (const event of stream) {
          if (event.type === 'delta') {
            laneText += event.text;
            onLaneUpdate(index, { status: 'streaming', text: event.text });
          } else if (event.type === 'done') {
            onLaneUpdate(index, { status: 'complete', stats: event });
            finalResults[index] = { role: role.title, text: event.text, model: event.model };
          } else if (event.type === 'error') {
            onLaneUpdate(index, { status: 'error', error: event.message });
            finalResults[index] = { role: role.title, error: event.message, model: slot.selectedModel };
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          onLaneUpdate(index, { status: 'error', error: e.message });
          finalResults[index] = { role: role.title, error: e.message, model: slot.selectedModel };
        }
      }
    });

    // Wait for every lane to settle, successes and failures alike
    await Promise.allSettled(lanePromises);

    if (myGeneration !== runGeneration) {
      // Cancelled, and possibly superseded by a newer run. Report the
      // cancellation but never touch state a live run now owns.
      if (!isRunning) onStatusChange('cancelled');
      return null;
    }

    // COMPOSE STEP: fold the lane results into one markdown document
    let markdown = `# API Agent Board Result\n\n**Board:** ${board.name}\n**Brief:**\n> ${brief.split('\n').join('\n> ')}\n\n---\n\n`;
    
    finalResults.forEach((res, i) => {
      if (res) {
        markdown += `## Lane ${i + 1}: ${res.role} (Model: ${res.model})\n\n`;
        if (res.error) {
          markdown += `*[FAILED: ${res.error}]*\n\n`;
        } else {
          markdown += `${res.text}\n\n`;
        }
        markdown += `---\n\n`;
      }
    });

    onStatusChange('complete');
    return markdown;

  } finally {
    // Only tear down if this run is still the current one; a newer run may have
    // started after this one was cancelled.
    if (myGeneration === runGeneration) {
      isRunning = false;
      activeRunControllers = [];
    }
  }
}
