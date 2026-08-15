/**
 * Feelment-vaihe: kevyt kuvaeditori, joka rajaa kuvan kanavan vaatimaan
 * kuvasuhteeseen ja piirtää tapahtuman tiedot päälle. Kaikki selaimessa.
 *
 * Rajaus tallennetaan polttopisteenä (fx, fy) ja zoomina, ei pikseleinä.
 * Siksi sama rajaus siirtyy sellaisenaan kuvasuhteesta toiseen: kun keskität
 * artistin kasvot kerran, hän pysyy kuvassa myös tarina- ja vaakakoossa.
 */

import { artistList, priceLabel, shortDate, timeRange } from './shared/format.js';

/** Kanavien yleisimmät julkaisukoot. Alustat päivittävät näitä ajoittain. */
export const PRESETS = [
  { id: 'ig-square', label: 'Instagram – neliö', channel: 'Instagram', w: 1080, h: 1080, ratio: '1:1', note: 'Perinteinen syötekuva.' },
  { id: 'ig-portrait', label: 'Instagram – pysty', channel: 'Instagram', w: 1080, h: 1350, ratio: '4:5', note: 'Vie eniten tilaa syötteessä.' },
  { id: 'story', label: 'Tarina / Reels', channel: 'Instagram & Facebook', w: 1080, h: 1920, ratio: '9:16', note: 'Koko ruudun pystykuva.' },
  { id: 'fb-event', label: 'Facebook-tapahtuman kansi', channel: 'Facebook', w: 1200, h: 628, ratio: '1.91:1', note: 'Tapahtuman kansikuva.' },
  { id: 'fb-post', label: 'Facebook – jaettava kuva', channel: 'Facebook', w: 1200, h: 900, ratio: '4:3', note: 'Julkaisun kuva ja verkkosivu.' },
  { id: 'tiktok', label: 'TikTok', channel: 'TikTok', w: 1080, h: 1920, ratio: '9:16', note: 'Koko ruudun pystyvideo.' },
  { id: 'yt-thumb', label: 'YouTube – pikkukuva', channel: 'YouTube', w: 1280, h: 720, ratio: '16:9', note: 'Lähetyksen pikkukuva.' },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Koot, jotka "Lataa kaikki koot" tuottaa yhdellä klikkauksella. */
export const EXPORT_SET = ['ig-portrait', 'ig-square', 'story', 'fb-event'];

export const TEXT_POSITIONS = { ala: 'Teksti alas', yla: 'Teksti ylös', pois: 'Ei tekstiä' };

export function defaultSettings() {
  return {
    presetId: 'ig-portrait',
    zoom: 1,        // 1 = kuva täyttää rajauksen juuri ja juuri
    fx: 0.5,        // polttopiste vaakasuunnassa, 0–1 kuvan leveydestä
    fy: 0.5,        // polttopiste pystysuunnassa
    fit: 'tayta',   // 'tayta' = rajaa reunoista | 'sovita' = koko kuva näkyviin
    text: 'ala',
    accent: '#f2a541',
    extra: '',
    showPrice: true,
  };
}

export function normalizeSettings(saved) {
  const base = defaultSettings();
  if (!saved || typeof saved !== 'object') return base;
  const merged = { ...base, ...saved };
  if (!PRESET_BY_ID[merged.presetId]) merged.presetId = base.presetId;
  merged.zoom = clamp(Number(merged.zoom) || 1, 1, 4);
  merged.fx = clamp(Number(merged.fx) ?? 0.5, 0, 1);
  merged.fy = clamp(Number(merged.fy) ?? 0.5, 0, 1);
  return merged;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lähdekuvan rajattava alue. Zoom 1 = pienin alue joka vielä täyttää
 * kohdesuhteen; suurempi zoom rajaa tiukemmin polttopisteen ympäriltä.
 */
export function sourceRect(image, targetRatio, settings) {
  const imageRatio = image.width / image.height;
  let sw;
  let sh;
  if (imageRatio > targetRatio) {
    sh = image.height;
    sw = sh * targetRatio;
  } else {
    sw = image.width;
    sh = sw / targetRatio;
  }
  sw /= settings.zoom;
  sh /= settings.zoom;

  const sx = clamp(settings.fx * image.width - sw / 2, 0, Math.max(0, image.width - sw));
  const sy = clamp(settings.fy * image.height - sh / 2, 0, Math.max(0, image.height - sh));
  return { sx, sy, sw, sh };
}

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

function drawBackground(ctx, image, width, height, settings, ratio) {
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, width, height);
  if (!image) return;

  if (settings.fit === 'sovita') {
    // Koko kuva näkyviin: taustalle sumennettu venytys, jotta reunat eivät ammota tyhjinä.
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.6)';
    const cover = sourceRect(image, ratio, { ...settings, zoom: 1 });
    ctx.drawImage(image, cover.sx, cover.sy, cover.sw, cover.sh, -width * 0.05, -height * 0.05, width * 1.1, height * 1.1);
    ctx.restore();

    const scale = Math.min(width / image.width, height / image.height) * settings.zoom;
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
    return;
  }

  const rect = sourceRect(image, ratio, settings);
  ctx.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
}

function drawOverlay(ctx, event, width, height, settings) {
  if (settings.text === 'pois') return;
  const family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const top = settings.text === 'yla';

  const fade = ctx.createLinearGradient(0, top ? 0 : height, 0, top ? height * 0.62 : height * 0.34);
  fade.addColorStop(0, 'rgba(8, 10, 15, 0.95)');
  fade.addColorStop(0.5, 'rgba(8, 10, 15, 0.7)');
  fade.addColorStop(1, 'rgba(8, 10, 15, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, top ? 0 : height * 0.34, width, top ? height * 0.62 : height * 0.66);

  const pad = Math.round(width * 0.06);
  const maxWidth = width - pad * 2;

  const dateLine = [shortDate(event.date), timeRange(event) && `klo ${timeRange(event)}`].filter(Boolean).join(' · ');
  const footer = [event.venue, settings.showPrice && priceLabel(event), settings.extra]
    .filter(Boolean).join('  ·  ');
  const artists = artistList(event.artists);
  const title = event.title || event.type;

  // Rivit alhaalta ylös; otsikko piirtyy viimeisenä muiden päälle.
  const rows = [];
  if (footer) rows.push({ text: footer, size: width * 0.032, weight: 500, color: 'rgba(255,255,255,0.82)' });
  if (dateLine) rows.push({ text: dateLine, size: width * 0.042, weight: 700, color: settings.accent });
  if (artists && artists !== title) {
    rows.push({ text: artists, size: width * 0.05, weight: 600, color: 'rgba(255,255,255,0.92)' });
  }
  rows.push({ text: title, size: width * 0.085, weight: 800, color: '#ffffff', wrap: true });

  let y = top ? 0 : height - pad;
  const measured = [];

  for (const row of rows) {
    const size = fitText(ctx, row.text, maxWidth, Math.round(row.size), row.weight, family);
    const lines = row.wrap ? wrap(ctx, row.text, maxWidth) : [row.text];
    measured.push({ ...row, size, lines });
  }

  if (top) {
    // Ylhäällä sama sisältö käännetään oikeaan lukujärjestykseen.
    y = pad;
    for (const row of [...measured].reverse()) {
      ctx.font = `${row.weight} ${row.size}px ${family}`;
      ctx.fillStyle = row.color;
      for (const line of row.lines) {
        y += row.size;
        ctx.fillText(line, pad, y);
        y += row.size * (row.wrap ? 0.08 : 0.5);
      }
    }
    ctx.fillStyle = settings.accent;
    ctx.fillRect(pad, y + Math.round(width * 0.02), Math.round(width * 0.12), Math.max(4, Math.round(width * 0.006)));
    return;
  }

  for (const row of measured) {
    ctx.font = `${row.weight} ${row.size}px ${family}`;
    ctx.fillStyle = row.color;
    for (let i = row.lines.length - 1; i >= 0; i -= 1) {
      ctx.fillText(row.lines[i], pad, y);
      y -= row.size * (row.wrap ? 1.08 : 1.5);
    }
    if (row.wrap) y -= row.size * 0.1;
  }
  ctx.fillStyle = settings.accent;
  ctx.fillRect(pad, Math.max(y + Math.round(width * 0.02), pad), Math.round(width * 0.12), Math.max(4, Math.round(width * 0.006)));
}

/**
 * Piirtää julisteen canvasille kanavan täydessä koossa.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement|null} image
 * @param {object} event
 * @param {object} settings
 * @param {string} [presetId] ohittaa settings.presetId (vientiä varten)
 */
export function renderPoster(canvas, image, event, settings, presetId) {
  const preset = PRESET_BY_ID[presetId || settings.presetId] || PRESET_BY_ID['ig-portrait'];
  canvas.width = preset.w;
  canvas.height = preset.h;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  drawBackground(ctx, image, preset.w, preset.h, settings, preset.w / preset.h);
  drawOverlay(ctx, event, preset.w, preset.h, settings);
  return canvas;
}

/** Piirtää yhden koon irralliselle canvasille ja palauttaa data-URL:n. */
export function exportPreset(image, event, settings, presetId) {
  const canvas = document.createElement('canvas');
  renderPoster(canvas, image, event, settings, presetId);
  return canvas.toDataURL('image/png');
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

/**
 * Kytkee hiiri- ja kosketusraahauksen sekä rullazoomin canvasiin.
 * @returns {() => void} irrotusfunktio
 */
export function attachCropControls(canvas, getState, onChange) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e) => {
    const { settings } = getState();
    if (settings.fit === 'sovita') return; // sovitetussa tilassa ei ole mitä siirtää
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  const onMove = (e) => {
    if (!dragging) return;
    const { image, settings } = getState();
    if (!image) return;
    const preset = PRESET_BY_ID[settings.presetId];
    const rect = sourceRect(image, preset.w / preset.h, settings);
    const box = canvas.getBoundingClientRect();

    // Näytön pikselisiirto muunnetaan lähdekuvan koordinaatistoon.
    const dx = ((e.clientX - lastX) / box.width) * rect.sw / image.width;
    const dy = ((e.clientY - lastY) / box.height) * rect.sh / image.height;
    lastX = e.clientX;
    lastY = e.clientY;

    onChange({ fx: clamp(settings.fx - dx, 0, 1), fy: clamp(settings.fy - dy, 0, 1) }, false);
  };

  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grab';
    onChange({}, true); // tallennus vasta kun raahaus päättyy
  };

  const onWheel = (e) => {
    e.preventDefault();
    const { settings } = getState();
    const zoom = clamp(settings.zoom * (1 - e.deltaY * 0.0015), 1, 4);
    onChange({ zoom }, false);
    clearTimeout(onWheel.timer);
    onWheel.timer = setTimeout(() => onChange({}, true), 400);
  };

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
