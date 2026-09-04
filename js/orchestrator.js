import { getActiveSlots } from './slots.js';
import { call as callOpenAI } from './adapters/openai-compat.js';
import { call as callGemini } from './adapters/gemini.js';

let activeRunControllers = [];
let isRunning = false;

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

export function getBoards() {
  if (BOARDS) return BOARDS;
  try {
    const saved = localStorage.getItem('api_agent_boards');
    if (saved) {
      BOARDS = JSON.parse(saved);
      // Ensure defaults exist
      BOARDS.architecture = DEFAULT_BOARDS.architecture;
      BOARDS.product = DEFAULT_BOARDS.product;
    } else {
      BOARDS = { ...DEFAULT_BOARDS };
    }
  } catch(e) {
    BOARDS = { ...DEFAULT_BOARDS };
  }
  return BOARDS;
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

  const board = BOARDS[boardId];
  if (!board) {
    throw new Error("unknown board.");
  }

  isRunning = true;
  activeRunControllers = [];
  onStatusChange('running');

  // for combined markdown storage
  const finalResults = new Array(3).fill(null);

  try {
    // Luodaan abort controllerit jokaiselle lanelle
    const lanePromises = slots.map(async (slot) => {
      const index = slot.slotIndex; // Use actual UI lane index
      const controller = new AbortController();
      activeRunControllers.push(controller);
      
      const role = board.roles[index] || board.roles[0]; // fallback if more slots than roles
      const systemPrompt = `You are the ${role.title}. ${role.focus}\nAnswer clearly and structure your output in Markdown. Do not write a preamble, just the output.`;
      
      const adapterCall = slot.adapterType === 'gemini' ? callGemini : callOpenAI;
      
      let laneText = "";
      
      // Kutsutaan adapterin async generaattoria
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

    // Odotetaan että kaikki lanet ovat valmiit (Promise.allSettled)
    await Promise.allSettled(lanePromises);

    if (!isRunning) {
      // Keskeytetty
      onStatusChange('cancelled');
      return null;
    }

    // COMPOSE VAIHE: Yhdistetään markdown-dokumentiksi
    let markdown = `# API Agent Board Result\n\n**Board:** ${board.name}\n**Brief:**\n> ${brief.split('\\n').join('\\n> ')}\n\n---\n\n`;
    
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
    isRunning = false;
    activeRunControllers = [];
  }
}
