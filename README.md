# AddHelper

Tapahtumamarkkinoinnin työnkulkualusta. Syötät tapahtuman tiedot kerran, ja alusta vie ne
kaikkiin kanaviin muutamalla klikkauksella: kuva, some-tekstit, Facebook-tapahtuma, jakelu
Instagramiin, Clubyyn ja Webadoriin, vienti Google-kalenteriin, juliste ja livestreamin intro.

Työnkulku on toteutettu suoraan pohjapiirroksen vuokaaviosta.

## Käynnistys

```bash
npm install
npm start
```

Selain: <http://localhost:4173>. Ei tietokantaa, ei käännösvaihetta — tiedot tallentuvat
`data/events.json`-tiedostoon ja kuvat `data/uploads/`-kansioon.

### API-avain (valinnainen, tarvitaan AI-teksteihin)

Avain luetaan ympäristömuuttujasta `ANTHROPIC_API_KEY` — sitä ei kirjoiteta koodiin.
Hae avain osoitteesta <https://platform.claude.com> → Settings → API keys.

**Suositeltu tapa — `.env`-tiedosto projektin juureen:**

```bash
cp .env.example .env
# avaa .env ja liitä avain riville ANTHROPIC_API_KEY=
npm start
```

`.env` on `.gitignore`ssa, joten avain ei päädy versionhallintaan. `npm start` lukee sen
automaattisesti; ilman tiedostoa käynnistys toimii normaalisti.

**Muut tavat:**

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start          # vain tälle käynnistykselle
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc   # pysyvästi (uusi terminaali)
```

Käynnistyksen jälkeen yläpalkin merkki kertoo tilan: *AI: claude-opus-5* tarkoittaa että avain
löytyi, *AI: pois — mallipohjat* että ei löytynyt.

Ilman avainta kaikki toimii, mutta tekstit tulevat mallipohjista AI:n sijaan. Jos AI-kutsu
epäonnistuu, alusta putoaa automaattisesti mallipohjiin ja kertoo syyn — työnkulku ei jää jumiin.

| Ympäristömuuttuja   | Oletus            | Selitys                                   |
| ------------------- | ----------------- | ----------------------------------------- |
| `ANTHROPIC_API_KEY` | —                 | Ottaa AI-tekstigeneroinnin käyttöön        |
| `ADDHELPER_MODEL`   | `claude-opus-5`   | Käytettävä malli                           |
| `PORT`              | `4173`            | Palvelimen portti                          |
| `ADDHELPER_DATA`    | `./data`          | Tallennuskansio                            |
| `GMAIL_USER`        | —                 | Gmail-osoite keikkapostien lukuun          |
| `GMAIL_APP_PASSWORD`| —                 | Google-tilin sovellussalasana              |
| `GMAIL_MAILBOX`     | `INBOX`           | Luettava kansio tai tunniste               |
| `GMAIL_SEARCH`      | —                 | Hakusana, joka rajaa luettavat viestit     |
| `GMAIL_DAYS`        | `60`              | Kuinka monta päivää taaksepäin             |

## Työnkulku

```
Tapahtuma ──▶ Kuva/Video ──▶ Some-teksti ──┬──▶ TikTok (tapahtumapäivänä)
(pvm, tyyppi)  (AI/email/     (AI, artistit,│
                valmiit)       valmiit)     └──▶ Facebook-tapahtuma ──┬──▶ Cluby
                                                 (Salon puskaradio,   ├──▶ Instagram
                                                  joka ke)            ├──▶ Webador
                                                                      ├──▶ Google-kalenteri
                                                                      └──▶ Feelment (tiedot kuvaan)

Video-introt ──▶ YouTube: Live-streamit          (näkyy vain jos tapahtuma on livestream)
```

Vaihe avautuu vasta kun sen edeltäjät ovat valmiita tai ohitettuja. Jos et esimerkiksi halua
odottaa kuvaa, paina *Ohita* — seuraava vaihe aukeaa heti.

## Mitä kussakin vaiheessa tapahtuu

| Vaihe | Toiminto |
| ----- | -------- |
| **Tapahtuma** | Päivämäärä, kellonajat, esiintyjät, paikka, liput, ikäraja, livestream-valinta |
| **Kuva / Video** | Kuvan lataus + rajaustyökalu: raahaa, lähennä ja valitse kanavan koko |
| **Some-teksti** | Kirjoittaa jokaiselle kanavalle oman tekstin — ei samaa tekstiä kopioituna |
| **Facebook-tapahtuma** | Kopioi kuvaus, avaa tapahtuman luonti, linkki Salon puskaradio -ryhmään |
| **TikTok** | Lyhyt koukkuteksti, muistutus julkaisusta tapahtumapäivänä |
| **Cluby / Instagram / Webador** | Kanavakohtainen teksti, kuvan lataus, suora linkki palveluun |
| **Google-kalenteri** | Valmiiksi täytetty kalenterilomake tai `.ics`-tiedosto |
| **Feelment** | Sama rajaus + tapahtuman tiedot kuvan päälle, tekstin asettelu ja korostusväri |
| **Video-introt / YouTube** | Ruututekstit ja juonto lähetykseen sekä lähetyksen kuvaus |

Kaikki tekstit ovat muokattavissa suoraan kortissa. Muokkaus tallentuu kun siirryt pois kentästä.

## Kuvan rajaus

Facebook ja Instagram hyväksyvät vain tietyt kuvasuhteet, ja lähdekuvat ovat harvoin niiden
muotoisia. Rajaustyökalu aukeaa heti kuvan latauksen jälkeen kuvavaiheessa.

Rajaus tallennetaan **polttopisteenä ja lähennyksenä**, ei pikseleinä. Siksi sama rajaus siirtyy
kuvasuhteesta toiseen: kun keskität artistin kasvot kerran, hän pysyy kuvassa myös pystykuvassa,
tarinassa ja Facebookin vaakakannessa. Jokaisen kanavan kortissa on *Lataa kuva* -nappi, joka
tuottaa juuri sen kanavan koon samasta rajauksesta.

| Koko | Pikselit | Käyttö |
| ---- | -------- | ------ |
| Instagram – pysty | 1080 × 1350 | 4:5, vie eniten tilaa syötteessä |
| Instagram – neliö | 1080 × 1080 | 1:1 |
| Tarina / Reels | 1080 × 1920 | 9:16, myös TikTok |
| Facebook-tapahtuman kansi | 1200 × 628 | ≈1.91:1 |
| Facebook – jaettava kuva | 1200 × 900 | 4:3, myös Webador |
| YouTube – pikkukuva | 1280 × 720 | 16:9 |

Säätimet: **Koko** valitsee kuvasuhteen, **Rajaus** joko rajaa reunoista tai sovittaa koko kuvan
sumennetulle taustalle, **Pohja** valitsee tekstin asettelun, **Lähennys** zoomaa, ja kuvaa
raahataan hiirellä. *Lataa kaikki koot* tuottaa neljä yleisintä kokoa kerralla — selain kysyy
luvan usean tiedoston lataamiseen.

### Julistepohjat

Sama sisältö, viisi asettelua. Pohja pätee kaikkiin kokoihin, ja tekstilohko kutistuu
automaattisesti mahtumaan myös matalissa vaakakuvissa.

| Pohja | Käyttö |
| ----- | ------ |
| **Alalaita** | Teksti alareunassa liukuvärin päällä — yleiskäyttöinen oletus |
| **Ylälaita** | Sama ylhäällä, kun kuvan tärkein kohta on alhaalla |
| **Nauha** | Tumma palkki alla; kuva jää kokonaan näkyviin palkin yläpuolelle |
| **Keskitetty** | Klassinen juliste: verho koko kuvan päällä, teksti keskellä |
| **Minimi** | Pieni kulmalaatta — jättää kuvan mahdollisimman paljon esiin |
| **Ei tekstiä** | Pelkkä rajattu kuva |

Korostusväri on säädettävissä Feelment-vaiheessa ja vaikuttaa kaikkiin pohjiin.

Koot ovat alustojen yleisimmät julkaisukoot. Alustat päivittävät niitä ajoittain; jos jokin muuttuu,
listan voi korjata tiedostosta `public/poster.js`.

## Gmail-yhteys: keikat sähköposteista

AddHelper voi lukea baarin sähköpostit ja poimia niistä sovitut keikat. Claude lukee viestit ja
palauttaa ehdotukset, jotka **et hyväksy automaattisesti** — ne ilmestyvät hyväksyntälistalle,
josta luot tapahtuman tai hylkäät ehdotuksen. Jokaisessa ehdotuksessa näkyy lainaus siitä
kohdasta viestiä, johon päätelmä perustuu.

### Käyttöönotto

Tarvitset Google-tilin **sovellussalasanan** — tavallinen salasana ei kelpaa IMAPiin:

1. Ota 2-vaiheinen vahvistus käyttöön Google-tilillä (pakollinen ehto sovellussalasanalle).
2. Google-tili → Turvallisuus → 2-vaiheinen vahvistus → **Sovellussalasanat** → luo uusi.
3. Lisää `.env`-tiedostoon:

```
GMAIL_USER=baari@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
GMAIL_SEARCH=keikka
```

Käynnistä palvelin uudelleen ja paina sivupalkista *Testaa yhteys*, sitten
*Hae keikat sähköposteista*.

### Mitä lähetetään ja minne

Haku rajataan kolmella tavalla: **kansio** (`GMAIL_MAILBOX`, oletus INBOX), **aikaväli**
(`GMAIL_DAYS`, oletus 60 päivää) ja **hakusana** (`GMAIL_SEARCH`). Viestistä otetaan mukaan vain
lähettäjä, aihe ja tekstin alku (enintään 4000 merkkiä); liitteitä ei ladata eikä lainattuja
vastausketjuja lähetetä.

Nämä viestit lähetetään Anthropicin rajapintaan analysoitavaksi. Jos baarin sähköposteissa on
tietoa, jonka et halua kulkevan sinne, käytä `GMAIL_MAILBOX`-asetusta ja siirrä keikkaviestit
omaan Gmail-tunnisteeseensa — silloin muut viestit eivät koskaan päädy hakuun.

Sovellussalasana antaa pääsyn koko postilaatikkoon, vaikka AddHelper vain lukee. Voit perua sen
milloin tahansa Google-tilin asetuksista. Tiukempi vaihtoehto olisi Gmail API:n lukuoikeus, joka
vaatii Google Cloud -projektin — sen voi lisätä myöhemmin.

### Ilman Gmail-tunnuksia

Voit kokeilla koko ketjun JSON-tiedostolla:

```
ADDHELPER_MAIL_FIXTURE=./esimerkkipostit.json
```

Tiedosto on lista viestejä: `[{ "id", "date", "from", "subject", "body" }]`.

### Ilman API-avainta

Ilman `ANTHROPIC_API_KEY`:tä käytetään karkeaa hakupoimintaa: viestistä etsitään päivämäärä ja
keikkaan viittaavia sanoja. Se löytää selvät tapaukset mutta ohittaa vivahteet — laskut ja
uutiskirjeet karsiutuvat, mutta esimerkiksi kellonaika jää usein tyhjäksi. Claude-poiminta on
selvästi tarkempi.

## Puskaradio-keskiviikko

Sivupalkki näyttää seuraavan keskiviikon ja listaa lähipäivien tapahtumat, joiden
Facebook-tapahtuma on vielä tekemättä. Se on viikoittainen tarkistuslista, ei ajastus —
julkaisut tehdään käsin, koska Facebook, Cluby ja Webador eivät tarjoa tähän avointa rajapintaa.

Kaikki tapahtumat saa kerralla kalenteriin yläpalkin *Vie kaikki kalenteriin* -napista.

## Rakenne

```
server.js                 HTTP-palvelin ja REST-rajapinta
src/store.js              JSON-tallennus
src/copy.js               Mallipohjaiset tekstit
src/ai.js                 Tekstigenerointi Claudella
src/mail.js               Gmail-luku IMAPin yli
src/extract.js            Keikkaehdotusten poiminta viesteistä
public/index.html         Käyttöliittymä
public/app.js             Näkymälogiikka
public/poster.js          Rajaus, julistepohjat ja vienti (canvas)
public/shared/            Palvelimen ja selaimen yhteinen koodi
  workflow.js             Vaiheet ja riippuvuudet
  format.js               Päivämäärä- ja tekstiapurit
  calendar.js             .ics ja Google-kalenterilinkki
```

## Rajapinta

| Metodi ja polku | Selitys |
| --------------- | ------- |
| `GET /api/events` | Tapahtumat päivämääräjärjestyksessä |
| `POST /api/events` | Luo tapahtuma |
| `PUT /api/events/:id` | Päivitä tiedot |
| `DELETE /api/events/:id` | Poista tapahtuma |
| `POST /api/events/:id/generate` | Luo tekstit (`{"mode":"ai"\|"malli"}`) |
| `PUT /api/events/:id/copy` | Tallenna käsin muokattu teksti |
| `POST /api/events/:id/steps/:step` | Vaiheen tila (`odottaa`, `valmis`, `ohitettu`) |
| `POST /api/events/:id/image` | Kuvan lataus data-URL:na |
| `GET /api/events/:id/calendar.ics` | Yhden tapahtuman kalenteritiedosto |
| `GET /api/calendar.ics` | Kaikki tapahtumat |
| `POST /api/mail/test` | Testaa Gmail-yhteys |
| `POST /api/mail/scan` | Lue viestit ja poimi ehdotukset |
| `GET /api/proposals` | Ehdotukset |
| `POST /api/proposals/:id/accept` | Luo tapahtuma ehdotuksesta |
| `POST /api/proposals/:id/reject` | Hylkää ehdotus |

## Huomioitavaa

Alusta ei julkaise puolestasi Facebookiin, Instagramiin, TikTokiin, Clubyyn tai Webadoriin.
Näihin ei ole saatavilla rajapintaa, joka sopisi tähän käyttöön, joten jokainen kanava on
yhden napin päässä: teksti leikepöydälle, kuva mukaan, palvelu auki uuteen välilehteen.
Google-kalenteri ja `.ics` ovat ainoat kohteet, joihin tiedot siirtyvät koneellisesti.

Palvelimessa ei ole kirjautumista. Se on tarkoitettu ajettavaksi omalla koneella tai
suljetussa verkossa — älä vie sitä sellaisenaan julkiseen internetiin.
