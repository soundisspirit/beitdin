# API Agent Board - Konseptin kiteytys

## Ongelmanasettelu
Kuinka voisimme poistaa manuaalisen copy-paste-työn tehokäyttäjiltä, jotka haluavat iteroida ideoita tai koodia samanaikaisesti kolmella eri tekoälymallilla, ja paketoida tulokset suoraan yhteen jatkojalostettavaan tiedostoon?

## Valittu suunta
Staattinen, selaimessa pyörivä SPA (Zero-infra, Bring Your Own Key). Työkalu sisältää 3 konfiguroitavaa kaistaa (slottia), jotka ajavat saman tehtävän rinnakkain eri malleilla (esim. OpenAI, Gemini, lokaali Ollama). Tuotokset yhdistetään ajon päätteeksi yhdeksi `.md`-dokumentiksi ladattavaksi. Työkalu on suunnattu teknisille käyttäjille ("nörteille").

## Piilevät oletukset (Stressitesti)
- **Oletus 1 (CORS & Lokaalit mallit):** Oletamme, että käyttäjien omat lokaalit työkalut (esim. Ollama) sallivat selaimen CORS-pyynnöt. (Vaatii mahdollisesti käyttäjältä `OLLAMA_ORIGINS="*"` -määrityksen).
- **Oletus 2 (Markdownin hyödyllisyys):** Oletamme, että 3 mallin yhdistetty `.md`-tiedosto (Compose-vaihe) on rakenteeltaan suoraan käyttökelpoinen seuraavalle tekoälylle ilman merkittävää manuaalista siivoamista.

## MVP Scope (Mitä rakennetaan ensimmäisenä)
- 3 rinnakkaista kaistaa suoralla avain/url-konfiguraatiolla (tallennus localStorageen).
- `openai-compat` ja `gemini` -adapterit.
- Synkroninen yhdistämisvaihe (Compose), joka tuottaa `.md`-tiedoston.
- Yksinkertainen, mutta sulava striimaava UI (Typewriter-efekti ja `requestAnimationFrame` -optimointi).

## Not Doing (Mitä EI tehdä ja miksi)
- **Ei palvelinta tai tilejä:** Nostaisi ylläpitokustannukset nollasta maksulliseksi ja toisi tietoturvavastuita.
- **Ei monimutkaista Agentti-orkestraatiota:** Kaistat eivät keskustele ristiin (vähentää API-kuluja ja latenssia, pitää arkkitehtuurin yksinkertaisena).
- **Ei yli kolmea slottia:** Kolme on visuaalisesti maksimi, joka mahtuu siististi työpöytänäytölle ilman horisontaalista scrollausta.
- **Ei prompt-historian tallennusta (localStorageen):** Maksimoi tietosuojan ja estää selaimen muistin täyttymisen.
