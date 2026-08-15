/** Päivämäärä- ja tekstiapurit, joita käytetään sekä palvelimella että selaimessa. */

const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const MONTHS = [
  'tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta',
  'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta',
];

/** '2026-09-12' -> Date (paikallinen keskiyö, ei aikavyöhykesiirtymää) */
export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** 'pe 12.9.2026' */
export function shortDate(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** 'perjantaina 12. syyskuuta' */
export function longDate(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const wd = ['sunnuntaina', 'maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina'];
  return `${wd[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** 'pe 12.9. klo 21:00' */
export function dateTimeLabel(event) {
  const parts = [shortDate(event.date)];
  if (event.startTime) parts.push(`klo ${event.startTime}`);
  return parts.join(' ');
}

/** Lipun hinta luettavassa muodossa. */
export function priceLabel(event) {
  const p = (event.price || '').trim();
  if (!p) return '';
  if (/^\d+([.,]\d+)?$/.test(p)) return `${p} €`;
  return p;
}

/** Montako päivää tapahtumaan (negatiivinen = mennyt). */
export function daysUntil(iso, from = new Date()) {
  const d = parseDate(iso);
  if (!d) return null;
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((d - base) / 86400000);
}

/** Seuraava keskiviikko (tänään mukaan lukien). */
export function nextWednesday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (3 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Artistilista tekstiksi: 'A, B ja C' */
export function artistList(artists = []) {
  const list = artists.filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} ja ${list[list.length - 1]}`;
}

/** Aikaväli: '21:00–02:00' */
export function timeRange(event) {
  if (!event.startTime) return '';
  return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
}
