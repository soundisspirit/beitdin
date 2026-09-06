# beitdin

```
 ▄  ▄  ▄
 █  █  █
 █  █  █
 █  █  █
 ▀  ▀  ▀
```

Three specialists read your brief at the same time and hand you one document.

A *beit din* is a rabbinical court, and it sits with exactly three judges: one
matter, three people who know different things, one ruling. That is the shape of
this tool, so it borrowed the name.

Each lane holds a model *and a role*: a title and a system prompt. The same
brief arrives at lane one as a technical architect and at lane two as a security
expert, so the three answers are meant to complement each other, not compete.
They compose into a single markdown file.

**This is not a model comparison tool.** It is not asking which model wrote the
better answer to the same question. The lanes are asking different questions of
the same brief, and the output is a document rather than a scoreboard.

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

## Keys and privacy

API keys are held in `localStorage` in plain text, so anything that can run
JavaScript on this origin can read them. That is the cost of having no server.
Use keys you can revoke, and do not host this on a shared origin.

The brief and the model responses are never persisted. They live in memory and
are gone on reload.

Nothing in the page tracks you: no analytics, no telemetry, no cookies, no third
party scripts. There is no consent banner because there is nothing to consent
to. Whatever server hosts the page will write an ordinary access log, as every
web server does, and that is the only record a visit leaves.

The page ships a CSP that blocks inline and third-party script. `connect-src` is
deliberately wide (`https:` plus localhost ports) because a static page cannot
rewrite its own policy to cover whatever custom endpoint you type in.

Model output is written with `textContent`, never `innerHTML`.

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
