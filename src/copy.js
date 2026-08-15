/**
 * Mallipohjaiset some-tekstit. Käytetään aina kun AI-generointia ei ole
 * käytettävissä, ja AI-tekstien varalta jos generointi epäonnistuu.
 */

import { artistList, longDate, priceLabel, shortDate, timeRange } from '../public/shared/format.js';

function detailLines(event) {
  const lines = [];
  const when = [shortDate(event.date), timeRange(event) && `klo ${timeRange(event)}`].filter(Boolean).join(' ');
  if (when) lines.push(`🗓 ${when}`);
  if (event.venue) lines.push(`📍 ${[event.venue, event.address].filter(Boolean).join(', ')}`);
  if (event.doors) lines.push(`🚪 Ovet klo ${event.doors}`);
  const price = priceLabel(event);
  if (price) lines.push(`🎟 ${price}`);
  if (event.ageLimit) lines.push(`🔞 Ikäraja ${event.ageLimit}`);
  if (event.ticketUrl) lines.push(`🔗 ${event.ticketUrl}`);
  return lines;
}

function hashtags(event) {
  const base = ['#salo', '#salonseutu', '#livemusiikki', '#keikka'];
  const fromType = {
    'Klubi-ilta': '#klubi',
    'DJ-ilta': '#dj',
    Karaoke: '#karaoke',
    Livestream: '#livestream',
  }[event.type];
  if (fromType) base.push(fromType);
  for (const artist of event.artists || []) {
    const tag = `#${artist.toLowerCase().replace(/[^a-zåäö0-9]+/gi, '')}`;
    if (tag.length > 2) base.push(tag);
  }
  return [...new Set(base)].slice(0, 10);
}

function headline(event) {
  const artists = artistList(event.artists);
  if (artists && event.title && !event.title.includes(artists)) return `${event.title} – ${artists}`;
  return event.title || artists || event.type;
}

export function buildTemplateCopy(event) {
  const details = detailLines(event);
  const artists = artistList(event.artists);
  const tags = hashtags(event);
  const desc = (event.description || '').trim();
  const venue = event.venue || 'Salossa';

  const facebook = [
    `${headline(event)}`,
    '',
    desc || `${event.type} ${longDate(event.date)} — ${venue}.${artists ? ` Lavalla ${artists}.` : ''}`,
    '',
    ...details,
    '',
    'Tervetuloa! 🎶',
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');

  const instagram = [
    `${headline(event)} 🎤`,
    '',
    desc ? desc.split('\n')[0] : `${longDate(event.date)} ${venue}.${artists ? ` Lavalla ${artists}.` : ''}`,
    '',
    details.slice(0, 4).join('\n'),
    '',
    tags.join(' '),
  ].join('\n');

  const tiktok = [
    `TÄNÄÄN: ${headline(event)}`,
    [venue, timeRange(event) && `klo ${timeRange(event)}`].filter(Boolean).join(' · '),
    priceLabel(event) ? `Liput ${priceLabel(event)}` : '',
    tags.slice(0, 6).join(' '),
  ].filter(Boolean).join('\n');

  const cluby = [
    headline(event),
    desc || `${event.type}${artists ? `: ${artists}` : ''} ${shortDate(event.date)}${event.startTime ? ` klo ${event.startTime}` : ''}.`,
    details.join(' · ').replace(/[🗓📍🚪🎟🔞🔗]\s?/g, ''),
  ].filter(Boolean).join('\n\n');

  const webador = [
    `<h2>${headline(event)}</h2>`,
    `<p>${desc || `${event.type} ${longDate(event.date)} ${venue}.${artists ? ` Esiintyjinä ${artists}.` : ''}`}</p>`,
    '<ul>',
    ...details.map((line) => `  <li>${line.replace(/^[^\s]+\s/, '')}</li>`),
    '</ul>',
    event.ticketUrl ? `<p><a href="${event.ticketUrl}">Liput ja lisätiedot</a></p>` : '',
  ].filter(Boolean).join('\n');

  const youtube = [
    `${headline(event)} – LIVE ${shortDate(event.date)}`,
    '',
    desc || `Suora lähetys ${venue}.${artists ? ` Esiintyjinä ${artists}.` : ''}`,
    '',
    ...details,
    '',
    tags.join(' '),
  ].join('\n');

  const intro = [
    `INTRO – ${headline(event)}`,
    '',
    `Ruututeksti 1: ${headline(event)}`,
    `Ruututeksti 2: ${shortDate(event.date)}${timeRange(event) ? ` · klo ${timeRange(event)}` : ''}`,
    `Ruututeksti 3: ${venue}`,
    '',
    'Juonto: "Tervetuloa mukaan! Tänään lavalla ' +
      `${artists || headline(event)} — ${venue}. Laita peukku ja kommentti tulemaan, niin lähetys näkyy useammalle."`,
    '',
    `Lopputekstit: ${event.ticketUrl || venue}`,
  ].join('\n');

  return { facebook, instagram, tiktok, cluby, webador, youtube, intro, hashtags: tags };
}
