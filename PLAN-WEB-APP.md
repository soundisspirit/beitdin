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

- Ei serveria, ei proxya, ei tietokantaa, ei kirjautumista
- Ei tallenneta mitaan kayttajadataa palvelimelle
- Hostaus: GitHub Pages, Cloudflare Pages, Vercel, Netlify - mika tahansa
- Nolla npm-riippuvuuksia, nolla build-steppeja

## Slot-pohjainen konfiguraatio

Sen sijaan että käyttäjä loisi erillisen "palveluntarjoajien rekisterin", konfigurointi tehdään suoraan kolmelle olemassa olevalle slotille (Lane 1, Lane 2, Lane 3). 

Käyttöliittymässä kukin slotti konfiguroidaan suoraviivaisesti:
1. **Palvelun valinta (Endpoint):** Käyttäjä valitsee pudotusvalikosta valmiin (esim. OpenAI, Gemini) tai "Custom" (esim. lokaali Ollama), jolloin hän syöttää oman URL:n.
2. **API-avain:** Käyttäjä syöttää avaimen (tai jättää tyhjäksi lokaaleille).
3. **Testaus:** Sovellus testaa yhteyden ja hakee saatavilla olevat mallit (Model discovery).
4. **Mallin valinta:** Käyttäjä valitsee haluamansa mallin listalta.

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
  availableModels: [],             // taytetaan model discoveryllä
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
- Model discovery epaonnistuminen ei esta tallennusta - kayttaja voi tällöin syottaa mallin nimen kasin.

### URL-validointi ja Custom Providerit

- `https://` pakollinen
- Poikkeus: `http://localhost` ja `http://127.0.0.1` sallittu lokaaleille LLM:ille
- API-avaimen max pituus 2048 merkkia
- **Tietoturvavaroitus:** Kun käyttäjä valitsee palveluksi "Custom" ja syöttää epävirallisen osoitteen, käyttöliittymä näyttää selkeän varoituksen: *"Varoitus: API-avaimesi ja kaikki syöttämäsi data lähetetään tähän osoitteeseen. Käytä vain osoitteita, joihin luotat."* Tämä ehkäisee huijaus-proxyjen käyttöä (Social Engineering).

### Model discovery

Kun kayttaja asettaa API-avaimen ja painaa "Test":
1. **openai-compat**: `GET {baseUrl}/models` -> parsitaan `data[].id`
2. **gemini**: `GET {baseUrl}/models?key={apiKey}` -> parsitaan `models[].name`
3. Status paivittyy "ok" tai "error" + virheilmoitus
4. Jos OK, pudotusvalikkoon päivittyvät löydetyt mallit.

### Adapter-rajapinta

```javascript
async function* call(slotConfig, systemPrompt, userPrompt, jsonSchema, signal) {
  // yield: { type: "delta", text: "..." }
  // viimeinen yield: { type: "done", text, tokensIn, tokensOut, model, latencyMs }
}
```

Async generator mahdollistaa typewriter-renderonnin ilman callback-sotkua.

## Avainten hallinta ja turvallisuus

Koska kyseessä on staattinen SPA ilman backendia, kymmenet perinteiset hyökkäysvektorit (kuten tietokantainjektiot, palvelimen SSRF ja riippuvuuksien toimitusketjuhyökkäykset) on eliminoitu "by-design".

### Tallennus

API-avaimet tallennetaan localStorageen osana slot-konfiguraatiota plaintextina.
Encrypt-without-server ei tuo lisaturvaa koska salausavain olisi samassa selaimessa.

Avainkentta on `type="password"`, `autocomplete="off"`.
UI ei koskaan nayta avainta kokonaan.

Avaimet eivat koskaan:
- Lahde mihinkaan muualle kuin suoraan määritettyyn API-endpointiin
- Paady URL-parametreihin (paitsi Gemini, jossa `Referrer-Policy: no-referrer`)
- Nayteta virheviestissa, lokissa tai exportoidussa markdownissa
- Tallennu DOM:iin nakyvan tekstina

### Tietoturvaperiaatteet

- **CSP-politiikka**: `default-src 'self'; script-src 'self'; style-src 'self'; connect-src https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; form-action 'none'`
  *Huom:* `connect-src` on tarkoituksella höllennetty sallimaan `https:` ja lokaalit portit. Koska staattinen SPA ei voi dynaamisesti muokata CSP:tä käyttäjän lisäämien custom-endpointien (kuten lokaali Ollama) perusteella, tiukka whitelist estäisi niiden käytön selaimen tasolla CORSista riippumatta. Nollan riippuvuuden arkkitehtuurissa tämä on hyväksyttävä kompromissi.
- **Referrer-Policy (Gemini API -suojaus)**: HTML:n `<head>`-osiossa on `<meta name="referrer" content="no-referrer">`. Tämä estää Geminin URL:ssä sijaitsevan API-avaimen vuotamisen `Referer`-otsakkeessa.
- **Ei kolmannen osapuolen skripteja**: ei analytiikkaa, ei CDN-kirjastoja, ei fontti-CDN:ia.
- **XSS-suojaus (LLM05-torjunta)**: Kaikki kayttaja- ja mallisisalto (LLM:n palauttamat vastaukset) renderoidaan **yksinomaan** `textContent`:lla, ei koskaan `innerHTML`:lla. 
- **Ei iframea**: `frame-ancestors 'none'`
- **HTTPS only**: HTTP:ta ei tueta tuotannossa (paitsi lokaalille `localhostille`).

### Asetuspaneelin toiminnot (Data Privacy)

- "Tyhjenna avaimet": nollaa muistissa olevat avaimet ja keskeyttaa kaynissa olevat pyynnot
- "Tyhjenna paikalliset tiedot": poistaa kaikki `apb_`-avaimet localStoragesta, kaksivaiheinen vahvistus.
- **Tietosuoja:** Briefia ja LLM:n palauttamia vastauksia ei koskaan tallenneta localStorageen. Nämä elävät vain muistissa ja häviävät sivun päivityksessä.

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
    |  Kukin palauttaa: JSON-schemaa vasten validoitu vastaus
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

`Promise.allSettled` on kriittinen: yksittaisen lanen virhe ei kaada muita.

Jokainen kutsu saa oman `AbortController`-instanssin 90s timeoutilla.
Cancel-nappi abortoi kaikki kaynissa olevat kutsut.

### Ajon tilakone

```
idle -> contract -> fanout -> composing -> complete | partial | failed | cancelled
```

- Uutta ajoa ei kaynnisteta kun edellinen on kaynissa
- Cancel on idempotentti: abortoi controllerit, merkitsee lanet peruutetuiksi
- Myohassa saapuvat deltat hylätaan runId-tarkistuksella

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

SSE-parseri on oma funktio (~30 rivia), ei kirjastoa. EventSource-APIa ei kayteta koska
POST-kutsut eivat tue sita.

### DOM-paivitykset

Streaming-deltat puskuroidaan ja renderoidaan `requestAnimationFrame`-syklissa.
Enintaan yksi DOM-paivitys per frame per lane.

## Boardit

- Kaksi built-in boardia (Architecture, Product) - kovakoodattu JS:aan
- Custom boardit localStorageen JSON-arrayna
- Board = nimi + 3 roolia (title + focus per rooli)
- Custom boardin voi poistaa (vahvistus-dialogi), built-in ei
- Max 100 custom boardia
- Boardin nimi uniikki (case-insensitive)

## Brief

- Minimipituus: 10 merkkia (run disabled jos lyhyempi)
- Maksimipituus: 12 000 merkkia (kentta estaa lisasyoton)
- Merkkilaskuri nakyy kentan alla

## UI

Sailytetaan nykyisesta:
- Titlebar: nimi, about-sivu, agents-sivu, shuffle, run
  - **About-sivun sisältö (Arvolupaus):** "Käyttäjäarvo (User value): Erittäin korkea kohderyhmälle. Tämä on "särkylääke" siihen copy-paste-uupumukseen, kun joudut avaamaan ChatGPT:n, Clauden ja Geminin eri välilehdille saadaksesi usean mallin näkemyksen koodiarkkitehtuuriin tai ideaan. Yksi klikkaus, kolme aivoa, yksi tiedosto."
- Kolme lanea block-logoilla ja typewriter-efektilla
- Footer: status-animaatio (running.../complete/failed) + download .md
- New board -modal

Lisataan / Muutetaan:
- Settings-paneeli (gear-ikoni)
  - **Slot 1, 2 ja 3 konfiguraatiot suoraan allekkain**
  - Palvelun valinta (OpenAI, Gemini, Mistral, Custom)
  - API-avaimen syöttö ja "Test"-nappi
  - Mallin valinta pudotusvalikosta
  - "Tyhjenna avaimet" ja "Tyhjenna paikalliset tiedot" -napit
- Cancel-nappi ajon aikana
- `beforeunload`-varoitus kun complete + ei ladattu .md:ta
- Run-napin disabled-tila syyselityksella ("ei aktiivisia slotteja" / "briifi on tyhja")
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
| Ei aktiivisia slotteja | - | Asetukset-näkymä, run disabled | - |

Retry on adapterissa, ei orkestraattorissa. Samat parametrit, uusi request.
Yksi ajo tekee enintaan 8 kutsua: 4 alkuperaista + enintaan 4 korjausyrittysta.

## Tietomalli (localStorage)

| Avain | Sisalto | Koko (max) |
|-------|---------|------------|
| `apb_slots` | 3 slotin array (palvelu, url, avain, malli, status) | ~2 KB |
| `apb_boards_custom` | Custom boardit | ~10 KB |
| `apb_ui_state` | Viimeisin board, asetustila | ~100 B |
| `apb_schema_version` | Skeemaversio migraatioita varten | pieni |

Kaikki avaimet `apb_`-prefixilla. `QuotaExceededError` kasitellaan.

`storage.js` validoi luetun arvon. Virheellinen tai vanhan skeeman arvo korvataan turvallisella oletuksella ja kirjataan lokiin. Kirjoitus on atominen.

## Havainnointi

Rengaspuskuri (200 tapahtumaa) muistissa:

```javascript
{ ts, level, source, event, meta: { slotIndex, model, latencyMs, tokensIn, statusCode } }
```

Nakyy kayttajalle:
- Footer: per-lane tila, kokonaisaika, tokenit
- Settings -> Debug: viimeisimmat 50 tapahtumaa
- `console.debug()` jokaisesta tapahtumasta (HUOM: Varmista, ettei API-avaimia vuodeta debug-lokiin missään muodossa.)

Ei ulkoista telemetriaa, ei analytiikkaa. Kustannus: 0 EUR.

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
