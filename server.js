#!/usr/bin/env node
/**
 * AddHelper — tapahtumamarkkinoinnin työnkulkualusta.
 * Pyörii pelkällä Nodella: ei tietokantaa, ei käännösvaihetta.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aiConfigured, generateCopy, keyFormatWarning } from './src/ai.js';
import { buildTemplateCopy } from './src/copy.js';
import {
  UPLOAD_DIR,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  saveImage,
  setStep,
  updateEvent,
} from './src/store.js';
import { toICS } from './public/shared/calendar.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 12 * 1024 * 1024; // 12 MB — riittää tapahtumakuvalle

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

const IMAGE_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Pyyntö on liian suuri.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Virheellinen JSON.'), { status: 400 });
  }
}

async function serveStatic(res, baseDir, relativePath, fallback) {
  const safe = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(baseDir, safe);
  if (!target.startsWith(baseDir)) return send(res, 403, 'Kielletty');
  try {
    const data = await fs.readFile(target);
    return send(res, 200, data, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    });
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'EISDIR') throw err;
    if (fallback) return serveStatic(res, baseDir, fallback);
    return send(res, 404, 'Ei löytynyt');
  }
}

function slug(text) {
  return (text || 'tapahtuma')
    .toLowerCase()
    .replace(/[äå]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tapahtuma';
}

async function handleApi(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id, sub, subId] = segments;

  if (resource === 'config' && req.method === 'GET') {
    return json(res, 200, {
      aiConfigured: aiConfigured(),
      model: process.env.ADDHELPER_MODEL || 'claude-opus-5',
      keyWarning: keyFormatWarning(),
    });
  }

  if (resource === 'calendar.ics' && req.method === 'GET') {
    const events = await listEvents();
    return send(res, 200, toICS(events), {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="addhelper-tapahtumat.ics"',
    });
  }

  if (resource !== 'events') return json(res, 404, { error: 'Tuntematon rajapinta.' });

  // /api/events
  if (!id) {
    if (req.method === 'GET') return json(res, 200, await listEvents());
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body.date) return json(res, 400, { error: 'Päivämäärä puuttuu.' });
      if (!body.title && !(body.artists || []).length) {
        return json(res, 400, { error: 'Anna tapahtumalle otsikko tai vähintään yksi esiintyjä.' });
      }
      return json(res, 201, await createEvent(body));
    }
    return json(res, 405, { error: 'Metodia ei tueta.' });
  }

  const event = await getEvent(id);
  if (!event) return json(res, 404, { error: 'Tapahtumaa ei löydy.' });

  // /api/events/:id
  if (!sub) {
    if (req.method === 'GET') return json(res, 200, event);
    if (req.method === 'PUT') return json(res, 200, await updateEvent(id, await readJson(req)));
    if (req.method === 'DELETE') {
      await deleteEvent(id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Metodia ei tueta.' });
  }

  // /api/events/:id/generate
  if (sub === 'generate' && req.method === 'POST') {
    const { mode = 'ai', instruction = '' } = await readJson(req);
    if (mode === 'malli') {
      const updated = await updateEvent(id, {
        copy: buildTemplateCopy(event),
        copySource: 'malli',
        copyGeneratedAt: new Date().toISOString(),
      });
      return json(res, 200, { event: updated, source: 'malli' });
    }
    try {
      const { copy, model } = await generateCopy(event, { instruction });
      const updated = await updateEvent(id, {
        copy,
        copySource: `ai:${model}`,
        copyGeneratedAt: new Date().toISOString(),
      });
      return json(res, 200, { event: updated, source: 'ai', model });
    } catch (err) {
      // AI ei ole pakollinen: palautetaan mallipohja ja kerrotaan syy.
      const updated = await updateEvent(id, {
        copy: buildTemplateCopy(event),
        copySource: 'malli',
        copyGeneratedAt: new Date().toISOString(),
      });
      return json(res, 200, { event: updated, source: 'malli', warning: err.message });
    }
  }

  // /api/events/:id/copy
  if (sub === 'copy' && req.method === 'PUT') {
    const body = await readJson(req);
    const updated = await updateEvent(id, { copy: { ...(event.copy || {}), ...body }, copySource: 'muokattu' });
    return json(res, 200, updated);
  }

  // /api/events/:id/steps/:stepId
  if (sub === 'steps' && subId && req.method === 'POST') {
    const { status = 'valmis', note } = await readJson(req);
    if (!['odottaa', 'valmis', 'ohitettu'].includes(status)) {
      return json(res, 400, { error: 'Tuntematon tila.' });
    }
    const updated = await setStep(id, subId, status, note);
    if (!updated) return json(res, 404, { error: 'Vaihetta ei löydy.' });
    return json(res, 200, updated);
  }

  // /api/events/:id/image
  if (sub === 'image' && req.method === 'POST') {
    const { dataUrl } = await readJson(req);
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
    if (!match) return json(res, 400, { error: 'Kuvaa ei voitu lukea.' });
    const extension = IMAGE_EXTENSIONS[match[1]];
    if (!extension) return json(res, 400, { error: 'Tuettu muoto: PNG, JPG, WebP tai GIF.' });
    const updated = await saveImage(id, Buffer.from(match[2], 'base64'), extension);
    return json(res, 200, updated);
  }

  // /api/events/:id/calendar.ics
  if (sub === 'calendar.ics' && req.method === 'GET') {
    return send(res, 200, toICS([event]), {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug(event.title || event.type)}.ics"`,
    });
  }

  return json(res, 404, { error: 'Tuntematon rajapinta.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/uploads/')) {
      return await serveStatic(res, UPLOAD_DIR, url.pathname.slice('/uploads/'.length));
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    return await serveStatic(res, PUBLIC_DIR, relative, 'index.html');
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return json(res, status, { error: err.message || 'Palvelinvirhe.' });
  }
});

server.listen(PORT, () => {
  console.log(`AddHelper käynnissä: http://localhost:${PORT}`);
  console.log(aiConfigured()
    ? '  AI-tekstigenerointi: käytössä'
    : '  AI-tekstigenerointi: pois (aseta ANTHROPIC_API_KEY) — mallipohjat käytössä');
  const warning = keyFormatWarning();
  if (warning) console.warn(`  ⚠️  ${warning}`);
});
