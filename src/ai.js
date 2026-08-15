/** Some-tekstien generointi Claudella. Ilman API-avainta käytetään mallipohjia. */

import Anthropic from '@anthropic-ai/sdk';
import { COPY_KEYS } from '../public/shared/workflow.js';
import { artistList, longDate, priceLabel, shortDate, timeRange } from '../public/shared/format.js';

const MODEL = process.env.ADDHELPER_MODEL || 'claude-opus-5';

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SCHEMA = {
  type: 'object',
  properties: {
    facebook: { type: 'string', description: 'Facebook-tapahtuman kuvaus, 400–800 merkkiä, kappaleisiin jaettuna.' },
    instagram: { type: 'string', description: 'Instagram-kuvateksti, enintään 300 merkkiä ennen hashtageja.' },
    tiktok: { type: 'string', description: 'TikTok-teksti, enintään 150 merkkiä, koukku ensimmäisenä.' },
    cluby: { type: 'string', description: 'Cluby-tapahtumakuvaus, 2–4 lausetta, ei hashtageja.' },
    webador: { type: 'string', description: 'Verkkosivun teksti yksinkertaisena HTML:nä (h2, p, ul).' },
    youtube: { type: 'string', description: 'YouTube-lähetyksen kuvaus, ensimmäiset 100 merkkiä toimivat itsenäisesti.' },
    intro: { type: 'string', description: 'Lähetyksen intron ruututekstit ja juontajan repliikit.' },
    hashtags: { type: 'array', items: { type: 'string' }, description: '5–10 hashtagia, mukana paikkakunta.' },
  },
  required: [...COPY_KEYS, 'hashtags'],
  additionalProperties: false,
};

const SYSTEM = `Kirjoitat suomenkielisiä some-tekstejä salolaisen tapahtumapaikan markkinointiin.

Sävy on lämmin, suora ja paikallinen — puhut naapurille, et mainostoimistolle. Vältä ylisanoja
("ainutlaatuinen elämys", "unohtumaton ilta") ja tyhjää hehkutusta.

Käytä vain annettuja tapahtumatietoja. Älä keksi esiintyjiä, hintoja, kellonaikoja tai
ohjelmanumeroita, joita tiedoissa ei ole. Jos jokin tieto puuttuu, jätä se pois.

Sovita jokainen teksti kanavaansa: Facebook kestää pituutta ja yksityiskohdat, Instagram on
tiivis ja kuvavetoinen, TikTok on lyhyt ja alkaa koukulla. Kirjoita jokainen kanava erikseen,
älä kopioi samaa tekstiä kanavasta toiseen.`;

function eventBrief(event) {
  const rows = [
    ['Otsikko', event.title],
    ['Tyyppi', event.type],
    ['Päivä', `${shortDate(event.date)} (${longDate(event.date)})`],
    ['Kellonaika', timeRange(event)],
    ['Ovet auki', event.doors],
    ['Esiintyjät', artistList(event.artists)],
    ['Paikka', [event.venue, event.address].filter(Boolean).join(', ')],
    ['Liput', priceLabel(event)],
    ['Lippulinkki', event.ticketUrl],
    ['Ikäraja', event.ageLimit],
    ['Livestream', event.livestream ? 'Kyllä, lähetetään YouTubessa' : 'Ei'],
    ['Järjestäjän omat muistiinpanot', event.description],
  ];
  return rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n');
}

/**
 * @returns {Promise<{copy: object, model: string}>}
 * @throws jos API-kutsu epäonnistuu — kutsuja päättää varautumisesta.
 */
export async function generateCopy(event, { instruction } = {}) {
  const client = new Anthropic();

  const userText = [
    'Kirjoita some-tekstit tälle tapahtumalle.',
    '',
    eventBrief(event),
    instruction ? `\nLisäohje tähän versioon: ${instruction}` : '',
  ].join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: userText }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Malli kieltäytyi vastaamasta tähän pyyntöön.');
  }

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('Malli palautti tyhjän vastauksen.');

  const parsed = JSON.parse(text);
  return { copy: parsed, model: response.model };
}
