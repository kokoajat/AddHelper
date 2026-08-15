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
| **Kuva / Video** | Kuvan lataus (PNG, JPG, WebP, GIF, enintään 10 Mt) |
| **Some-teksti** | Kirjoittaa jokaiselle kanavalle oman tekstin — ei samaa tekstiä kopioituna |
| **Facebook-tapahtuma** | Kopioi kuvaus, avaa tapahtuman luonti, linkki Salon puskaradio -ryhmään |
| **TikTok** | Lyhyt koukkuteksti, muistutus julkaisusta tapahtumapäivänä |
| **Cluby / Instagram / Webador** | Kanavakohtainen teksti, kuvan lataus, suora linkki palveluun |
| **Google-kalenteri** | Valmiiksi täytetty kalenterilomake tai `.ics`-tiedosto |
| **Feelment** | Piirtää tapahtuman tiedot kuvan päälle ja lataa julisteen PNG:nä (1:1, 4:5, 9:16, 16:9) |
| **Video-introt / YouTube** | Ruututekstit ja juonto lähetykseen sekä lähetyksen kuvaus |

Kaikki tekstit ovat muokattavissa suoraan kortissa. Muokkaus tallentuu kun siirryt pois kentästä.

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
public/index.html         Käyttöliittymä
public/app.js             Näkymälogiikka
public/poster.js          Julisteen piirto (canvas)
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

## Huomioitavaa

Alusta ei julkaise puolestasi Facebookiin, Instagramiin, TikTokiin, Clubyyn tai Webadoriin.
Näihin ei ole saatavilla rajapintaa, joka sopisi tähän käyttöön, joten jokainen kanava on
yhden napin päässä: teksti leikepöydälle, kuva mukaan, palvelu auki uuteen välilehteen.
Google-kalenteri ja `.ics` ovat ainoat kohteet, joihin tiedot siirtyvät koneellisesti.

Palvelimessa ei ole kirjautumista. Se on tarkoitettu ajettavaksi omalla koneella tai
suljetussa verkossa — älä vie sitä sellaisenaan julkiseen internetiin.
