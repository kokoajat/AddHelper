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

export function defaultSettings() {
  return {
    presetId: 'ig-portrait',
    zoom: 1,        // 1 = kuva täyttää rajauksen juuri ja juuri
    fx: 0.5,        // polttopiste vaakasuunnassa, 0–1 kuvan leveydestä
    fy: 0.5,        // polttopiste pystysuunnassa
    fit: 'tayta',   // 'tayta' = rajaa reunoista | 'sovita' = koko kuva näkyviin
    template: 'alalaita',
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
  // Vanhat tallenteet käyttivät erillistä text-kenttää ennen pohjavalikoimaa.
  if (!TEMPLATES[merged.template]) {
    merged.template = { yla: 'ylalaita', pois: 'pois' }[saved.text] || base.template;
  }
  delete merged.text;
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

/** Valmiit julistepohjat. Sama sisältö, eri asettelu. */
export const TEMPLATES = {
  alalaita: 'Alalaita — teksti alareunassa',
  ylalaita: 'Ylälaita — teksti yläreunassa',
  nauha: 'Nauha — tumma palkki alla',
  keskitetty: 'Keskitetty — juliste',
  minimi: 'Minimi — pieni kulmalaatta',
  pois: 'Ei tekstiä',
};

const FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Tapahtuman tiedot riveiksi, joita pohjat käyttävät eri tavoin. */
function textRows(event, settings) {
  return {
    title: event.title || event.type,
    artists: artistList(event.artists),
    date: [shortDate(event.date), timeRange(event) && `klo ${timeRange(event)}`].filter(Boolean).join(' · '),
    footer: [event.venue, settings.showPrice && priceLabel(event), settings.extra].filter(Boolean).join('  ·  '),
  };
}

/**
 * Reunasta reunaan latova pohja: alalaita ja ylälaita jakavat saman logiikan.
 * Tekstilohko mitataan ja kutistetaan mahtumaan, jotta matalat vaakakoot
 * (esim. Facebookin 1200 × 628) eivät leikkaa otsikkoa.
 */
function drawEdgeTemplate(ctx, event, width, height, settings, top) {
  const rows = textRows(event, settings);
  const pad = Math.round(width * 0.06);
  const maxWidth = width - pad * 2;
  const barHeight = Math.max(4, Math.round(width * 0.006));
  const barGap = width * 0.028;

  const spec = [
    { text: rows.title, size: width * 0.085, weight: 800, color: '#ffffff', wrap: true },
    rows.artists && rows.artists !== rows.title
      ? { text: rows.artists, size: width * 0.05, weight: 600, color: 'rgba(255,255,255,0.92)' } : null,
    rows.date ? { text: rows.date, size: width * 0.042, weight: 700, color: settings.accent } : null,
    rows.footer ? { text: rows.footer, size: width * 0.032, weight: 500, color: 'rgba(255,255,255,0.82)' } : null,
  ].filter(Boolean);

  const measure = (scale) => {
    let total = barHeight + barGap;
    const measured = spec.map((row) => {
      const size = fitText(ctx, row.text, maxWidth, Math.round(row.size * scale), row.weight, FAMILY);
      const lines = row.wrap ? wrap(ctx, row.text, maxWidth) : [row.text];
      total += lines.length * size * 1.18;
      return { ...row, size, lines };
    });
    return { measured, total };
  };

  let { measured, total } = measure(1);
  const budget = height - pad * 2;
  if (total > budget) ({ measured, total } = measure(Math.max(0.4, budget / total)));

  const blockTop = top ? pad : height - pad - total;
  const fade = top
    ? ctx.createLinearGradient(0, 0, 0, total + pad * 2.5)
    : ctx.createLinearGradient(0, height, 0, Math.max(0, blockTop - pad * 1.5));
  fade.addColorStop(0, 'rgba(8, 10, 15, 0.95)');
  fade.addColorStop(0.55, 'rgba(8, 10, 15, 0.72)');
  fade.addColorStop(1, 'rgba(8, 10, 15, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'left';
  let y = blockTop;
  ctx.fillStyle = settings.accent;
  ctx.fillRect(pad, y, Math.round(width * 0.12), barHeight);
  y += barHeight + barGap;

  for (const row of measured) {
    ctx.font = `${row.weight} ${row.size}px ${FAMILY}`;
    ctx.fillStyle = row.color;
    for (const line of row.lines) {
      y += row.size;
      ctx.fillText(line, pad, y);
      y += row.size * 0.18;
    }
  }
}

/** Tumma palkki alareunassa: kuva jää kokonaan näkyviin palkin yläpuolelle. */
function drawBandTemplate(ctx, event, width, height, settings) {
  const rows = textRows(event, settings);
  const pad = Math.round(width * 0.055);
  const maxWidth = width - pad * 2;
  const wide = width / height > 1.4;

  const titleSize = fitText(ctx, rows.title, maxWidth, Math.round(width * (wide ? 0.07 : 0.078)), 800, FAMILY);
  const titleLines = wrap(ctx, rows.title, maxWidth);
  const subSize = Math.round(width * (wide ? 0.03 : 0.036));
  const subCount = (rows.artists && rows.artists !== rows.title ? 1 : 0) + (rows.date ? 1 : 0) + (rows.footer ? 1 : 0);
  const bandHeight = pad * 2 + titleLines.length * titleSize * 1.1 + subCount * subSize * 1.55;
  const bandTop = height - bandHeight;

  ctx.fillStyle = 'rgba(9, 11, 16, 0.93)';
  ctx.fillRect(0, bandTop, width, bandHeight);
  ctx.fillStyle = settings.accent;
  ctx.fillRect(0, bandTop, width, Math.max(4, Math.round(width * 0.008)));

  ctx.textAlign = 'left';
  let y = bandTop + pad;

  ctx.font = `800 ${titleSize}px ${FAMILY}`;
  ctx.fillStyle = '#ffffff';
  for (const line of titleLines) {
    y += titleSize;
    ctx.fillText(line, pad, y);
    y += titleSize * 0.1;
  }

  const subs = [
    rows.artists && rows.artists !== rows.title ? { text: rows.artists, color: 'rgba(255,255,255,0.9)', weight: 600 } : null,
    rows.date ? { text: rows.date, color: settings.accent, weight: 700 } : null,
    rows.footer ? { text: rows.footer, color: 'rgba(255,255,255,0.72)', weight: 500 } : null,
  ].filter(Boolean);

  for (const sub of subs) {
    const size = fitText(ctx, sub.text, maxWidth, subSize, sub.weight, FAMILY);
    ctx.font = `${sub.weight} ${size}px ${FAMILY}`;
    ctx.fillStyle = sub.color;
    y += size * 1.35;
    ctx.fillText(sub.text, pad, y);
  }
}

/** Keskitetty julistetyyli: tumma verho koko kuvan päällä, teksti keskellä. */
function drawCenteredTemplate(ctx, event, width, height, settings) {
  const rows = textRows(event, settings);
  const maxWidth = width * 0.84;
  const centerX = width / 2;
  const barHeight = Math.max(4, Math.round(width * 0.006));

  const veil = ctx.createLinearGradient(0, 0, 0, height);
  veil.addColorStop(0, 'rgba(8, 10, 15, 0.72)');
  veil.addColorStop(0.5, 'rgba(8, 10, 15, 0.42)');
  veil.addColorStop(1, 'rgba(8, 10, 15, 0.82)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  const spec = [
    rows.date ? { text: rows.date, size: width * 0.038, weight: 700, color: settings.accent } : null,
    { text: rows.title.toUpperCase(), size: width * 0.09, weight: 800, color: '#ffffff', wrap: true, gap: 0.34 },
    rows.artists && rows.artists !== rows.title
      ? { text: rows.artists, size: width * 0.045, weight: 600, color: 'rgba(255,255,255,0.92)' } : null,
  ].filter(Boolean);

  const measure = (scale) => {
    let total = barHeight + width * 0.035;
    const measured = spec.map((row) => {
      const size = fitText(ctx, row.text, maxWidth, Math.round(row.size * scale), row.weight, FAMILY);
      const lines = row.wrap ? wrap(ctx, row.text, maxWidth) : [row.text];
      total += lines.length * size * 1.15 + size * (row.gap || 0.45);
      return { ...row, size, lines };
    });
    return { measured, total };
  };

  let { measured, total } = measure(1);
  const budget = height * 0.72;
  if (total > budget) ({ measured, total } = measure(Math.max(0.4, budget / total)));

  ctx.textAlign = 'center';
  let y = (height - total) / 2;

  ctx.fillStyle = settings.accent;
  ctx.fillRect(centerX - width * 0.06, y, Math.round(width * 0.12), barHeight);
  y += barHeight + width * 0.035;

  for (const row of measured) {
    ctx.font = `${row.weight} ${row.size}px ${FAMILY}`;
    ctx.fillStyle = row.color;
    for (const line of row.lines) {
      y += row.size;
      ctx.fillText(line, centerX, y);
      y += row.size * 0.15;
    }
    y += row.size * (row.gap || 0.45);
  }

  if (rows.footer) {
    const size = fitText(ctx, rows.footer, maxWidth, Math.round(width * 0.032), 500, FAMILY);
    ctx.font = `500 ${size}px ${FAMILY}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(rows.footer, centerX, height - Math.round(width * 0.055));
  }
}

/** Pieni laatta alakulmassa — jättää kuvan mahdollisimman paljon näkyviin. */
function drawMinimalTemplate(ctx, event, width, height, settings) {
  const rows = textRows(event, settings);
  const pad = Math.round(width * 0.05);
  const inner = Math.round(width * 0.035);
  const maxWidth = width * 0.7;

  const titleSize = fitText(ctx, rows.title, maxWidth, Math.round(width * 0.05), 800, FAMILY);
  const titleLines = wrap(ctx, rows.title, maxWidth);
  const dateSize = Math.round(width * 0.028);

  ctx.font = `800 ${titleSize}px ${FAMILY}`;
  const titleWidth = Math.max(...titleLines.map((line) => ctx.measureText(line).width));
  ctx.font = `700 ${dateSize}px ${FAMILY}`;
  const dateWidth = rows.date ? ctx.measureText(rows.date).width : 0;

  const plateWidth = Math.max(titleWidth, dateWidth) + inner * 2;
  const plateHeight = inner * 2 + titleLines.length * titleSize * 1.12 + (rows.date ? dateSize * 1.6 : 0);
  const plateX = pad;
  const plateY = height - pad - plateHeight;

  ctx.fillStyle = 'rgba(9, 11, 16, 0.86)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, plateWidth, plateHeight, Math.round(width * 0.018));
    ctx.fill();
  } else {
    ctx.fillRect(plateX, plateY, plateWidth, plateHeight);
  }
  ctx.fillStyle = settings.accent;
  ctx.fillRect(plateX, plateY, Math.max(4, Math.round(width * 0.006)), plateHeight);

  ctx.textAlign = 'left';
  let y = plateY + inner;

  ctx.font = `800 ${titleSize}px ${FAMILY}`;
  ctx.fillStyle = '#ffffff';
  for (const line of titleLines) {
    y += titleSize;
    ctx.fillText(line, plateX + inner, y);
    y += titleSize * 0.12;
  }

  if (rows.date) {
    ctx.font = `700 ${dateSize}px ${FAMILY}`;
    ctx.fillStyle = settings.accent;
    ctx.fillText(rows.date, plateX + inner, y + dateSize * 1.1);
  }
}

function drawOverlay(ctx, event, width, height, settings) {
  const template = settings.template;
  if (template === 'pois') return;

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (template === 'ylalaita') drawEdgeTemplate(ctx, event, width, height, settings, true);
  else if (template === 'nauha') drawBandTemplate(ctx, event, width, height, settings);
  else if (template === 'keskitetty') drawCenteredTemplate(ctx, event, width, height, settings);
  else if (template === 'minimi') drawMinimalTemplate(ctx, event, width, height, settings);
  else drawEdgeTemplate(ctx, event, width, height, settings, false);
  ctx.restore();
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
