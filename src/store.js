/** Yksinkertainen JSON-tiedostoon tallentava varasto. Ei tietokantaa, ei asennusta. */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { STEP_IDS } from '../public/shared/workflow.js';

const DATA_DIR = process.env.ADDHELPER_DATA || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'events.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

let cache = null;
let writeQueue = Promise.resolve();

async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function load() {
  if (cache) return cache;
  await ensureDirs();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    cache = { events: [] };
  }
  if (!Array.isArray(cache.events)) cache.events = [];
  return cache;
}

/** Kirjoitukset sarjassa, väliaikaistiedoston kautta — ei rikkinäistä JSONia keskeytyksestä. */
function persist() {
  writeQueue = writeQueue.then(async () => {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
    await fs.rename(tmp, DB_FILE);
  });
  return writeQueue;
}

function emptySteps() {
  return Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'odottaa', updatedAt: null }]));
}

function normalize(event) {
  const steps = emptySteps();
  for (const [id, value] of Object.entries(event.steps || {})) {
    if (steps[id]) steps[id] = { ...steps[id], ...value };
  }
  return {
    id: event.id || randomUUID(),
    title: event.title || '',
    date: event.date || '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    type: event.type || 'Keikka',
    artists: Array.isArray(event.artists) ? event.artists.filter(Boolean) : [],
    venue: event.venue || '',
    address: event.address || '',
    price: event.price || '',
    ticketUrl: event.ticketUrl || '',
    doors: event.doors || '',
    ageLimit: event.ageLimit || '',
    description: event.description || '',
    livestream: Boolean(event.livestream),
    image: event.image || null,
    copy: event.copy || null,
    copySource: event.copySource || null,
    copyGeneratedAt: event.copyGeneratedAt || null,
    steps,
    createdAt: event.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listEvents() {
  const db = await load();
  return [...db.events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export async function getEvent(id) {
  const db = await load();
  return db.events.find((e) => e.id === id) || null;
}

export async function createEvent(data) {
  const db = await load();
  const event = normalize({ ...data, id: randomUUID(), createdAt: new Date().toISOString() });
  // Tapahtuman perustiedot ovat valmiit heti kun tapahtuma on luotu.
  event.steps.tapahtuma = { status: 'valmis', updatedAt: new Date().toISOString() };
  db.events.push(event);
  await persist();
  return event;
}

export async function updateEvent(id, patch) {
  const db = await load();
  const index = db.events.findIndex((e) => e.id === id);
  if (index === -1) return null;
  const merged = normalize({ ...db.events[index], ...patch, id });
  db.events[index] = merged;
  await persist();
  return merged;
}

export async function deleteEvent(id) {
  const db = await load();
  const index = db.events.findIndex((e) => e.id === id);
  if (index === -1) return false;
  const [removed] = db.events.splice(index, 1);
  await persist();
  if (removed.image?.file) {
    await fs.rm(path.join(UPLOAD_DIR, removed.image.file), { force: true });
  }
  return true;
}

export async function setStep(id, stepId, status, note) {
  const event = await getEvent(id);
  if (!event) return null;
  if (!STEP_IDS.includes(stepId)) return null;
  const steps = { ...event.steps, [stepId]: { status, note: note || '', updatedAt: new Date().toISOString() } };
  return updateEvent(id, { steps });
}

export async function saveImage(id, buffer, extension) {
  const event = await getEvent(id);
  if (!event) return null;
  await ensureDirs();
  const file = `${id}.${extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, file), buffer);
  return updateEvent(id, { image: { file, uploadedAt: new Date().toISOString() } });
}
