# AI Agent Pool -hautumo: arkkitehtuurisuunnitelman arviointi

Arvioitu: 2026-08-20
Kohde: "Arkkitehtuuriraportti ja Tekninen Spesifikaatio: Asynkroninen AI Agent Pool -Hautumo"

> **Huomio jälkikäteen.** Tämä on arvio alkuperäisestä pilviarkkitehtuurisuunnitelmasta.
> Lopulta rakennettiin paljon pienempi asia: yksi paikallinen Python-sovellus, ei
> pilveä, ei tietokantaa, ei jonoa, ei A2A:ta. Kohtien 5.1 (Firebase), 6.1 ja 6.2
> (A2A) suositukset eivät siis toteutuneet, ja ne jäivät dokumenttiin vain siksi,
> että päätösten perustelut säilyisivät. Toteutuksen kuvaus on `README.md`-tiedostossa.
> Kohdan 4 artefaktikeskeisyys ja kohdan 3 kritiikki sen sijaan ohjasivat suoraan sitä,
> mitä rakennettiin.

## 1. Tiivistelmä

Suunnitelma on infrastruktuurin osalta pätevä ja tuotantokelpoinen, mutta se ratkaisee väärän ongelman ensin. Dokumentti käyttää noin 80 % tilastaan siihen, miten kolmen LLM-agentin keskustelu ajetaan luotettavasti taustalla, ja lähes ei lainkaan siihen, tuottaako se keskustelu mitään arvokasta. Koko konseptin riski on jälkimmäisessä.

Konkreettisesti: ehdotettu pino (FastAPI + Celery + Redis + PostgreSQL + Cloud Run + kontekstikompaktio + Redlock + circuit breaker) on noin 2 to 4 viikon rakennusurakka. Sen ydinkysymyksen testaaminen, tuottaako kolmen mallin väittely paremman arkkitehtuuridokumentin kuin yksi malli hyvällä promptilla, vie yhden illan yhdellä Python-skriptillä ilman tietokantaa, jonoa tai pilveä.

Suositus: rakenna kertakäyttöinen prototyyppi ensin, mittaa tulos, ja vasta sitten tuotantoistus. Jos väittely ei tuota lisäarvoa, säästät koko urakan. Jos tuottaa, prototyyppi kertoo mitä oikeasti pitää rakentaa, ja lopputulos on eri kuin tämä suunnitelma.

**Valittu suunta (päivitetty):** hautumo toteutetaan A2A-agenttina ilman omaa web-käyttöliittymää, MCP-kääreellä koodityökaluja varten. Katso kohta 6.2. Tämä poistaa käyttöliittymätyön kokonaan ja saa suuren osan suunnitelman omista mekanismeista (striimaus, webhookit, statuskyselyt, käyttäjä silmukassa) valmiina protokollasta.

Alla kohta 3 listaa suunnitelman todelliset virheet, kohta 4 esittää arkkitehtuurisen suunnanmuutoksen joka poistaa suunnitelman monimutkaisimman osan kokonaan, ja kohta 7 antaa vaiheistetun etenemispolun.

## 2. Mikä suunnitelmassa on oikein

Nämä kannattaa pitää sellaisenaan:

- **Asynkroninen työjono ja HTTP 202.** Aivan oikea perusratkaisu. LLM-luuppi ei kuulu HTTP-pyynnön sisään.
- **PostgreSQL tilan ja historian säilytykseen, Redis vain apuroolissa.** Oikea työnjako. Alkuperäisen muokkaamattoman lokin säilyttäminen auditointia varten on hyvä periaate.
- **Tenacity ja eksponentiaalinen perääntyminen satunnaistuksella.** Oikea kirjasto, oikea kuvio, ja `retry_if_exception_type` erottelemaan ohimenevät virheet pysyvistä on täsmälleen se kohta johon useimmat toteutukset kompastuvat.
- **Kontitus ja alustariippumattomuus.** Järkevä varmistus, ja tässä tapauksessa halpa toteuttaa.
- **Roolitus (fasilitaattori, arkkitehti, kriitikko).** Erilaistetut roolit ovat oleellisesti parempi lähtökohta kuin kolme identtistä agenttia.

## 3. Kriittiset ongelmat

### 3.1 Konsensuksen tunnistus merkkijonohaulla on rikki

```python
if "[HYVÄKSYTTY]" in reply:
```

Malli, joka kirjoittaa "en anna vielä [HYVÄKSYTTY]-merkintää, koska tietoturvaosio puuttuu", kuittaa hyväksynnän. Sama tapahtuu, jos malli siteeraa ohjeistustaan tai kuvailee prosessia. Tämä ei ole reunatapaus vaan tyypillinen mallin vastaus.

Korjaus: strukturoitu vastaus, ei vapaa teksti. Jokainen provider tukee tätä natiivisti (OpenAI: `response_format` JSON schemalla, Gemini: `responseSchema`, Mistral: JSON mode). Skeema esimerkiksi:

```json
{
  "verdict": "APPROVE | REVISE | REJECT",
  "blocking_concerns": [{"area": "...", "issue": "...", "proposed_fix": "..."}],
  "spec_patch": "...",
  "rationale": "..."
}
```

`verdict` on enum, jota ei tarvitse arvailla. Lisäksi: hyväksyntä on validi vain, jos `blocking_concerns` on tyhjä. Tämä estää mallia hyväksymästä ja samalla listaamasta ongelmia, mikä on hyvin yleinen käytös.

### 3.2 Konsensuslogiikka ja nollaus ovat epäselviä ja hauraita

Nykyinen logiikka nollaa kaikkien agenttien tilan aina, kun yksi ei hyväksy. Käytännössä tämä tarkoittaa, että konsensus syntyy vain jos kaikki kolme hyväksyvät peräkkäin saman kierroksen aikana. Aikomus on oikea, mutta koodi ei sano sitä ääneen, ja `agent_states`-taulu tallentaa tilan, joka on tosiasiassa kierroskohtainen.

Korjaus: mallinna kierros eksplisiittisesti. `agent_states`-taulun sijaan tai lisäksi `round_number`, ja konsensus tarkoittaa: kaikilla kolmella on `APPROVE` samalla `round_number`-arvolla, eikä kyseisen kierroksen aikana ole syntynyt uutta `spec_patch`-muutosta. Ilman viimeistä ehtoa agentti 1 hyväksyy version A, agentti 3 muuttaa spesifikaatiota, ja järjestelmä julistaa konsensuksen versiosta jota agentti 1 ei ole nähnyt.

### 3.3 Kustannuskatto puuttuu kokonaan

Tämä on suunnitelman vakavin käytännön puute. Laskelma nykyisillä parametreilla:

- `max_turns = 20`, 3 agenttia, eli jopa 60 LLM-kutsua
- kompaktio laukeaa vasta 80 %:ssa 100 000 tokenista, eli syöte on tyypillisesti 40 to 80 tuhatta tokenia per kutsu
- lisäksi kompaktiokutsut itse syövät koko historian syötteenä

Karkeasti tämä on miljoonia syötetokeneita yhtä sessiota kohti. Yksi karannut sessio voi maksaa kymmeniä euroja, ja bugi luupissa moninkertaistaa sen ilman että mikään pysäyttää.

Korjaus, kaikki kolme:
1. Sessiokohtainen euromääräinen budjetti (`budget_cents`), jota vastaan kirjataan jokainen kutsu heti vastauksen jälkeen. Ylitys keskeyttää session tilaan `BUDGET_EXCEEDED`.
2. Aktiivinen konteksti-ikkuna radikaalisti pienemmäksi, luokkaa 15 to 30 tuhatta tokenia, ei 100 000. Katso kohta 4.
3. Kustannus tallennetaan `session_messages`-riville (`input_tokens`, `output_tokens`, `cost_cents`), ei pelkkä `token_usage INT`.

### 3.4 Pseudokoodin luuppi on ristiriidassa dokumentin oman periaatteen kanssa

Teksti sanoo: "Järjestelmä voidaan mallintaa tila-automaattina, jossa jokainen agentin puheenvuoro on erillinen asynkroninen tehtävänsä. Tämä estää yksittäisen pitkän taustaprosessin kaatumisen aiheuttaman koko keskusteluhistorian menetyksen."

Pseudokoodi tekee juuri päinvastoin: yksi `while`-luuppi, joka pyörii jopa 60 LLM-kutsua yhden Celery-taskin sisällä. Jos worker kaatuu tai Cloud Run kierrättää instanssin kesken, sessio jää roikkumaan tilaan `IN_PROGRESS` ilman mitään, joka jatkaisi sitä.

Korjaus: yksi tehtävä = yksi agentin vuoro. Tehtävä lukee tilan kannasta, tekee yhden kutsun, kirjoittaa tuloksen, ja jonottaa seuraavan vuoron. Sessio on tällöin aidosti jatkettavissa mistä tahansa kohdasta, ja kaatunut vuoro voidaan yrittää uudelleen ilman että historia katoaa. Tämä vaatii:
- sessiokohtaisen lukon (Redis), joka estää kahden vuoron ajamisen rinnakkain
- idempotenssiavaimen (`session_id` + `round` + `agent_role` uniikkina), jotta Celeryn uudelleenyritys ei duplikoi viestiä kantaan
- vartijan (esim. minuuttitikki), joka poimii sessiot jotka ovat jumissa yli N minuuttia

### 3.5 Celery on väärä valinta asyncio-koodille

Suunnitelma sanoo "Celery tai ARQ". Nämä eivät ole tasavertaisia tässä tapauksessa. Celeryn asyncio-tuki on edelleen heikko, ja koko työkuorma on puhdasta async I/O:ta. ARQ on natiivisti asyncio-pohjainen ja huomattavasti yksinkertaisempi.

Vahvempi vaihtoehto: jätä broker kokonaan pois ja käytä PostgreSQLia jonona (`SELECT ... FOR UPDATE SKIP LOCKED`). Työmäärä on kymmeniä tehtäviä päivässä, ei tuhansia sekunnissa. Tällöin Redis putoaa pois koko pinosta, ja komponentteja on kaksi vähemmän ylläpidettävänä. Lukot hoituvat Postgresin advisory lockeilla. Suositus: ARQ jos haluat tutun jonoabstraktion, Postgres-jono jos haluat vähiten liikkuvia osia.

### 3.6 JSONB-indeksointi on ennenaikaista optimointia

Dokumentin pisin tekninen osuus käsittelee GIN-indeksejä, `jsonb_path_ops`-operaattoriluokkaa ja ilmentymäindeksejä. Tekninen sisältö on oikein, mutta mittakaava on väärä: `session_messages` kasvaa muutamalla kymmenellä rivillä per sessio. Kymmenen tuhatta sessiota tarkoittaa satojatuhansia rivejä, jolloin pelkkä B-tree `(session_id, created_at)` riittää moninkertaisesti. GIN-indeksi hidastaa kirjoituksia ja vie tilaa ilman mitattavaa hyötyä.

Korjaus: pidä `metadata JSONB` sarakkeena, pidä B-tree-aikajanaindeksi, jätä GIN ja ilmentymäindeksit pois kunnes profilointi osoittaa tarpeen. Sen sijaan nosta usein kysytyt kentät oikeiksi sarakkeiksi (`round_number`, `verdict`, `model_id`, `latency_ms`, `cost_cents`), koska ne kysytään joka kerta.

### 3.7 Kontekstin kompaktio on oire, ei ratkaisu

LLM-pohjainen yhteenveto koko historiasta on hidas, kallis ja häviöllinen, ja sen suorittaa sama malli joka on yksi väittelijöistä. Se on myös uusi vikapiste keskellä luuppia. Katso kohta 4: oikea korjaus on olla kasvattamatta kontekstia ensin.

### 3.8 Fasilitaattori on samaan aikaan tuomari, osapuoli ja kirjuri

OpenAI-agentti sekä osallistuu väittelyyn, että tiivistää historian, että kirjoittaa lopullisen dokumentin. Tämä on kolme roolia, joilla on eri intressit. Tiivistys ja synteesi painottuvat väistämättä sen omiin kantoihin.

Korjaus: erota synteesi omaksi rooliksi omalla system promptillaan ja mielellään omalla mallillaan. Se ei osallistu väittelyyn, se lukee lopputuloksen ja kirjoittaa dokumentin.

### 3.9 Sykofantia ja valekonsensus

Suunnitelma olettaa, että väittely päättyy aitoon konsensukseen. Käytännössä LLM-agentit joko myötäilevät toisiaan välittömästi (yleisin lopputulos) tai jankkaavat loputtomiin. Kolme hyväksyntää ensimmäisellä kierroksella ei ole konsensus vaan kohteliaisuutta.

Korjaus, promptitasolla ja logiikassa:
- minimikierrosmäärä ennen kuin `APPROVE` on edes sallittu (esim. 2)
- kriitikkoagentti pakotetaan tuottamaan vähintään yksi `blocking_concern` ensimmäisillä kierroksilla, tai vastaus hylätään ja pyydetään uudelleen
- hyväksynnän on viitattava konkreettiseen spesifikaation versioon (`spec_version`), ei "keskusteluun"
- agentit eivät näe toistensa `verdict`-kenttiä ennen omaa vastaustaan, vain sisällölliset huolet, jotta hyväksyntä ei tartu

### 3.10 Puuttuvat perusasiat

Suunnitelmassa ei ole lainkaan:
- **Autentikointia.** `POST /api/v1/incubator/start` on avoin rajapinta, joka polttaa rahaa LLM-kutsuina. Tämä on julkisessa internetissä minuuteissa löydetty. Vähintään API-avain, mieluummin kunnollinen tunnistautuminen ja käyttäjäkohtainen kiintiö.
- **Havainnoitavuutta.** LLM-järjestelmässä tarvitaan jokaisen kutsun promptit, vastaukset, tokenit, kustannus ja viive. Langfuse tai OpenTelemetry-pohjainen jäljitys kannattaa laittaa sisään päivä yksi, ei jälkikäteen.
- **Webhookin allekirjoitusta.** `send_webhook` ilman HMAC-allekirjoitusta, uudelleenyritystä ja kuolleiden kirjeiden käsittelyä.
- **Edistymisen näyttämistä käyttäjälle.** Sessio kestää minuutteja. Pelkkä `GET status` -pollaus on kelvollinen, mutta SSE-striimi keskustelun etenemisestä on tässä sovelluksessa käytännössä koko tuote: keskustelun seuraaminen on kiinnostavin osa.
- **Salaisuuksien hallintaa.** Kolme API-avainta, jotka eivät kuulu `.env`-tiedostoon tuotannossa.

### 3.11 Pienet virheet pseudokoodissa

- `'{"turn_number": turn}'` on literaali merkkijono, `turn` ei interpoloidu. Pitäisi olla `json.dumps({"turn_number": turn})` tai parametrisoitu.
- `agent_states.last_processed_message_id` määritellään mutta ei käytetä missään.
- Malli-ID:t (`gpt-4o`, viittaukset Claude 3.5 Sonnetiin) ovat vanhentuneita. Mallit vaihtuvat nopeammin kuin koodi: pidä ne konfiguraatiossa, älä koodissa, ja kirjaa käytetty malli jokaiselle viestille.
- `while turn < max_turns` -luupin sisällä konsensustarkistus tehdään jokaisen agentin jälkeen, mutta nollauslogiikka ajetaan ennen sitä, jolloin `all(...)` voi olla tosi vain viimeisen agentin kohdalla. Toimii, mutta vahingossa.

### 3.12 Claude puuttuu agenttipoolista

Kolme mallia on OpenAI, Gemini ja Mistral. Mistral on näistä selvästi heikoin arkkitehtuuripäättelyssä, ja Claude puuttuu kokonaan, vaikka dokumentti on kirjoitettu Claude Codelle syötettäväksi. Harkitse kokoonpanoa, jossa kriitikon roolissa on vahvempi malli, koska kriitikko on se joka estää huonon konsensuksen. Roolituksen pitää joka tapauksessa olla konfiguraatiota, jotta kokoonpanoja voi vertailla.

## 4. Arkkitehtuurinen suunnanmuutos: artefaktikeskeisyys

Tämä on raportin tärkein yksittäinen suositus.

Suunnitelma on **transkriptikeskeinen**: totuus on keskusteluhistoria, agentit lukevat koko historian, historia kasvaa rajatta, ja siksi tarvitaan kontekstin kompaktio, token-budjetit, kaksi kynnysarvoa, hätätrunkkaus ja LLM-pohjainen tiivistys. Puolet suunnitelman monimutkaisuudesta seuraa tästä yhdestä valinnasta.

Vaihtoehto on **artefaktikeskeinen**: totuus on itse arkkitehtuuridokumentti, ja keskustelu on vain mekanismi jolla sitä muokataan.

Jokaisella kierroksella agentin syöte on:
1. sen oma rooliprompti
2. spesifikaation **nykyinen versio** (yksi dokumentti, kooltaan ennustettava, tyypillisesti 2 to 5 tuhatta tokenia)
3. **edellisen kierroksen** avoimet huolet ja niihin tehdyt muutokset
4. lyhyt lokirivi aiemmin hylätyistä vaihtoehdoista ja perusteluista, jotta samat ideat eivät kierrä uudelleen

Agentin vastaus on `spec_patch` plus `verdict` plus `blocking_concerns`. Fasilitaattori soveltaa patchin ja tallentaa uuden version.

Seuraukset:
- konteksti ei kasva kierrosten myötä, vaan pysyy suunnilleen vakiona, jolloin **koko kompaktiokoneisto voidaan poistaa**
- kustannus per kierros on ennustettava, ja `max_turns` muuttuu vaarattomaksi
- lopputuloksen synteesi on triviaali, koska dokumentti on jo olemassa, eikä sitä tarvitse rekonstruoida keskustelusta
- versiointi antaa ilmaiseksi diffin: näet mitä kukin agentti oikeasti muutti, mikä on paras yksittäinen mittari sille tuottaako väittely arvoa
- hyväksyntä sidotaan versionumeroon, mikä ratkaisee kohdan 3.2 ongelman

Skeeman lisäys:

```sql
CREATE TABLE spec_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES incubator_sessions(id) ON DELETE CASCADE,
    version INT NOT NULL,
    round_number INT NOT NULL,
    author_role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, version)
);
```

Täysi keskusteluhistoria säilyy edelleen `session_messages`-taulussa auditointia ja käyttöliittymää varten. Sitä ei vain syötetä malleille.

Huomautus: `uuid-ossp`-laajennus on tarpeeton PostgreSQL 13:sta lähtien, `gen_random_uuid()` on sisäänrakennettu.

## 5. Infrastruktuuri

Suunnitelman GCP vastaan Hetzner -vertailu on huolellinen mutta painottaa vääriä muuttujia. Hiilivapaan energian osuus ja 9 millisekunnin verkkolatenssi Pohjoismaiden sisällä ovat merkityksettömiä järjestelmässä, jonka jokainen operaatio odottaa 2 to 30 sekuntia vastausta Yhdysvalloissa sijaitsevalta LLM-rajapinnalta. Sijainnin valinta ei vaikuta tämän järjestelmän suorituskykyyn käytännössä lainkaan.

Merkitykselliset muuttujat ovat kustannus, ylläpitotyö ja se, mitä on jo olemassa.

Sinulla on jo Hetzner-palvelin Helsingissä (`sis-4gb-hel1-1`, Ubuntu 24.04, 4 GB), jolla pyörii kolme PHP-sivustoa, Nginx, Certbot ja GitHub Actions -deployputki. Suositus: **aja tämä samalla koneella.**

Pinon todellinen muistinkulutus on luokkaa 400 MB (Postgres 100 to 200 MB pienellä `shared_buffers`-asetuksella, API-prosessi ja worker 80 to 120 MB kumpikin). Työkuorma on lähes kokonaan verkon odottamista, joten CPU-kuormaa ei synny mitattavasti. Neljän gigatavun koneella, jolla on kolme kevyttä PHP-sivustoa, tälle on tilaa moninkertaisesti. Erillinen instanssi ei ole perusteltu ennen kuin mittarit sanovat toisin.

Kolme asiaa hoidettava, jotta yhteiselo on turvallista:

1. **Muistirajat, ei erillistä konetta.** Ainoa realistinen riski ei ole normaalikäytön muistinkulutus vaan karannut prosessi, joka laukaisee kernelin OOM killerin ja tappaa php-fpm:n tai nginxin. Aseta `mem_limit` docker-composessa (worker 512m, api 256m, postgres 512m) ja varmista että swap on päällä.
2. **Docker ja UFW.** Palvelimella ei ole Dockeria, joten sen asennus on ainoa aito muutos tuotantokoneeseen. Docker kirjoittaa omat iptables NAT -sääntönsä, jotka **ohittavat UFW:n**: jos julkaiset portin muodossa `5432:5432`, Postgres on auki internetiin vaikka UFW sanoo ettei ole. Sido kaikki portit muotoon `127.0.0.1:8000:8000` ja päästä liikenne sisään vain olemassa olevan Nginxin kautta omalla aliverkkotunnuksella. Vaihtoehtoisesti jätä Docker pois ja aja systemd-uniteilla ja järjestelmän Postgresilla, jolloin koko ongelma katoaa.
3. **Ei konfliktia olemassa olevan datan kanssa,** koska nykyiset sivustot käyttävät SQLiteä eivätkä Postgresia.

Muut infrahuomiot:

- **Cloud Run on huono valinta tälle työkuormalle.** Se on suunniteltu lyhytkestoisille pyynnöille, ja pitkäkestoinen worker joko vaatii `--no-cpu-throttling`-asetuksen (jolloin maksat jatkuvasta CPU:sta ja häviät kustannusedun) tai kärsii CPU:n kuristuksesta taustaprosesseissa. Jos menet GCP:lle, oikea muoto on Cloud Run Jobs tai GKE Autopilot, ei tavallinen Cloud Run -palvelu.
- **Kontitus tekee tämän valinnan halvaksi peruuttaa,** mikä on suunnitelman oikea havainto. Aloita olemassa olevalla raudalla, siirrä vasta jos on syytä.

### 5.1 Vaihtoehto: Firebase ja Firestore (suositeltu)

Firebase-pohjainen toteutus on tähän järjestelmään todennäköisesti parempi kuin itsehallittu VPS-pino, ja se ratkaisee useita arviossa tunnistettuja puutteita ilman erillistä työtä.

**Mitä se ratkaisee:**

- **Reaaliaikainen käyttöliittymä ilmaiseksi.** Firestoren `onSnapshot`-kuuntelijat päivittävät selaimen heti, kun worker kirjoittaa uuden agentin vastauksen. Tämä korvaa koko SSE-toteutuksen vaiheesta 2. Keskustelun seuraaminen livenä on tämän sovelluksen keskeisin käyttökokemus, joten hyöty on merkittävä.
- **Autentikointi ja eristys.** Firebase Auth plus security rules paikkaa kohdan 3.10 aukon kertaheitolla.
- **Cloud Tasks jonona.** Sisäänrakennettu uudelleenyritys eksponentiaalisella perääntymisellä, viivästetty ajastus ja per-tehtävä-dispatch sopivat täsmälleen malliin "yksi tehtävä = yksi agentin vuoro" (kohta 3.4). Parempi sovitus kuin Celery tai ARQ.
- **Ei ylläpitoa.** Ei Dockeria, UFW:tä, varmuuskopioita, Nginx-konffia eikä käyttöjärjestelmäpäivityksiä.
- **Kustannus.** Nollaan skaalautuva Cloud Run ja Firestoren ilmaistaso ovat tällä volyymilla halvempia kuin VPS.

**Mitä menetetään:** SQL. Artefaktikeskeisessä mallissa (kohta 4) ei kuitenkaan tarvita yhtäkään liitosta. Sessio on dokumentti, viestit ja spesifikaatioversiot alikokoelmia, ja kaikki kyselyt ovat muotoa "hae tämän session dokumentit järjestyksessä". Firestore riittää tähän vaivatta, ja koko alkuperäisen suunnitelman JSONB-indeksointiosuus (kohta 3.6) käy tarpeettomaksi.

**Oikea muoto: Cloud Run, ei Firebase Functions.** Functionsin Python-tuki on olemassa, mutta ekosysteemi on selvästi Node-painotteinen. Cloud Run -palveluna Pythonilla FastAPI, Tenacity ja koko orkestrointilogiikka säilyvät sellaisenaan, ja vaihtuvat vain tietokanta ja jono.

| Rooli | Toteutus |
|---|---|
| Orkestrointi ja LLM-kutsut | Cloud Run (Python, FastAPI, Tenacity), Admin SDK |
| Jono | Cloud Tasks, yksi tehtävä per agentin vuoro |
| Tila ja historia | Firestore, asiakas lukee suoraan |
| Käyttöliittymä | Firebase Hosting |
| Autentikointi | Firebase Auth + security rules |
| Salaisuudet | Secret Manager |
| Alue | europe-north1 (Hamina) jos Firestore tarjoaa sen, muuten eur3 |

**Tietomalli:**

```
sessions/{sessionId}
  ownerUid, status, requirements, round, budgetCents, spentCents,
  consensusVersion, createdAt, updatedAt
  agentStates: { OPENAI_LEAD: {...}, GEMINI_ARCHITECT: {...}, ... }

sessions/{sessionId}/messages/{sessionId}_{round}_{role}
  role, verdict, blockingConcerns[], content, specVersion,
  modelId, inputTokens, outputTokens, costCents, latencyMs, createdAt

sessions/{sessionId}/specVersions/{version}
  version, round, authorRole, content, changeSummary, createdAt
```

**Kolme sudenkuoppaa:**

1. **Yksikään LLM-kutsu ei saa tapahtua selaimessa.** Security rules: asiakas lukee vain omat sessionsa, kirjoitusoikeus on pelkästään palvelimella Admin SDK:n kautta. Muuten API-avaimet vuotavat tai kuka tahansa voi käynnistää sessioita omistajan laskuun.
2. **Cloud Tasks yrittää uudelleen automaattisesti,** joten vuoron kirjoituksen on oltava idempotentti. Deterministinen dokumentti-ID `{sessionId}_{round}_{role}` tekee uudelleenyrityksestä ylikirjoituksen duplikaatin sijaan. Tämä on Firestoressa siistimpää kuin Postgresissa.
3. **Firestoren dokumenttiraja on 1 MiB.** Spesifikaatio mahtuu helposti, mutta poikkeuksellisen pitkä agentin vastaus voi lähestyä rajaa. Ylityksen varalta talleta sisältö Cloud Storageen ja jätä dokumenttiin osoitin.

**Vuoron rinnakkaisuuden esto** hoituu Firestore-transaktiolla session dokumentin `status`- ja `leaseUntil`-kentillä. Redisiä ja Redlockia ei tarvita lainkaan.

**Huomio vaiheeseen 0:** tämä valinta ei muuta vaiheen 0 prototyyppiä millään tavalla. Prototyyppi on yksi Python-tiedosto ilman tietokantaa, ja se tehdään joka tapauksessa ensin.

## 6. Tarkistettu teknologiapino

Kaksi vaihtoehtoista polkua. Firebase-polku (5.1) on suositeltu; itsehallittu polku on listattu, koska se on halpa peruuttaa ja koska olemassa oleva palvelin on jo pystyssä.

| Komponentti | Firebase-polku (suositus) | Itsehallittu polku | Muutos alkuperäiseen |
|---|---|---|---|
| Ajoympäristö | Cloud Run (skaalautuu nollaan) | Olemassa oleva Hetzner-palvelin, Docker Compose muistirajoilla | tavallinen Cloud Run -palvelu pitkänä workerina pois |
| Kieli | Python 3.12+ | Python 3.12+ | ei muutosta |
| API | FastAPI + Pydantic | FastAPI + Pydantic | ei muutosta |
| Jono | Cloud Tasks | ARQ, tai Postgres SKIP LOCKED | Celery pois |
| Tietokanta | Firestore | PostgreSQL 16, `spec_versions` mukaan | JSONB-indeksointi pois |
| Reaaliaikaisuus | Firestore-kuuntelijat | SSE + Redis pubsub | uusi vaatimus |
| Lukot | Firestore-transaktio + lease | Postgres advisory lock | Redis ja Redlock pois |
| Resilienssi | Tenacity | Tenacity | ei muutosta |
| Rakenne | yksi tehtävä = yksi agentin vuoro | sama | pitkä while-luuppi pois |
| Vastausmuoto | strukturoitu JSON schema per provider | sama | merkkijonohaku pois |
| Havainnointi | Langfuse tai OTel + kustannuskirjanpito | sama | uusi |
| Turva | Firebase Auth + security rules + Secret Manager | API-avain, käyttäjäkiintiö | uusi |

## 6.1 A2A-protokolla: mihin se sopii ja mihin ei

A2A (Agent2Agent) saavutti v1.0:n vuonna 2026 Linux Foundationin hallinnoimana, yli 150 organisaation tuella ja kypsällä Python SDK:lla (`pip install "a2a-sdk[http-server]"`). Spesifikaatio ei siis enää elä toteutuksen alla, mikä oli aiemmin todellinen riski. Kysymys on vain siitä, missä kerroksessa sitä käytetään.

### Ei kolmen sisäisen agentin väliin

A2A on suunniteltu **opaakkien, itsenäisesti deployattujen, eri omistajien** agenttien yhteentoimivuuteen. Tämän järjestelmän "agentit" eivät ole agentteja vaan kolme LLM-API-kutsua eri system prompteilla samassa prosessissa, kaikki saman omistajan hallussa. A2A:n käyttö niiden välillä tarkoittaisi kolmea HTTP-palvelua, kolmea Agent Cardia ja JSON-RPC-kerrosta, jotta oma koodi voi puhua omalle koodilleen. OpenAI:n, Geminin ja Mistralin SDK:t eivät puhu A2A:ta, joten adapterit kirjoitettaisiin joka tapauksessa itse. Puhdasta yleiskustannusta ilman yhteentoimivuushyötyä.

Erotteluksi: MCP yhdistää agentin työkaluihin ja dataan, A2A yhdistää agentit toisiinsa. Nämä LLM-kutsut eivät ole kumpaakaan.

### Kyllä ulkorajalle

Käänteinen asetelma on kiinnostava: koko hautumo on **yksi** A2A-agentti. Yksi Agent Card, jonka skill on "suunnittele ohjelmistoarkkitehtuuri vaatimusten pohjalta", ja mikä tahansa A2A-asiakas (Claude Code, Antigravity, muu järjestelmä) voi kutsua sitä. Tämä antaa kohdan 8 avoimeen päätökseen 4 kolmannen vaihtoehdon: ei web-tuote eikä pelkkä henkilökohtainen työnkulku, vaan kutsuttava palvelu ilman käyttöliittymää. Tämän projektin luonteelle todennäköisesti osuvin muoto.

### Tietomalli kannattaa ottaa käyttöön joka tapauksessa

Tämä on välitön hyöty, joka ei maksa mitään. A2A:n malli sisältää valmiit ratkaisut kolmeen arviossa auki jääneeseen kohtaan:

| A2A:n käsite | Mitä se ratkaisee |
|---|---|
| Task lifecycle: `SUBMITTED → WORKING → INPUT_REQUIRED → COMPLETED / FAILED / CANCELED / REJECTED` | Korvaa ad hoc -tilat. `INPUT_REQUIRED` on täsmälleen kohdan 8 avoimen päätöksen 3 "käyttäjä silmukassa" -mekanismi |
| Artifacts, taskin ensiluokkaisia tuotoksia, koostuvat Parteista | Sama idea kuin kohdan 4 artefaktikeskeisyys. `spec_versions` on artefaktin versiohistoria |
| Push notifications: asiakkaan antama webhook-URL ja määritellyt autentikointiskeemat | Suunniteltu ratkaisu kohdan 3.10 allekirjoittamattomiin webhookeihin |
| SSE-striimaus | Standardoi reaaliaikaisen keskustelunäkymän, joka joka tapauksessa rakennetaan |

Käytännön ohje: nimeä tilat ja tuotokset A2A:n mukaan jo vaiheessa 1. Jos Agent Card julkaistaan myöhemmin, työ on tehty. Jos ei, hukkaan menee nolla.

### Halpa vakuutus

Määrittele agentin rajapinta Pythonin `Protocol`-luokkana, esimerkiksi `async def turn(spec: str, concerns: list[Concern]) -> Verdict`. Paikallinen SDK-kutsu toteuttaa sen nyt, ja etäinen A2A-asiakas voi toteuttaa saman sopimuksen myöhemmin. Ulkopuolisen erikoisagentin lisääminen pooliin pysyy mahdollisena ilman että siitä maksetaan mitään tänään.

### Ajoitus

A2A-palvelinkerros kuuluu vaiheeseen 2 tai 3. Vaiheessa 1 otetaan käyttöön vain nimeäminen ja tilamalli.

## 6.2 Valittu suunta: A2A-natiivi palvelu ilman omaa käyttöliittymää

Päätetty suunta: hautumo toteutetaan A2A-agenttina, jota voi kutsua mistä tahansa työkalusta, ilman omaa web-käyttöliittymää. Tämä on merkittävä yksinkertaistus, ja se muuttaa kahta aiempaa suositusta.

### Tarkennus: A2A yksin ei riitä kutsuttavuuteen

Koodityökalut (Claude Code, Antigravity) puhuvat natiivisti **MCP**:tä, eivät A2A:ta. A2A on agenttien välinen protokolla, MCP on se jolla agentti saa työkaluja käyttöönsä. Lisäksi A2A v1.0 ei määrittele pakollista well-known-polkua Agent Cardille, joten asiakas on joka tapauksessa osoitettava palvelimeen.

Ratkaisu on molemmat, ja se on halpa: **A2A-palvelin kanonisena rajapintana, ja ohut MCP-kääre sen päälle**, joka esittelee työkalut `start_architecture_session` ja `get_session_status`. Muutama kymmenen riviä koodia. Tällöin palvelu on kutsuttavissa A2A-asiakkailta suoraan ja koodityökaluilta MCP:n kautta.

### Seuraukset aiempiin suosituksiin

1. **Web-käyttöliittymä poistuu kokonaan.** Kutsuva agentti renderöi edistymisen omassa ympäristössään. Ei Reactia, ei omaa SSE-toteutusta, ei Firebase Hostingia, ei Firebase Authia.
2. **Firebase-suositus (kohta 5.1) peruuntuu tämän suunnan osalta.** Firestorea suositeltiin ensisijaisesti reaaliaikaisten kuuntelijoiden vuoksi. Ilman selainasiakasta se etu katoaa, jolloin yksinkertaisin ratkaisu on olemassa oleva Hetzner-palvelin, PostgreSQL ja jo pystyssä oleva Nginx plus Certbot. Kohta 5.1 jää dokumenttiin siltä varalta, että selainkäyttöliittymä palaa kuvaan myöhemmin.
3. **Autentikointi tulee A2A:n kautta.** Agent Cardissa julistettu autentikointiskeema, aluksi bearer-token. Firebase Auth on tarpeeton.

### Väittelyn mäppäys A2A v1.0:aan

Sovitus on epätavallisen siisti, koska A2A on suunniteltu pitkäkestoisille tehtäville:

| A2A v1.0 | Rooli hautumossa |
|---|---|
| `SendStreamingMessage` | Asiakas lähettää vaatimukset ja saa striimin |
| `TaskStatusUpdateEvent` | Yksi tapahtuma per agentin vuoro, kutsuja näkee väittelyn reaaliajassa |
| `TaskArtifactUpdateEvent` | Yksi per spesifikaatioversio, dokumentti valuu asiakkaalle sitä mukaa kun se kehittyy |
| `TASK_STATE_INPUT_REQUIRED` | Hautumo pysähtyy ja kysyy ihmiseltä kesken väittelyn |
| `CancelTask` | Karanneen session tappo, sama mekanismi kuin budjettikatkaisu |
| `CreateTaskPushNotificationConfig` | Webhook asiakkaille, jotka katkaisevat yhteyden |
| `TASK_STATE_COMPLETED` + artifact | Lopputuotos ilman erillistä jakelumekanismia |

Suunnitelman kohdat SSE-striimaus, allekirjoitettu webhook, status-pollaus ja käyttäjä silmukassa eivät siis ole enää itse suunniteltavia. Ne ovat protokollan valmiita osia.

### Toteutuksen muoto

`a2a-sdk` (`pip install "a2a-sdk[http-server]"`) tarjoaa `AgentExecutor`-abstraktiluokan, jossa toteutetaan `execute()` ja `cancel()`. SDK palauttaa Starlette-ASGI-sovelluksen, jonka voi mountata olemassa olevaan FastAPI-palveluun, ja SSE-käsittely tulee mukana. Käytännössä `execute()` sisältää kohdan 4 artefaktikeskeisen orkestrointiluupin, ja protokollakerros on kirjaston vastuulla.

Kuljetusmuodoista A2A v1.0 tukee JSON-RPC-, gRPC- ja HTTP+JSON/REST-bindingejä. Aloita JSON-RPC:llä, se on laajimmin tuettu asiakaspuolella.

### Työmääräarvio

Ilman käyttöliittymää vaiheet 1 ja 2 kutistuvat noin viikon iltatyöksi aiemman kahden viikon sijaan.

## 7. Etenemispolku

### Vaihe 0: Premissin validointi (1 to 2 iltaa)

Yksi tiedosto, `prototype.py`. Ei tietokantaa, ei jonoa, ei konttia, ei API:a. Kolme API-avainta ympäristömuuttujissa, luuppi joka ajaa kierrokset, ja tuloste markdown-tiedostoon.

Onnistumisen mitta, mitattuna oikeasti eikä arvioimalla:
1. Aja sama vaatimusmäärittely (a) yhden mallin läpi hyvällä promptilla ja (b) kolmen agentin väittelyn läpi.
2. Vertaa lopputuloksia. Löytyykö väittelyn tuloksesta konkreettisia asioita, joita yksittäinen malli ei tuottanut?
3. Katso kierrosten diffit. Muuttuuko dokumentti sisällöllisesti kierrosten välillä, vai jankkaavatko mallit sanamuodoista?
4. Laske hinta ja kesto per sessio.

Tämä vaihe voi hyvinkin päättyä siihen, että väittely ei tuota lisäarvoa. Se on arvokas tulos, ei epäonnistuminen. Todennäköisempää on, että se tuottaa arvoa vain tietyillä ehdoilla (esim. kriitikkorooli tiukalla promptilla, vähintään 3 kierrosta, konkreettinen artefakti muokattavana), ja juuri ne ehdot ovat se tieto jota tuotantoversion rakentamiseen tarvitaan.

### Vaihe 1: Minimaalinen palvelu (noin 1 viikko)

Vasta kun vaihe 0 on antanut positiivisen tuloksen.

- A2A-palvelin: `a2a-sdk`, `AgentExecutor`, Agent Card, JSON-RPC-binding
- PostgreSQL, taulut `incubator_sessions`, `session_messages`, `spec_versions`, `agent_states`
- ARQ tai Postgres-jono, yksi tehtävä = yksi vuoro
- artefaktikeskeinen luuppi kohdan 4 mukaan
- strukturoitu `verdict`, kierrossidottu konsensus
- Tenacity kaikkien LLM-kutsujen ympärille
- sessiokohtainen euromääräinen budjetti, kova katkaisu
- tilamalli ja tuotokset nimetty A2A:n mukaan (kohta 6.1), agentin rajapinta `Protocol`-luokkana
- Bearer-token autentikointina, julistettuna Agent Cardissa
- Docker Compose olemassa olevalla Hetzner-palvelimella, portit sidottu localhostiin, Nginx reverse proxyna ja Certbot aliverkkotunnukselle

Valmis kun: sessio ajautuu päätökseen ilman valvontaa, worker voidaan tappaa kesken ja sessio jatkuu, kustannus per sessio näkyy kannassa, ja A2A-asiakas saa striiminä statuspäivitykset ja artefaktit.

### Vaihe 2: Kutsuttavuus ja havainnointi (muutama ilta)

- **MCP-kääre**, joka esittelee palvelun työkaluna Claude Codelle ja Antigravitylle
- `TASK_STATE_INPUT_REQUIRED` käyttöön, jotta hautumo voi kysyä ihmiseltä kesken väittelyn
- push notification -konfiguraatio niille asiakkaille, jotka katkaisevat yhteyden
- Langfuse tai vastaava jäljitys, kustannusseuranta
- jumittuneiden sessioiden vartija ja `CancelTask`-polku

### Vaihe 3: Vasta tarvittaessa

Selainkäyttöliittymä ja Firebase-polku (kohta 5.1), circuit breaker, Redlock, horisontaalinen skaalaus, GIN-indeksit. Yksikään näistä ei ole tarpeen ennen kuin mittarit sanovat niin. Suunnitelma esittää ne vaiheen 1 vaatimuksina, mikä on sen toinen systemaattinen ongelma ensimmäisen (premissiä ei validoida) jälkeen.

## 8. Avoimet päätökset

Nämä pitää päättää ennen vaihetta 1, mutta ei ennen vaihetta 0:

1. **Agenttikokoonpano.** Pysyykö Mistral kriitikkona, vai korvataanko vahvemmalla mallilla? Vaihe 0 vastaa tähän empiirisesti.
2. **Kuka on synteesin tekijä?** Suositus: neljäs, väittelyn ulkopuolinen rooli.
3. **Onko käyttäjä silmukassa?** Nykyinen suunnitelma on täysin autonominen. Vaihtoehto, jossa käyttäjä voi kierrosten välissä ohjata tai vetoa hyväksyntään, on todennäköisesti hyödyllisempi ja halvempi kuin täysautomaatti.
4. **Tarvitseeko tämän olla sovellus lainkaan?** Tämä on tärkein avoin kysymys. Vaihtoehtoja on kolme, ei kahta: web-tuote, henkilökohtainen työnkulku CLI:n subagenteilla, tai A2A-agenttina julkaistu kutsuttava palvelu ilman käyttöliittymää (kohta 6.1). Sekä Antigravity CLI että Claude Code tarjoavat jo subagentit, hookit, skillsit ja ajastetut tehtävät, ja molemmat ajavat useaa eri mallia rinnakkain. Merkittävä osa suunnitellusta orkestroinnista on siis jo olemassa työkalujen ominaisuutena. Jos tavoite on oma työnkulku parempien arkkitehtuuridokumenttien tuottamiseksi, kolmen subagentin konfiguraatio vie illan ja antaa suuren osan hyödystä ilman tietokantaa, jonoa ja budjettikattoja. Jos tavoite on hostattu tuote, jossa on web-käyttöliittymä, käyttäjätilit ja jaettavat sessiot, rakenna se, mutta tiedostaen että rakennat sen käyttöliittymän ja jaettavuuden vuoksi, et orkestroinnin. Vaihe 0 vastaa myös tähän.
5. **Työkaluvalinta on erillinen kysymys arkkitehtuurista.** Vaihe 0 on noin 150 riviä Pythonia, joten toteutustyökalu ei vaikuta lopputulokseen. Antigravityn ainoa aidosti relevantti etu tässä projektissa on sisäänrakennettu selain ja visuaalinen verifiointi, mikä hyödyttää vaiheen 2 reaaliaikaista keskustelunäkymää. Se on oikea paikka kokeilla, koska epäonnistuminen ei maksa siellä mitään.
6. **Mikä on tuotos?** `architecture.md` pilvitallennuksessa, vai suoraan repositorioon committoitu tiedosto, vai Claude Codelle syötettävä spesifikaatio? Tämä määrittää vaiheen 2 integraatiot.
