/**
 * Feelment-vaihe: piirtää tapahtuman tiedot kuvan päälle selaimessa.
 * Ei palvelinkäsittelyä — canvas riittää, ja tulos ladataan suoraan PNG:nä.
 */

import { artistList, priceLabel, shortDate, timeRange } from './shared/format.js';

export const ASPECTS = {
  alkuperainen: { label: 'Alkuperäinen', ratio: null },
  neliö: { label: 'Neliö 1:1 (IG)', ratio: 1 },
  pysty: { label: 'Pysty 4:5 (IG)', ratio: 4 / 5 },
  tarina: { label: 'Tarina 9:16', ratio: 9 / 16 },
  vaaka: { label: 'Vaaka 16:9 (FB)', ratio: 16 / 9 },
};

const MAX_WIDTH = 1600;

function fitText(ctx, text, maxWidth, startSize, weight, family) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= 12) break;
    size -= 2;
  } while (size > 12);
  return size;
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Rajaa lähdekuvan halutun kuvasuhteen mukaan (cover). */
function coverRect(image, ratio) {
  if (!ratio) return { sx: 0, sy: 0, sw: image.width, sh: image.height, w: image.width, h: image.height };
  const target = ratio;
  const source = image.width / image.height;
  if (source > target) {
    const sw = image.height * target;
    return { sx: (image.width - sw) / 2, sy: 0, sw, sh: image.height, w: sw, h: image.height };
  }
  const sh = image.width / target;
  return { sx: 0, sy: (image.height - sh) / 2, sw: image.width, sh, w: image.width, h: sh };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement|null} image  null = pelkkä tumma tausta
 * @param {object} event
 * @param {{aspect?: string, accent?: string, extra?: string, showPrice?: boolean}} options
 */
export function renderPoster(canvas, image, event, options = {}) {
  const { aspect = 'alkuperainen', accent = '#f2a541', extra = '', showPrice = true } = options;
  const ratio = ASPECTS[aspect]?.ratio ?? null;

  let width;
  let height;
  let rect = null;

  if (image) {
    rect = coverRect(image, ratio);
    const scale = Math.min(1, MAX_WIDTH / rect.w);
    width = Math.round(rect.w * scale);
    height = Math.round(rect.h * scale);
  } else {
    width = 1080;
    height = ratio ? Math.round(1080 / ratio) : 1080;
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, width, height);
  if (image && rect) {
    ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
  }

  // Tummennus alareunaan, jotta teksti erottuu kuvasta.
  const fade = ctx.createLinearGradient(0, height * 0.32, 0, height);
  fade.addColorStop(0, 'rgba(8, 10, 15, 0)');
  fade.addColorStop(0.55, 'rgba(8, 10, 15, 0.72)');
  fade.addColorStop(1, 'rgba(8, 10, 15, 0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.32, width, height * 0.68);

  const pad = Math.round(width * 0.06);
  const maxWidth = width - pad * 2;
  let y = height - pad;

  const lines = [];

  const dateLine = [shortDate(event.date), timeRange(event) && `klo ${timeRange(event)}`].filter(Boolean).join(' · ');
  const placeLine = [event.venue, showPrice && priceLabel(event)].filter(Boolean).join(' · ');
  const footer = [placeLine, extra].filter(Boolean).join('  ·  ');

  if (footer) lines.push({ text: footer, size: Math.round(width * 0.032), weight: 500, color: 'rgba(255,255,255,0.82)' });
  if (dateLine) lines.push({ text: dateLine, size: Math.round(width * 0.042), weight: 700, color: accent });

  const artists = artistList(event.artists);
  if (artists && artists !== event.title) {
    lines.push({ text: artists, size: Math.round(width * 0.05), weight: 600, color: 'rgba(255,255,255,0.92)' });
  }

  const title = event.title || event.type;
  lines.push({ text: title, size: Math.round(width * 0.085), weight: 800, color: '#ffffff', wrap: true });

  // Piirretään alhaalta ylös, jotta otsikko asettuu muun tekstin päälle.
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    if (line.wrap) {
      const size = fitText(ctx, line.text, maxWidth, line.size, line.weight, family);
      ctx.font = `${line.weight} ${size}px ${family}`;
      const wrapped = wrap(ctx, line.text, maxWidth);
      for (let i = wrapped.length - 1; i >= 0; i -= 1) {
        ctx.fillStyle = line.color;
        ctx.fillText(wrapped[i], pad, y);
        y -= size * 1.08;
      }
      y -= size * 0.1;
    } else {
      const size = fitText(ctx, line.text, maxWidth, line.size, line.weight, family);
      ctx.font = `${line.weight} ${size}px ${family}`;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, pad, y);
      y -= size * 1.5;
    }
  }

  // Aksenttiviiva otsikon yläpuolelle.
  ctx.fillStyle = accent;
  ctx.fillRect(pad, Math.max(y - 6, pad), Math.round(width * 0.12), Math.max(4, Math.round(width * 0.006)));

  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Kuvan lataus epäonnistui.'));
    img.src = src;
  });
}
