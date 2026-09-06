# beitdin

```
 ▄  ▄  ▄
 █  █  █
 █  █  █
 █  █  █
 ▀  ▀  ▀
```

If you want to supercharge your planning phase using AI, this is the tool.

Beitdin lets you run multiple LLMs together, bringing multiple different perspectives from different providers and models toward one single goal. Configure three APIs, assign each one a distinct system prompt (a role), feed them a single brief, and watch it generate three parallel outputs. 

Want more? Shuffle the roles and generate three, six, or nine different expert opinions. If you want to thoroughly interrogate your plans and turn every stone before committing to a task, this is the ultimate tool in your toolbox.

A *beit din* is a court, and it sits with three judges: one matter, three people who know different things, one ruling. That is the shape of this tool, so it borrowed the name.

**This is not a model comparison tool**, though you can use it that way if you want. It is not asking which model wrote the better answer to the same question. The lanes ask different questions of the same brief. They compose into a single markdown file that you can hand onward.

The app is a static page. It talks straight to the provider APIs from the
browser, with no server, no build step and no dependencies.

## Quick start

1. Serve the directory: `python3 -m http.server 8333 --bind 127.0.0.1`
2. Open `http://127.0.0.1:8333` in a desktop browser.
3. Open `settings`, pick a provider per lane, paste a key, press `ping` to load
   the model list.

It has to be served over `http://`. Opening `index.html` from the filesystem
does not work, because browsers block ES modules on `file://`.

Below 1000px wide the app replaces itself with a notice. Three live lanes side
by side is the whole point, and that does not survive a phone.

## Features

- **A role per lane, not just a model.** The lanes differ by system prompt, so
  you get three angles on one brief instead of three attempts at one answer.
- **Three lanes, concurrently.** One brief, three models, three roles, at once.
- **Boards.** A board names the three roles and their system prompts. Two ship
  with the app; you can create, export, import and delete your own.
- **Any provider.** OpenAI, Google Gemini, Mistral, and anything
  OpenAI-compatible, including a local Ollama at `http://localhost:11434/v1`.
- **Accumulating output.** Every run appends to the same markdown document, so
  you can shuffle the roles, run again, and download the lot as one `.md`.

## Security & Privacy

**Highly secure by design:**
- **No backend:** The app is a fully static HTML/JS page. Your brief, data, and API keys go directly from your browser to your chosen AI provider. Data never routes through Beitdin's servers.
- **Keys are not saved to disk:** API keys are stored only in the browser's `sessionStorage`. They disappear completely as soon as you close the tab. They are never written to your hard drive or sent anywhere else.
- **Zero tracking:** The app has no analytics, cookies, third-party scripts, or telemetry. No one is monitoring what you write.
- **No XSS risk:** AI-generated responses are injected using the `textContent` method instead of `innerHTML`, meaning the AI cannot accidentally inject executable code into the page.
- **Strict CSP:** The page enforces a strict Content Security Policy (`script-src 'self'`), blocking any external scripts from loading. `connect-src` is deliberately wide (`https:` plus localhost ports) because a static page cannot rewrite its own policy to cover whatever custom endpoint you type in.

**User Responsibility:**
- **Keys in memory:** As long as the tab is open, your API keys live in the browser's memory in plain text. A malicious browser extension reading page data could theoretically capture them.
- **Endpoint responsibility:** Since you configure the target URL, you are responsible for knowing where your keys are sent.
- **Disclaimer:** This tool is provided "as is", without warranty of any kind. The author takes no responsibility for any misuse, data leaks, API costs, or any other consequences resulting from the use of this software. Use at your own risk.

## Layout

```text
.
├── index.html           # markup, all of the CSS, one module script tag
├── design-system.html   # component catalogue, served the same way
├── manifest.json
├── js/
│   ├── main.js          # entry point
│   ├── ui.js            # DOM wiring, streaming render, board actions
│   ├── orchestrator.js  # runs the three lanes, builds the markdown
│   ├── slots.js         # per-lane provider configuration
│   ├── storage.js       # localStorage wrapper and defaults
│   ├── logos.js         # the three lane marks
│   ├── logohistory.js   # backup of logos for future updates (gitignored)
│   └── adapters/        # openai-compat.js, gemini.js
├── tools/make-icons.py  # regenerates every icon from the mark above
└── docs/                # design system, concept notes
```

## Conventions

- Native ES modules. No build step, no bundler, no npm dependencies.
- Terminal brutalism: monospace throughout, one font size, square corners,
  buttons drawn as `[name]`.
- No native modals and no `<dialog>` elements. Anything that needs input asks
  for it inline, in the bar it belongs to.
- Model output goes through `textContent`.
