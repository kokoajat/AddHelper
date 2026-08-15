/** Kalenterivienti: .ics-tiedosto ja Google-kalenterin valmis linkki. */

import { artistList, priceLabel } from './format.js';

const DEFAULT_DURATION_HOURS = 3;

function pad(n) {
  return String(n).padStart(2, '0');
}

/** '2026-09-12' + '21:00' -> '20260912T210000' (kelluva paikallinen aika) */
function stamp(dateISO, time) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh || 0)}${pad(mm || 0)}00`;
}

function endStamp(event) {
  const [y, m, d] = event.date.split('-').map(Number);
  const [hh, mm] = (event.startTime || '00:00').split(':').map(Number);
  if (event.endTime) {
    const [eh, em] = event.endTime.split(':').map(Number);
    // Loppuaika ennen alkuaikaa tarkoittaa seuraavaa vuorokautta (esim. 21:00–02:00).
    const rollover = eh * 60 + em <= hh * 60 + mm ? 1 : 0;
    const end = new Date(y, m - 1, d + rollover, eh, em);
    return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
  }
  const end = new Date(y, m - 1, d, (hh || 0) + DEFAULT_DURATION_HOURS, mm || 0);
  return `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
}

export function eventSummary(event) {
  const artists = artistList(event.artists);
  if (event.title) return event.title;
  return artists ? `${event.type}: ${artists}` : event.type;
}

export function eventDetails(event) {
  return [
    artistList(event.artists) && `Esiintyjät: ${artistList(event.artists)}`,
    priceLabel(event) && `Liput: ${priceLabel(event)}`,
    event.doors && `Ovet: ${event.doors}`,
    event.ageLimit && `Ikäraja: ${event.ageLimit}`,
    event.ticketUrl,
    event.description,
  ].filter(Boolean).join('\n');
}

function escapeICS(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Taittaa rivit 75 oktettiin RFC 5545:n mukaan. */
function fold(line) {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

export function toICS(events, { prodId = '-//AddHelper//FI' } = {}) {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  for (const event of events) {
    if (!event.date) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@addhelper`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(event.date, event.startTime)}`,
      `DTEND:${endStamp(event)}`,
      `SUMMARY:${escapeICS(eventSummary(event))}`,
      `DESCRIPTION:${escapeICS(eventDetails(event))}`,
      `LOCATION:${escapeICS([event.venue, event.address].filter(Boolean).join(', '))}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

/** Valmiiksi täytetty Google-kalenterin lisäyslomake. */
export function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventSummary(event),
    dates: `${stamp(event.date, event.startTime)}/${endStamp(event)}`,
    details: eventDetails(event),
    location: [event.venue, event.address].filter(Boolean).join(', '),
    ctz: 'Europe/Helsinki',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
