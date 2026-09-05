# API Agent Board - Web App Implementation Plan

Staattinen SPA, nolla infraa. Geneerinen slot-malli - tuo mika tahansa LLM API-avain suoraan kolmelle kaistalle.

## Arkkitehtuuri

```
staattinen SPA (ES modules, ei bundleria)
  ├── localStorage
  │     ├── slot-konfiguraatio (3 slottia: baseUrl, avain, adapterityyppi, malli, status)
  │     ├── custom boardit
  │     ├── UI-tila (viimeisin board, asetukset)
  │     └── schema-versio (migraatioita varten)
  ├── openai-compat -adapteri → OpenAI, Mistral, Groq, Together, OpenRouter, lokaalit LLM:t
  └── gemini -adapteri → Google Gemini
```

- No server, no proxy, no database, no login
- No user data is ever stored on a server
- Hostaus: GitHub Pages, Cloudflare Pages, Vercel, Netlify - mika tahansa
- Nolla npm-riippuvuuksia, nolla build-steppeja

## Slot-pohjainen konfiguraatio

Instead of the user creating a separate "provider registry", configuration happens directly on the three existing slots (Lane 1, Lane 2, Lane 3).

In the UI each slot is configured in a straightforward way:
1. **Service selection (endpoint):** The user picks a preset from a dropdown (for example OpenAI, Gemini) or "Custom" (for example a local Ollama), in which case they enter their own URL.
2. **API key:** The user enters a key (or leaves it empty for local models).
3. **Testaus:** Sovellus testaa yhteyden ja hakee saatavilla olevat mallit (Model discovery).
4. **Model selection:** The user picks the model they want from the list.

Kaksi adapteriprotokollaa kattavat kaiken:

| Protokolla | Kattaa | Endpoint | JSON-pakotus | Auth |
|------------|--------|----------|-------------|------|
| `openai-compat` | OpenAI, Mistral, Groq, Together, OpenRouter, lokaalit (Ollama, LM Studio) | `{baseUrl}/chat/completions` | `response_format: { type: "json_object" }` | `Authorization: Bearer ...` (tyhja sallittu lokaaleille) |
| `gemini` | Google Gemini | `{baseUrl}/models/{model}:generateContent` | `responseMimeType + responseSchema` | `?key=...` (query param) |

Yhden slotin tietorakenne (`localStorage`):

```javascript
{
  slotIndex: 0,                    // 0, 1, 2
  enabled: true,
  service: "openai",               // "openai", "gemini", "mistral", "custom"...
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-...",                // tyhja sallittu (Ollama, LM Studio)
  adapterType: "openai-compat",    // "openai-compat" | "gemini"
  availableModels: [],             // filled in by model discovery
  selectedModel: "gpt-4o",
  status: "untested",              // "untested" | "ok" | "error"
  lastError: null                  // viimeisin virheviesti
}
```

### Slotin tilakone

```
muutos asetuksiin -> untested (vaatii testin)
             |
        Test-nappi
           / \
         ok   error
```

- URL:n, palvelun tai avaimen muutos -> status palaa `untested`
- A failed model discovery does not block saving: the user can type the model name by hand instead.

### URL-validointi ja Custom Providerit

- `https://` pakollinen
- Poikkeus: `http://localhost` ja `http://127.0.0.1` sallittu lokaaleille LLM:ille
- API key max length 2048 characters
- **Security warning:** When the user picks "Custom" as the service and enters an unofficial address, the UI shows a clear warning: *"Warning: your API key and everything you type is sent to this address. Only use addresses you trust."* This guards against proxy-based social engineering.

### Model discovery

When the user sets an API key and presses "Test":
1. **openai-compat**: `GET {baseUrl}/models` -> parsitaan `data[].id`
2. **gemini**: `GET {baseUrl}/models?key={apiKey}` -> parsitaan `models[].name`
3. Status paivittyy "ok" tai "error" + virheilmoitus
4. If it succeeds, the dropdown is populated with the discovered models.

### Adapter-rajapinta

```javascript
async function* call(slotConfig, systemPrompt, userPrompt, jsonSchema, signal) {
  // yield: { type: "delta", text: "..." }
  // viimeinen yield: { type: "done", text, tokensIn, tokensOut, model, latencyMs }
}
```

Async generator mahdollistaa typewriter-renderonnin ilman callback-sotkua.

## Avainten hallinta ja turvallisuus

Because this is a static SPA with no backend, dozens of traditional attack vectors (database injection, server-side SSRF, dependency supply chain attacks) are eliminated by design.

### Tallennus

API-avaimet tallennetaan localStorageen osana slot-konfiguraatiota plaintextina.
Encrypt-without-server adds no real protection, because the encryption key would sit in the same browser.

Avainkentta on `type="password"`, `autocomplete="off"`.
The UI never shows the key in full.

Avaimet eivat koskaan:
- Send anywhere other than directly to the configured API endpoint
- Paady URL-parametreihin (paitsi Gemini, jossa `Referrer-Policy: no-referrer`)
- Nayteta virheviestissa, lokissa tai exportoidussa markdownissa
- Tallennu DOM:iin nakyvan tekstina

### Tietoturvaperiaatteet

- **CSP-politiikka**: `default-src 'self'; script-src 'self'; style-src 'self'; connect-src https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; form-action 'none'`
  *Note:* `connect-src` is deliberately loosened to allow `https:` and local ports. Because a static SPA cannot rewrite its own CSP based on custom endpoints the user adds (such as a local Ollama), a strict allowlist would block those at the browser level regardless of CORS. In a zero-dependency architecture this is an acceptable trade-off.
- **Referrer-Policy (Gemini API protection)**: The HTML `<head>` carries `<meta name="referrer" content="no-referrer">`. This stops the API key that sits in the Gemini URL from leaking through the `Referer` header.
- **No third-party scripts**: no analytics, no CDN libraries, no font CDN.
- **XSS protection (LLM05 mitigation)**: all user and model content (responses returned by the LLM) is rendered **exclusively** with `textContent`, never with `innerHTML`.
- **Ei iframea**: `frame-ancestors 'none'`
- **HTTPS only**: HTTP:ta ei tueta tuotannossa (paitsi lokaalille `localhostille`).

### Asetuspaneelin toiminnot (Data Privacy)

- "Tyhjenna avaimet": nollaa muistissa olevat avaimet ja keskeyttaa kaynissa olevat pyynnot
- "Tyhjenna paikalliset tiedot": poistaa kaikki `apb_`-avaimet localStoragesta, kaksivaiheinen vahvistus.
- **Privacy:** The brief and the responses returned by the LLM are never written to localStorage. They live only in memory and are gone on reload.

## Orkestraatio

Sama pipeline kuin nykyinen Python-backend, JavaScriptilla:

```
[Brief]
    |
    v
0. JAADYTYS (board, slotit ja mallit lukitaan ajon alussa)
    |
    v
1. CONTRACT (yksi kutsu ensimmaiseen aktiiviseen slottiin)
    |  Luo shared ground
    |  Virhe -> jatketaan ilman shared groundia
    |
    v
2. FAN-OUT (Promise.allSettled, rinnakkaiset kutsut)
    |  Kukin aktiivinen slot saa: board-roolin prompt + shared ground + brief
    |  Each returns: a response validated against the JSON schema
    |
    v
3. COMPOSE (synkroninen)
    |  Yhdistaa onnistuneet vastaukset markdown-dokumentiksi
    |  Epaonnistuneet lanet merkitaan [FAILED: syy]
    |
    v
[Rendered document + download]
```

Ajon parametrit jaadytetaan kaynnistyksessa. Asetusmuutokset ajon aikana eivat vaikuta kaynissa olevaan ajoon.

`Promise.allSettled` is essential: a failure in one lane must not bring down the others.

Jokainen kutsu saa oman `AbortController`-instanssin 90s timeoutilla.
Cancel-nappi abortoi kaikki kaynissa olevat kutsut.

### Ajon tilakone

```
idle -> contract -> fanout -> composing -> complete | partial | failed | cancelled
```

- A new run is not started while the previous one is still going
- Cancel on idempotentti: abortoi controllerit, merkitsee lanet peruutetuiksi
- Deltas that arrive late are discarded by a runId check

## Streaming

```javascript
const response = await fetch(url, { method: "POST", headers, body, signal });
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // parsitaan "data: {...}\n\n" -rivit bufferista
}
```

The SSE parser is its own function (~30 lines), not a library. The EventSource API is not used because
POST requests are not supported by it.

### DOM-paivitykset

Streaming-deltat puskuroidaan ja renderoidaan `requestAnimationFrame`-syklissa.
At most one DOM update per frame per lane.

## Boardit

- Kaksi built-in boardia (Architecture, Product) - kovakoodattu JS:aan
- Custom boardit localStorageen JSON-arrayna
- Board = nimi + 3 roolia (title + focus per rooli)
- A custom board can be deleted (with a confirmation step), a built-in one cannot
- Max 100 custom boardia
- Boardin nimi uniikki (case-insensitive)

## Brief

- Minimum length: 10 characters (run disabled below that)
- Maximum length: 12,000 characters (the field blocks further input)
- Merkkilaskuri nakyy kentan alla

## UI

Sailytetaan nykyisesta:
- Titlebar: nimi, about-sivu, agents-sivu, shuffle, run
  - **About page content (value proposition):** "User value: very high for the target audience. This is the painkiller for the copy-paste fatigue of opening ChatGPT, Claude and Gemini in three tabs just to get several models' takes on a code architecture or an idea. One click, three brains, one file."
- Three lanes with block marks and a typewriter effect
- Footer: status-animaatio (running.../complete/failed) + download .md
- New board -modal

Lisataan / Muutetaan:
- Settings-paneeli (gear-ikoni)
  - **Slot 1, 2 ja 3 konfiguraatiot suoraan allekkain**
  - Palvelun valinta (OpenAI, Gemini, Mistral, Custom)
  - API key entry and a "Test" button
  - Mallin valinta pudotusvalikosta
  - "Tyhjenna avaimet" ja "Tyhjenna paikalliset tiedot" -napit
- Cancel-nappi ajon aikana
- A `beforeunload` warning when a run is complete and the .md has not been downloaded
- The run button carries a disabled state with a reason ("no active slots" / "brief is empty")
- Logot dynaamisesti slotin palvelun nimeen perustuvat
- Modaalit `<dialog>` + `showModal()` (natiivi focus trap)

## Virhekasittely

| Virhetyyppi | HTTP | Toimenpide | Retry |
|-------------|------|-----------|-------|
| Auth-virhe | 401, 403 | "invalid api key" lanessa | 0 |
| Rate limit | 429 | Lue `Retry-After`, fallback 3s | 1 |
| Palvelinvirhe | 500, 502, 503 | Retry 2s viiveella | 1 |
| Timeout | - | "request timed out" (90s) | 0 |
| Verkkovirhe | TypeError | "no network connection" | 0 |
| JSON parse | 200 invalid | Retry tiukemmalla promptilla | 1 |
| Contract-virhe | mika tahansa | Jatka ilman shared groundia | 0 |
| No active slots | - | Settings view, run disabled | - |

Retry lives in the adapter, not the orchestrator. Same parameters, new request.
Yksi ajo tekee enintaan 8 kutsua: 4 alkuperaista + enintaan 4 korjausyrittysta.

## Tietomalli (localStorage)

| Avain | Sisalto | Koko (max) |
|-------|---------|------------|
| `apb_slots` | 3 slotin array (palvelu, url, avain, malli, status) | ~2 KB |
| `apb_boards_custom` | Custom boardit | ~10 KB |
| `apb_ui_state` | Viimeisin board, asetustila | ~100 B |
| `apb_schema_version` | Skeemaversio migraatioita varten | pieni |

Kaikki avaimet `apb_`-prefixilla. `QuotaExceededError` kasitellaan.

`storage.js` validates what it reads. An invalid value, or one from an older schema, is replaced with a safe default and logged. Writes are atomic.

## Havainnointi

Rengaspuskuri (200 tapahtumaa) muistissa:

```javascript
{ ts, level, source, event, meta: { slotIndex, model, latencyMs, tokensIn, statusCode } }
```

Nakyy kayttajalle:
- Footer: per-lane tila, kokonaisaika, tokenit
- Settings -> Debug: viimeisimmat 50 tapahtumaa
- `console.debug()` for every event (NOTE: make sure API keys never leak into the debug log in any form.)

No external telemetry, no analytics. Cost: 0 EUR.

## Tiedostorakenne

```
index.html              # shell + CSS + meta referrer + <script type="module">
js/
  adapters/
    openai-compat.js    # OpenAI-yhteensopiva protokolla
    gemini.js           # Google Gemini protokolla
  slots.js              # 3 slotin konfiguraatio, model discovery ja validointi
  orchestrator.js       # Contract -> fan-out -> compose + ajon tilakone
  boards.js             # Built-in + custom boardit
  storage.js            # localStorage-abstraktio, validointi, migraatiot
  event-log.js          # Rengaspuskuri-debug-loki
  ui.js                 # DOM, typewriter, streaming, rAF-batchaus, modaalit
```

## Jarjestys

1. Adapter-rajapinta + openai-compat adapteri
2. Gemini-adapteri
3. Slot-tilarakenne (`slots.js`) + localStorage 
4. Orkestraatio JS:lla (contract + fan-out + compose)
5. UI: lanet, typewriter, streaming, rAF-batchaus
6. Settings-paneeli (suorat Slot 1, 2, 3 asetukset, model discovery)
7. Custom boardit + boardin nimi -validointi
8. Modaalit: `<dialog>` + `showModal()`
9. Tietoturvaviimeistely: CSP, meta referrer, varoitustekstit
10. Viimeistely, Deploy (GitHub Pages)
