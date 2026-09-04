# api_agent_board

A concurrent multi-agent execution environment built for testing, comparing, and pipelining output from multiple LLM perspectives.

The application runs entirely client-side, fetching directly from provider APIs (OpenAI, Google Gemini, Custom/Local, Mistral). There is no backend database and no build step.

## Quick Start

1. Clone the repo
2. Serve the directory: `python3 -m http.server 8333 --bind 127.0.0.1`
3. Open `http://127.0.0.1:8333` in a desktop browser.

Note: Due to the concurrent 3-lane execution layout, this application enforces a minimum viewport width of 1000px and is intentionally not designed for mobile devices.

## Architecture

This tool was pivoted from a heavier Python/Docker-based architecture into a highly lean, zero-dependency HTML/JS client app.

- **Zero Build Step:** Native ES modules (`<script type="module">`). No Webpack, Vite, or TypeScript compilation required.
- **Client-Side Orchestration:** The `orchestrator.js` module handles all concurrent LLM calls natively via `fetch`.
- **Brutalist Terminal UI:** The UI uses native browser DOM APIs with a strict terminal aesthetic (`var(--mono)` typography, no rounded borders, brackets for buttons).
- **Streaming Execution:** The UI streams model responses into the UI using `requestAnimationFrame` for a smooth, XSS-safe text rendering experience.

For the rationale on why the cloud architecture was simplified into a local app, read `ARCHITECTURE-REVIEW.md`.

## Features

- **3-Lane Concurrency:** Run up to three agents simultaneously.
- **Custom Boards:** Define distinct roles, personas, and tasks for each lane.
- **Provider Agnostic:** Supports OpenAI, Google Gemini, Mistral, and any OpenAI-compatible local model (e.g. Ollama via `http://localhost:11434/v1`).
- **Pipeline Accumulation:** Click `[ run ]` multiple times or shuffle roles to build a comprehensive document from multiple perspectives.
- **Markdown Export:** Export the combined session output directly to a unified `.md` file.

## Design System

The application strictly adheres to a brutally minimal, terminal-inspired design system. See `design-system.html` for the complete component catalog, spacing tokens, and color palette.

## Project Structure

```text
.
├── index.html           # Main application entry point
├── design-system.html   # Component catalog and design tokens
├── js/                  # Vanilla ES modules
│   ├── main.js          # Bootstrapper
│   ├── ui.js            # DOM manipulation, layout shifts, streaming
│   ├── orchestrator.js  # Concurrent LLM execution, board definitions
│   ├── slots.js         # Provider configuration handling
│   └── adapters/        # LLM specific API handlers (OpenAI, Gemini)
├── icon.png             # Master icon (512x512)
└── docs/                # Architecture records and decision logs
```

## Contributing

- Keep all logic in modular, native ES components.
- Do not introduce a build step or NPM dependencies (other than for testing).
- Adhere strictly to the terminal brutalism design language (no native modals, `<dialog>` tags, or rounded corners).
