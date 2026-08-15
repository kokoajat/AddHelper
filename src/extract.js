/**
 * Keikkaehdotusten poiminta sähköposteista.
 *
 * Claude lukee viestit ja palauttaa rakenteisen ehdotuslistan. Ilman API-avainta
 * käytetään yksinkertaista päivämäärähakua, jotta työnkulku on kokeiltavissa.
 */

import Anthropic from '@anthropic-ai/sdk';
import { toISODate } from '../public/shared/format.js';

const MODEL = process.env.ADDHELPER_MODEL || 'claude-opus-5';

export const CONFIDENCE = ['varma', 'todennäköinen', 'epävarma'];

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    messageId: { type: 'string', description: 'Sen viestin id, josta ehdotus syntyi.' },
    title: { type: 'string', description: 'Lyhyt otsikko tapahtumalle. Tyhjä jos ei selviä.' },
    artists: { type: 'array', items: { type: 'string' }, description: 'Esiintyjät.' },
    date: { type: 'string', description: 'Päivä muodossa VVVV-KK-PP. Tyhjä jos ei selviä.' },
    startTime: { type: 'string', description: 'Alkamisaika HH:MM tai tyhjä.' },
    endTime: { type: 'string', description: 'Päättymisaika HH:MM tai tyhjä.' },
    venue: { type: 'string', description: 'Paikka tai tyhjä.' },
    price: { type: 'string', description: 'Lipun hinta yleisölle tai tyhjä. Ei artistin palkkiota.' },
    notes: { type: 'string', description: 'Muut sopimukseen liittyvät tiedot: palkkio, tekniikka, majoitus.' },
    confidence: { type: 'string', enum: CONFIDENCE, description: 'Kuinka varma olet että keikka on sovittu.' },
    evidence: { type: 'string', description: 'Lyhyt suora lainaus viestistä, johon päätelmä perustuu.' },
  },
  required: ['messageId', 'title', 'artists', 'date', 'startTime', 'endTime', 'venue', 'price', 'notes', 'confidence', 'evidence'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    proposals: { type: 'array', items: PROPOSAL_SCHEMA },
  },
  required: ['proposals'],
  additionalProperties: false,
};

const SYSTEM = `Luet salolaisen tapahtumapaikan sähköposteja ja poimit niistä sovitut keikat.

Poimi vain tapahtumia, joista on tosiasiassa sovittu tai jotka on vahvistettu. Jätä väliin
tarjouskirjeet, uutiskirjeet, laskut, mainokset ja alustavat tiedustelut, joissa mitään ei ole
vielä päätetty ("olisiko teillä tilaa joskus syksyllä" ei ole keikka).

Älä keksi tietoja. Jos kellonaika, hinta tai paikka ei käy ilmi viestistä, jätä kenttä tyhjäksi.
Jokaisesta ehdotuksesta on annettava evidence-kenttään lyhyt suora lainaus siitä kohdasta
viestiä, johon päätelmä perustuu.

Jos samasta keikasta on useita viestejä, palauta siitä yksi ehdotus ja käytä uusimpia tietoja.
Merkitse confidence rehellisesti: "varma" vain kun päivä ja esiintyjä on nimetty ja sopimus on
selvästi tehty.`;

function messagesToText(messages) {
  return messages.map((msg) => [
    `--- viesti ${msg.id} ---`,
    `Päivätty: ${msg.date || 'tuntematon'}`,
    `Lähettäjä: ${msg.from}`,
    `Aihe: ${msg.subject}`,
    '',
    msg.body,
  ].join('\n')).join('\n\n');
}

/** Claude-pohjainen poiminta. Heittää virheen, jos kutsu epäonnistuu. */
export async function extractWithAI(messages) {
  const client = new Anthropic();
  const today = toISODate(new Date());

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        `Tänään on ${today}. Suhteelliset ilmaisut ("ensi perjantaina") lasketaan siitä.`,
        'Poimi seuraavista viesteistä sovitut keikat.',
        '',
        messagesToText(messages),
      ].join('\n'),
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Malli kieltäytyi käsittelemästä viestejä.');
  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('Malli palautti tyhjän vastauksen.');

  return { proposals: JSON.parse(text).proposals || [], source: `ai:${response.model}` };
}

const MONTHS = {
  tammi: 1, helmi: 2, maalis: 3, huhti: 4, touko: 5, kesä: 6,
  heinä: 7, elo: 8, syys: 9, loka: 10, marras: 11, joulu: 12,
};

/** Etsii ensimmäisen päivämäärän: "12.9.2026", "12.9." tai "12. syyskuuta". */
function findDate(text, from = new Date()) {
  const numeric = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})?/.exec(text);
  let day;
  let month;
  let year;

  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = numeric[3] ? Number(numeric[3]) : null;
  } else {
    const named = new RegExp(`\\b(\\d{1,2})\\.?\\s*(${Object.keys(MONTHS).join('|')})\\w*`, 'i').exec(text);
    if (!named) return '';
    day = Number(named[1]);
    month = MONTHS[named[2].toLowerCase()];
    year = null;
  }

  if (!day || !month || month > 12 || day > 31) return '';
  if (!year) {
    // Ilman vuotta: lähin tuleva osuma.
    year = from.getFullYear();
    if (new Date(year, month - 1, day) < from) year += 1;
  }
  return toISODate(new Date(year, month - 1, day));
}

/** Sanoja, jotka viittaavat sovittuun esiintymiseen. */
const GIG_SIGNALS = /keikka|keikan|esiinty|soundcheck|sovittu|vahvist|karaoke|\bdj\b|klubi|\blive\b|bändi|lavalle|ovimaksu|palkkio|setti/i;

/** Sanoja, jotka kertovat ettei viesti koske keikkaa. */
const JUNK_SIGNALS = /lasku|eräpäivä|uutiskirje|tarjous voimassa|alennus|tilausvahvistus|toimitusvahvistus|rekisteriseloste/i;

/**
 * Varapoiminta ilman API-avainta: aihe otsikoksi, ensimmäinen päivämäärä käyttöön.
 * Karkea suodatus karsii ilmeisimmät laskut ja mainokset, mutta tämä on selvästi
 * heikompi kuin Claude-poiminta — ehdotukset kannattaa lukea tarkkaan.
 */
export function extractWithHeuristics(messages) {
  const proposals = [];
  for (const msg of messages) {
    const haystack = `${msg.subject}\n${msg.body}`;
    if (/no-?reply|donotreply/i.test(msg.from)) continue;
    if (JUNK_SIGNALS.test(haystack) && !GIG_SIGNALS.test(haystack)) continue;
    if (!GIG_SIGNALS.test(haystack)) continue;

    const date = findDate(haystack);
    if (!date) continue;

    const time = /klo\s*(\d{1,2})[.:](\d{2})/i.exec(haystack);
    const line = haystack.split('\n').find((row) => row.includes(date.slice(8).replace(/^0/, '')))
      || msg.subject;

    proposals.push({
      messageId: msg.id,
      title: msg.subject.replace(/^(re|vs|fwd?):\s*/i, '').trim(),
      artists: [],
      date,
      startTime: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '',
      endTime: '',
      venue: '',
      price: '',
      notes: '',
      confidence: 'epävarma',
      evidence: line.trim().slice(0, 200),
    });
  }
  return { proposals, source: 'haku' };
}

/** Poimintakerroksen sisäänkäynti: AI jos mahdollista, muuten hakupoiminta. */
export async function extractProposals(messages) {
  if (!messages.length) return { proposals: [], source: 'tyhjä' };
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!hasKey) return extractWithHeuristics(messages);
  try {
    return await extractWithAI(messages);
  } catch (err) {
    return { ...extractWithHeuristics(messages), warning: err.message };
  }
}
