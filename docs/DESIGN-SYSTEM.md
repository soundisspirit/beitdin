# API Agent Board - Design System

Tämä dokumentti määrittelee sovelluksen ulkoasun (UI/UX) säännöt. Design nojaa vahvasti brutalistiseen, retrohenkiseen terminaali/hakkeri-estetiikkaan. Tavoitteena on työkalu, joka näyttää siltä kuin se pyörisi komentorivillä, mutta hyödyntää selaimen layout-ominaisuuksia.

## 1. Väripaletti (CSS Variables)

Käytämme rajattua, tarkasti harkittua väripalettia:

| CSS Muuttuja | Värikoodi | Kuvaus / Käyttökohde |
| :--- | :--- | :--- |
| `--bg` | `#000000` | Päätaustaväri. Aito musta. |
| `--amber` | `#ffb000` | Ensisijainen korostusväri (Primary / Accent). Linkit, aktiiviset tilat, kursorit, logot. |
| `--amber-dim` | `#a06e00` | Himmennetty korostusväri. Otsikot modaleissa, avain-arvo -parien avaimet. |
| `--ink` | `#d7ded3` | Päätekstin väri (Light gray). Perusteksti, leipäteksti. |
| `--frame` | `#4a4a4a` | Reunukset (Borders), jakajat ja inaktiiviset elementit. |
| `--frame-hi` | `#6e6e6e` | Korostetummat reunukset tai inaktiiviset tilanilmaisimet. |
| `--red` | `#ff5555` | Virhetilat, epäonnistumiset (Error). |

## 2. Typografia

**Fonttiperhe:**
```css
--mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```
Kaikki teksti koko sovelluksessa on tasalevyistä (monospace).

**Perussäännöt:**
- **Text-transform:** Koko sovelluksen perusilme on `lowercase` (pienet kirjaimet), mukaan lukien napit, otsikot ja pudotusvalikot. (Poikkeuksena käyttäjän syöttämä teksti ja LLM:n palauttama markdown).
- **Peruskoko:** `13px` / riviväli `1.55`.
- **Kirjainväli (Letter-spacing):** `.02em` perustekstissä, tuomaan pientä terminaali-tuntumaa.

## 3. Komponentit

### Painikkeet (Buttons)
Napit näyttävät komentorivikomennoilta. Ne ympäröidään hakasulkeilla pseudo-elementtien (`::before`, `::after`) avulla.
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

### Typewriter-kursori
Aktiivinen syöttö tai streamaus esitetään vilkkuvalla kursorilla.
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

### Modaalit ja Dialogit
- **Tausta:** Musta tausta `rgba(0,0,0,0.75)`.
- **Ikkuna:** Taustaväri `#111` (hieman mustaa vaaleampi), reunus `--amber-dim`.
- **Kentät (Input/Textarea):** Tausta läpinäkyvä `transparent`, reunus `--frame`, tekstiväri `--ink`. Fokusointi muuttaa reunuksen `--amber`-väriin. `caret-color: var(--amber);`.

## 4. Layout ja Rakenne

Sovellus on jaettu selkeisiin joustaviin lohkoihin (`display: flex` ja `grid`):
1. **Titlebar:** Yläpalkki. Taustaväri `--amber`, teksti `#000` (musta). Tämä poikkeaa muusta teemasta toimiakseen visuaalisena ankkurina.
2. **Promptbox:** Yläosan tekstikenttä tehtävänannolle. Laajenee fokusoitaessa.
3. **Lanes (Kaistat):** Pääalue on jaettu CSS Gridillä kolmeen yhtä suureen sarakkeeseen (`grid-template-columns: repeat(3, minmax(0, 1fr))`). Sarakkeiden välillä on `--frame` värinen 1px raja.
4. **Lane Header:** Jokaisella kaistalla on keskitetty ASCII-logo.
5. **Result / Footer:** Alareunassa yhteenveto ja tilapalkki.

## 5. Animoinnit
Animaatioita käytetään vain siellä missä ne kertovat tilasta. Logot ovat
staattisia: ne ovat tunnus, eivät efekti.
- **Blink:** Striimauskursori vilkkuu karkeasti (`steps(2)`).
- **Term-blink:** Tilarivi vilkkuu ajon ollessa käynnissä.
