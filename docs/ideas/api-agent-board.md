# API Agent Board - concept summary

## Problem statement
How could we remove the manual copy-paste work from power users who want to iterate on ideas or code with three different AI models at once, and package the results straight into a single file that can be worked on further?

## Chosen direction
A static, browser-resident SPA (zero infra, bring your own key). The tool has 3 configurable lanes that run the same task in parallel against different models (for example OpenAI, Gemini, a local Ollama). At the end of a run the outputs are merged into one downloadable `.md` document. The tool is aimed at technical users ("nerds").

## Hidden assumptions (stress test)
- **Assumption 1 (CORS and local models):** We assume that users' own local tools (for example Ollama) allow CORS requests from the browser. (This may require the user to set `OLLAMA_ORIGINS="*"`.)
- **Assumption 2 (usefulness of the markdown):** We assume that the merged `.md` file from 3 models (the compose step) is structured well enough to feed straight into the next AI without significant manual cleanup.

## MVP scope (what gets built first)
- 3 parallel lanes with direct key/url configuration (persisted to localStorage).
- `openai-compat` and `gemini` adapters.
- A synchronous merge step (compose) that produces the `.md` file.
- A simple but smooth streaming UI (typewriter effect and `requestAnimationFrame` batching).

## Not doing (what we are NOT building, and why)
- **No server or accounts:** Would raise running costs from zero to paid and bring security obligations with it.
- **No complex agent orchestration:** Lanes do not talk to each other (keeps API cost and latency down, keeps the architecture simple).
- **No more than three lanes:** Three is the visual maximum that fits a desktop screen cleanly without horizontal scrolling.
- **No prompt history in localStorage:** Maximises privacy and stops the browser store from filling up.
