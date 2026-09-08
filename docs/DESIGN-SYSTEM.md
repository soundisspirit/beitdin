# beitdin - Design System

This document defines the UI/UX rules for the application. The design leans hard into a brutalist, retro terminal/hacker aesthetic. The goal is a tool that looks as if it were running on a command line, while still using the browser's layout capabilities.

## 1. Colour palette (CSS variables)

We use a deliberately narrow palette:

| CSS variable | Colour | Description / where it is used |
| :--- | :--- | :--- |
| `--bg` | `#000000` | Main background. True black. |
| `--amber` | `#ffb000` | Primary accent. Links, active states, cursors, marks. |
| `--amber-dim` | `#a06e00` | Dimmed accent. Headings in modals, the key half of key/value pairs. |
| `--ink` | `#d7ded3` | Main text colour (light grey). Body copy. |
| `--frame` | `#4a4a4a` | Borders, dividers and inactive elements. |
| `--frame-hi` | `#6e6e6e` | Stronger borders, and inactive status indicators. |
| `--red` | `#ff5555` | Error states and failures. |
| `--cyan` | `#00e5ff` | Tutorial accent. Tutorial windows, highlights, and guided controls. |
| `--cyan-dim` | `#008b99` | Dimmed tutorial accent. Secondary borders and subtle callouts. |

## 2. Typography

**Font family:**
```css
--mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```
All text in the application is monospace.

**Base rules:**
- **Text transform:** The whole application is `lowercase` by default, including buttons, headings and dropdowns. (The exceptions are text the user types and markdown returned by the LLM.)
- **Base size:** `13px` with a line height of `1.55`.
- **Letter spacing:** `.02em` on body text, for a slight terminal feel.

## 3. Brand mark

The application mark is three lanes:

```
 ▄  ▄  ▄
 █  █  █
 █  █  █
 █  █  █
 ▀  ▀  ▀
```

Read on a 9x5 character grid: the bars occupy columns 1, 4 and 7, and each runs
from halfway down the first row (`▄`) to halfway down the last (`▀`), making it
four rows tall. A monospace cell is 0.6 as wide as it is tall, so the inked area
is 7 bar-widths across and 20/3 bar-widths tall, very nearly square.

Every icon in the repo is derived from that geometry rather than drawn by hand,
so the two cannot drift apart. `tools/make-icons.py` regenerates `favicon.ico`
(16/32/48/64), `icon.png`, `icon-512.png`, `icon-192.png` and
`apple-touch-icon.png` as `--amber` bars on a `--bg` field. Change the geometry
in one place and re-run it.

The mark is distinct from the three per-lane marks in `js/logos.js`: this one
identifies the application, those identify a lane.

## 4. Components

### Buttons
Buttons read as command line commands. They are wrapped in square brackets using pseudo elements (`::before`, `::after`).
```css
.btn {
  background: none;
  border: 0;
  color: var(--ink);
  font-weight: 700;
  text-transform: lowercase;
}
.btn::before { content: "["; }
.btn::after { content: "]"; }
.btn:hover { background: #000; color: var(--amber); }
```

### Typewriter cursor
Active input or streaming is shown with a blinking cursor.
```css
.cursor {
  display: inline-block;
  width: 8px;
  height: 14px;
  background: var(--amber);
  animation: blink 0.9s steps(2, start) infinite;
}
@keyframes blink { 50% { opacity: 0.15; } }
```

### Modals and dialogs
- **Backdrop:** Black at `rgba(0,0,0,0.75)`.
- **Window:** Background `#111` (slightly lighter than black), border `--amber-dim`.
- **Fields (input/textarea):** Transparent background, `--frame` border, `--ink` text. Focus turns the border `--amber`. `caret-color: var(--amber);`.

## 5. Layout and structure

The application is split into clear flexible blocks (`display: flex` and `grid`):
1. **Titlebar:** Top bar. Background `--amber`, text `#000`. This departs from the rest of the theme deliberately, to act as a visual anchor.
2. **Promptbox:** The brief field at the top. Expands on focus.
3. **Lanes:** The main area is split by CSS Grid into three equal columns (`grid-template-columns: repeat(3, minmax(0, 1fr))`), separated by a 1px `--frame` border.
4. **Lane header:** Each lane carries a centred ASCII mark.
5. **Result / footer:** Summary and status bar along the bottom.

## 6. Animation
Animation is used only where it reports state. The marks are static: they are an
identifier, not an effect.
- **Blink:** The streaming cursor blinks coarsely (`steps(2)`).
- **Term-blink:** The status line blinks while a run is in progress.
