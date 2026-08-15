import {
  COPY_LABELS,
  EVENT_TYPES,
  STEPS,
  isUnlocked,
  progress,
  stepsForEvent,
} from './shared/workflow.js';
import {
  artistList,
  daysUntil,
  nextWednesday,
  priceLabel,
  shortDate,
  timeRange,
  toISODate,
} from './shared/format.js';
import { googleCalendarUrl } from './shared/calendar.js';
import {
  EXPORT_SET,
  PRESETS,
  PRESET_BY_ID,
  TEXT_POSITIONS,
  attachCropControls,
  defaultSettings,
  exportPreset,
  loadImage,
  normalizeSettings,
  renderPoster,
} from './poster.js';

const LANES = {
  1: 'Vaihe 1 · Tapahtuma ja lähetyksen intro',
  2: 'Vaihe 2 · Kuva ja livestream',
  3: 'Vaihe 3 · Some-tekstit',
  4: 'Vaihe 4 · Ensijulkaisu',
  5: 'Vaihe 5 · Jakelu Facebook-tapahtumasta',
  6: 'Vaihe 6 · Tapahtuman tiedot kuvaan',
};

const state = {
  events: [],
  selectedId: null,
  config: { aiConfigured: false },
  posterOptions: { aspect: 'neliö', accent: '#f2a541', extra: '', showPrice: true },
};

/* ------------------------------ apurit ------------------------------ */

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

let toastTimer;
function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = isError ? 'toast error' : 'toast';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || `Virhe ${response.status}`);
  return data;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Teksti kopioitu leikepöydälle.');
  } catch {
    // clipboard-API vaatii turvallisen kontekstin; textarea-kikka toimii aina.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast('Teksti kopioitu leikepöydälle.');
  }
}

function selected() {
  return state.events.find((e) => e.id === state.selectedId) || null;
}

function eventTitle(event) {
  return event.title || artistList(event.artists) || event.type || 'Nimetön tapahtuma';
}

async function refresh(keepSelection = true) {
  state.events = await api('/events');
  if (!keepSelection || !state.events.some((e) => e.id === state.selectedId)) {
    const upcoming = state.events.find((e) => (daysUntil(e.date) ?? -1) >= 0);
    state.selectedId = (upcoming || state.events[0])?.id || null;
  }
  render();
}

/* ------------------------------ sivupalkki ------------------------------ */

function renderSidebar() {
  const list = document.getElementById('event-list');
  list.replaceChildren();

  if (!state.events.length) {
    list.append(h('p', { class: 'empty' }, 'Ei vielä tapahtumia. Aloita napista “+ Uusi tapahtuma”.'));
    return;
  }

  for (const event of state.events) {
    const days = daysUntil(event.date);
    const { done, total } = progress(event);
    list.append(
      h('button', {
        class: `event-item${event.id === state.selectedId ? ' active' : ''}${days !== null && days < 0 ? ' past' : ''}`,
        onclick: () => { state.selectedId = event.id; render(); },
      },
        h('span', { class: 'title' }, eventTitle(event)),
        h('span', { class: 'meta' },
          h('span', {}, shortDate(event.date) || 'Ei päivää'),
          h('span', {}, `${done}/${total}`)),
      ),
    );
  }
}

function renderWednesday() {
  const panel = document.getElementById('wednesday-panel');
  const wednesday = nextWednesday();
  const pending = state.events.filter((event) => {
    const days = daysUntil(event.date);
    return days !== null && days >= 0 && days <= 28 && event.steps.facebook?.status !== 'valmis';
  });

  panel.replaceChildren(
    h('h2', {}, 'Puskaradio-keskiviikko'),
    h('p', { class: 'empty' }, `Seuraava julkaisupäivä: ${shortDate(toISODate(wednesday))}`),
    pending.length
      ? h('div', {},
        ...pending.map((event) => h('div', { class: 'week-item' },
          h('div', {}, eventTitle(event)),
          h('div', { class: 'when' }, `${shortDate(event.date)} · Facebook-tapahtuma tekemättä`),
        )))
      : h('p', { class: 'empty' }, 'Kaikki lähipäivien tapahtumat on jo julkaistu Facebookissa.'),
  );
}

/* ------------------------------ tapahtumalomake ------------------------------ */

function openModal(title, body) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').replaceChildren(body);
  document.getElementById('modal').hidden = false;
}

function closeModal() {
  document.getElementById('modal').hidden = true;
}

function eventForm(event) {
  const isNew = !event;
  const data = event || { date: toISODate(new Date()), type: 'Keikka', artists: [] };

  const field = (name, label, attrs = {}) => h('div', { class: `field${attrs.full ? ' full' : ''}` },
    h('label', { for: `f-${name}` }, label),
    attrs.type === 'textarea'
      ? h('textarea', { id: `f-${name}`, name, rows: 4, placeholder: attrs.placeholder || '' }, data[name] || '')
      : h('input', {
        id: `f-${name}`, name, type: attrs.type || 'text',
        value: attrs.value !== undefined ? attrs.value : (data[name] || ''),
        placeholder: attrs.placeholder || '',
      }),
  );

  const form = h('form', { class: 'form-grid' },
    field('title', 'Otsikko', { full: true, placeholder: 'esim. Perjantain livekeikka' }),
    h('div', { class: 'field' },
      h('label', { for: 'f-type' }, 'Tapahtumatyyppi'),
      h('select', { id: 'f-type', name: 'type' },
        ...EVENT_TYPES.map((type) => h('option', { value: type, selected: data.type === type }, type))),
    ),
    field('date', 'Päivämäärä', { type: 'date' }),
    field('startTime', 'Alkaa', { type: 'time' }),
    field('endTime', 'Päättyy', { type: 'time' }),
    field('doors', 'Ovet auki', { type: 'time' }),
    field('ageLimit', 'Ikäraja', { placeholder: 'esim. K-18' }),
    field('artists', 'Esiintyjät (pilkulla eroteltuna)', { full: true, value: (data.artists || []).join(', ') }),
    field('venue', 'Paikka', { placeholder: 'esim. Ravintola X' }),
    field('address', 'Osoite', { placeholder: 'Katu 1, Salo' }),
    field('price', 'Liput', { placeholder: 'esim. 15 tai Vapaa pääsy' }),
    field('ticketUrl', 'Lippulinkki', { placeholder: 'https://…' }),
    h('div', { class: 'field full' },
      h('label', {}, h('input', {
        type: 'checkbox', id: 'f-livestream', name: 'livestream', checked: Boolean(data.livestream),
        style: 'width:auto;margin-right:8px;vertical-align:middle',
      }), 'Tapahtumasta tehdään YouTube-livelähetys'),
    ),
    field('description', 'Omat muistiinpanot tekstien pohjaksi', {
      full: true, type: 'textarea',
      placeholder: 'Mitä illassa tapahtuu, kenelle se on, mikä on kulma? Nämä ohjaavat tekstien sävyä.',
    }),
  );

  const submit = async (deleteInstead = false) => {
    if (deleteInstead) {
      if (!confirm('Poistetaanko tapahtuma ja sen työnkulku?')) return;
      await api(`/events/${event.id}`, { method: 'DELETE' });
      closeModal();
      state.selectedId = null;
      await refresh(false);
      toast('Tapahtuma poistettu.');
      return;
    }
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.artists = String(payload.artists || '').split(',').map((s) => s.trim()).filter(Boolean);
    payload.livestream = document.getElementById('f-livestream').checked;
    try {
      const saved = isNew
        ? await api('/events', { method: 'POST', body: payload })
        : await api(`/events/${event.id}`, { method: 'PUT', body: payload });
      state.selectedId = saved.id;
      closeModal();
      await refresh();
      toast(isNew ? 'Tapahtuma luotu.' : 'Tiedot tallennettu.');
    } catch (err) {
      toast(err.message, true);
    }
  };

  return h('div', {},
    form,
    h('div', { class: 'form-actions' },
      isNew
        ? h('span', {})
        : h('button', { class: 'btn btn-ghost btn-danger', onclick: () => submit(true) }, 'Poista tapahtuma'),
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn btn-ghost', onclick: closeModal }, 'Peruuta'),
        h('button', { class: 'btn btn-primary', onclick: () => submit(false) }, isNew ? 'Luo tapahtuma' : 'Tallenna'),
      ),
    ),
  );
}

/* ------------------------------ vaihekortit ------------------------------ */

const STATUS_LABEL = { odottaa: 'Odottaa', valmis: 'Valmis', ohitettu: 'Ohitettu' };

async function setStatus(event, stepId, status) {
  try {
    await api(`/events/${event.id}/steps/${stepId}`, { method: 'POST', body: { status } });
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
}

function statusChip(status) {
  const cls = status === 'valmis' ? 'pill pill-ok' : status === 'ohitettu' ? 'pill pill-skip' : 'pill pill-muted';
  return h('span', { class: cls }, STATUS_LABEL[status] || status);
}

function statusButtons(event, step, status) {
  return status === 'valmis'
    ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => setStatus(event, step.id, 'odottaa') }, 'Peru')
    : h('div', { class: 'step-actions' },
      h('button', { class: 'btn btn-sm', onclick: () => setStatus(event, step.id, 'valmis') }, 'Merkitse tehdyksi'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => setStatus(event, step.id, 'ohitettu') }, 'Ohita'),
    );
}

function detailsSummary(event) {
  const rows = [
    shortDate(event.date),
    timeRange(event) && `klo ${timeRange(event)}`,
    event.venue,
    artistList(event.artists),
    priceLabel(event),
  ].filter(Boolean);
  return h('div', { class: 'step-note' }, rows.join(' · ') || 'Tiedot puuttuvat.');
}

/* --------------------------- kuvan rajaustyökalu --------------------------- */

const posterDrafts = new Map();
const posterSaveTimers = new Map();
const imageCache = new Map();

function posterSettings(event) {
  if (!posterDrafts.has(event.id)) posterDrafts.set(event.id, normalizeSettings(event.poster));
  return posterDrafts.get(event.id);
}

/** Tallennus viiveellä, jotta raahaus ei tuota pyyntöä joka liikkeestä. */
function savePosterSettings(event) {
  clearTimeout(posterSaveTimers.get(event.id));
  posterSaveTimers.set(event.id, setTimeout(async () => {
    const settings = posterSettings(event);
    try {
      await api(`/events/${event.id}`, { method: 'PUT', body: { poster: settings } });
      const local = state.events.find((e) => e.id === event.id);
      if (local) local.poster = { ...settings };
    } catch (err) {
      toast(err.message, true);
    }
  }, 600));
}

function eventImage(event) {
  if (!event.image) return Promise.resolve(null);
  const src = `/uploads/${event.image.file}?t=${encodeURIComponent(event.image.uploadedAt || '')}`;
  if (!imageCache.has(src)) imageCache.set(src, loadImage(src));
  return imageCache.get(src);
}

function fileBase(event) {
  return (eventTitle(event) || 'tapahtuma')
    .toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tapahtuma';
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

/**
 * Rajaustyökalu. Sama rajaus (polttopiste + zoom) pätee kaikkiin kuvasuhteisiin,
 * joten jokainen kanava saa oman kokonsa ilman uutta rajausta.
 * @param {object} options withText: näytetäänkö tekstiasettelun säätimet
 */
function cropEditor(event, { withText = false } = {}) {
  const settings = posterSettings(event);
  let image = null;

  const canvas = h('canvas', { class: 'poster-canvas' });
  const sizeLabel = h('div', { class: 'step-note' });
  const zoomInput = h('input', {
    type: 'range', min: '1', max: '4', step: '0.02', value: String(settings.zoom),
    oninput: (e) => update({ zoom: Number(e.target.value) }, false),
    onchange: () => savePosterSettings(event),
  });

  function draw() {
    renderPoster(canvas, image, event, settings);
    const preset = PRESET_BY_ID[settings.presetId];
    sizeLabel.textContent = `${preset.w} × ${preset.h} px · ${preset.ratio} · ${preset.note}`;
    zoomInput.value = String(settings.zoom);
  }

  function update(patch, persist = true) {
    Object.assign(settings, patch);
    draw();
    if (persist) savePosterSettings(event);
  }

  const presetSelect = h('select', { onchange: (e) => update({ presetId: e.target.value }) });
  for (const channel of [...new Set(PRESETS.map((p) => p.channel))]) {
    const group = h('optgroup', { label: channel });
    for (const preset of PRESETS.filter((p) => p.channel === channel)) {
      group.append(h('option', { value: preset.id, selected: settings.presetId === preset.id }, preset.label));
    }
    presetSelect.append(group);
  }

  const fitSelect = h('select', { onchange: (e) => update({ fit: e.target.value }) },
    h('option', { value: 'tayta', selected: settings.fit === 'tayta' }, 'Täytä (rajaa reunoista)'),
    h('option', { value: 'sovita', selected: settings.fit === 'sovita' }, 'Sovita (koko kuva näkyviin)'));

  const textSelect = h('select', { onchange: (e) => update({ text: e.target.value }) },
    ...Object.entries(TEXT_POSITIONS).map(([value, label]) =>
      h('option', { value, selected: settings.text === value }, label)));

  eventImage(event).then((img) => { image = img; draw(); }).catch((err) => toast(err.message, true));
  attachCropControls(canvas, () => ({ image, settings }), update);
  draw();

  return {
    settings,
    getImage: () => image,
    node: h('div', { class: 'editor' },
      canvas,
      sizeLabel,
      h('div', { class: 'editor-row' },
        h('label', {}, 'Koko', presetSelect),
        h('label', {}, 'Rajaus', fitSelect),
        withText ? h('label', {}, 'Teksti', textSelect) : null),
      h('div', { class: 'editor-row' },
        h('label', {}, `Lähennys`, zoomInput),
        withText ? h('label', {}, 'Korostusväri',
          h('input', {
            type: 'color', value: settings.accent,
            oninput: (e) => update({ accent: e.target.value }, false),
            onchange: () => savePosterSettings(event),
          })) : null),
      withText
        ? h('input', {
          placeholder: 'Lisäteksti kuvaan (esim. “Liput ovelta”)', value: settings.extra,
          oninput: (e) => update({ extra: e.target.value }, false),
          onchange: () => savePosterSettings(event),
        })
        : null,
      h('p', { class: 'step-note' },
        'Raahaa kuvaa hiirellä ja säädä lähennystä. Sama rajaus siirtyy kaikkiin kokoihin.'),
      h('div', { class: 'step-actions' },
        h('button', {
          class: 'btn btn-sm btn-ghost',
          onclick: () => update({ zoom: 1, fx: 0.5, fy: 0.5 }),
        }, 'Keskitä uudelleen')),
    ),
  };
}

function imageStep(event, step) {
  const input = h('input', {
    type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) return toast('Kuva on yli 10 Mt. Pienennä sitä ensin.', true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await api(`/events/${event.id}/image`, { method: 'POST', body: { dataUrl: reader.result } });
          await api(`/events/${event.id}/steps/${step.id}`, { method: 'POST', body: { status: 'valmis' } });
          imageCache.clear();
          await refresh();
          toast('Kuva tallennettu. Tarkista rajaus jokaiselle kanavalle.');
        } catch (err) {
          toast(err.message, true);
        }
      };
      reader.readAsDataURL(file);
    },
  });

  if (!event.image) {
    return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      h('p', { class: 'step-note' },
        'Lataa tapahtuman kuva. Rajaustyökalu aukeaa heti latauksen jälkeen, '
        + 'ja jokainen kanava saa siitä oman kokonsa.'),
      input);
  }

  const editor = cropEditor(event, { withText: false });
  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    editor.node,
    h('div', { class: 'step-actions' },
      h('button', {
        class: 'btn btn-sm btn-primary',
        onclick: () => {
          const preset = PRESET_BY_ID[editor.settings.presetId];
          downloadDataUrl(
            exportPreset(editor.getImage(), event, editor.settings, preset.id),
            `${fileBase(event)}-${preset.id}.png`,
          );
        },
      }, 'Lataa tämä koko'),
      h('button', {
        class: 'btn btn-sm',
        onclick: async () => {
          const image = editor.getImage();
          for (const presetId of EXPORT_SET) {
            downloadDataUrl(exportPreset(image, event, editor.settings, presetId), `${fileBase(event)}-${presetId}.png`);
            await new Promise((resolve) => { setTimeout(resolve, 350); });
          }
          toast(`${EXPORT_SET.length} kuvakokoa ladattu.`);
        },
      }, 'Lataa kaikki koot')),
    h('label', { class: 'step-note' }, 'Vaihda kuva:'),
    input);
}

function generateStep(event, step) {
  const instruction = h('input', { placeholder: 'Lisäohje (valinnainen): esim. “korosta ilmaista sisäänpääsyä”' });

  const run = async (mode) => {
    toast(mode === 'ai' ? 'Kirjoitetaan tekstejä…' : 'Luodaan tekstit mallipohjista…');
    try {
      const result = await api(`/events/${event.id}/generate`, {
        method: 'POST',
        body: { mode, instruction: instruction.value },
      });
      await api(`/events/${event.id}/steps/${step.id}`, { method: 'POST', body: { status: 'valmis' } });
      await refresh();
      if (result.warning) toast(`Mallipohjat käytössä: ${result.warning}`, true);
      else toast(result.source === 'ai' ? 'Tekstit kirjoitettu AI:lla.' : 'Tekstit luotu mallipohjista.');
    } catch (err) {
      toast(err.message, true);
    }
  };

  const source = event.copySource?.startsWith('ai')
    ? `AI (${event.copySource.slice(3)})`
    : event.copySource === 'malli' ? 'Mallipohjat'
      : event.copySource === 'muokattu' ? 'Käsin muokattu' : null;

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    instruction,
    h('div', { class: 'step-actions' },
      h('button', {
        class: 'btn btn-sm btn-primary',
        title: state.config.aiConfigured ? '' : 'ANTHROPIC_API_KEY puuttuu — käytetään mallipohjia',
        onclick: () => run('ai'),
      }, 'Luo tekstit AI:lla'),
      h('button', { class: 'btn btn-sm', onclick: () => run('malli') }, 'Luo mallipohjista'),
    ),
    source ? h('div', { class: 'step-note' }, `Lähde: ${source}`) : null,
  );
}

function channelStep(event, step) {
  const text = event.copy?.[step.copyKey] || '';
  const area = h('textarea', {
    placeholder: event.copy ? '' : 'Luo tekstit ensin vaiheessa “Some-teksti”.',
    onchange: async (e) => {
      try {
        await api(`/events/${event.id}/copy`, { method: 'PUT', body: { [step.copyKey]: e.target.value } });
        state.events = state.events.map((ev) => (ev.id === event.id
          ? { ...ev, copy: { ...(ev.copy || {}), [step.copyKey]: e.target.value } }
          : ev));
        toast('Muokkaus tallennettu.');
      } catch (err) {
        toast(err.message, true);
      }
    },
  }, text);

  const preset = step.imagePreset ? PRESET_BY_ID[step.imagePreset] : null;

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    h('label', { class: 'step-note' }, COPY_LABELS[step.copyKey] || 'Teksti'),
    area,
    h('div', { class: 'step-actions' },
      h('button', {
        class: 'btn btn-sm btn-primary',
        disabled: !text,
        onclick: () => copyToClipboard(area.value),
      }, 'Kopioi teksti'),
      step.url ? h('a', { class: 'btn btn-sm', href: step.url, target: '_blank', rel: 'noopener' }, step.urlLabel || 'Avaa kanava') : null,
      event.image && preset
        ? h('button', {
          class: 'btn btn-sm',
          title: `${preset.w} × ${preset.h} px — ${preset.note}`,
          onclick: async () => {
            try {
              const image = await eventImage(event);
              downloadDataUrl(
                exportPreset(image, event, posterSettings(event), preset.id),
                `${fileBase(event)}-${step.id}.png`,
              );
              toast(`Kuva ladattu koossa ${preset.w} × ${preset.h}.`);
            } catch (err) {
              toast(err.message, true);
            }
          },
        }, `Lataa kuva ${preset.ratio}`)
        : null,
      ...(step.extraLinks || []).map((link) =>
        h('a', { class: 'btn btn-sm btn-ghost', href: link.url, target: '_blank', rel: 'noopener' }, link.label)),
    ),
  );
}

function calendarStep(event) {
  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    h('p', { class: 'step-note' }, 'Google-kalenteri avautuu valmiiksi täytetyllä lomakkeella. .ics käy myös muihin kalentereihin.'),
    h('div', { class: 'step-actions' },
      h('a', {
        class: 'btn btn-sm btn-primary', href: googleCalendarUrl(event), target: '_blank', rel: 'noopener',
      }, 'Lisää Google-kalenteriin'),
      h('a', { class: 'btn btn-sm', href: `/api/events/${event.id}/calendar.ics` }, 'Lataa .ics'),
    ),
  );
}

function posterStep(event) {
  const editor = cropEditor(event, { withText: true });

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    editor.node,
    h('div', { class: 'step-actions' },
      h('button', {
        class: 'btn btn-sm btn-primary',
        onclick: () => {
          const preset = PRESET_BY_ID[editor.settings.presetId];
          downloadDataUrl(
            exportPreset(editor.getImage(), event, editor.settings, preset.id),
            `${fileBase(event)}-juliste-${preset.id}.png`,
          );
        },
      }, 'Lataa juliste'),
      h('button', {
        class: 'btn btn-sm',
        onclick: async () => {
          const image = editor.getImage();
          for (const presetId of EXPORT_SET) {
            downloadDataUrl(
              exportPreset(image, event, editor.settings, presetId),
              `${fileBase(event)}-juliste-${presetId}.png`,
            );
            await new Promise((resolve) => { setTimeout(resolve, 350); });
          }
          toast(`${EXPORT_SET.length} julistekokoa ladattu.`);
        },
      }, 'Lataa kaikki koot')),
    event.image ? null : h('p', { class: 'step-note' }, 'Ilman kuvaa juliste piirtyy tummalle taustalle.'));
}

function stepCard(event, step) {
  const status = event.steps?.[step.id]?.status || 'odottaa';
  const unlocked = isUnlocked(step, event.steps);

  let body = null;
  if (step.action === 'form') body = detailsSummary(event);
  else if (step.action === 'image') body = imageStep(event, step);
  else if (step.action === 'generate') body = generateStep(event, step);
  else if (step.action === 'channel') body = channelStep(event, step);
  else if (step.action === 'calendar') body = calendarStep(event);
  else if (step.action === 'poster') body = posterStep(event);

  const timingNote = step.timing === 'keskiviikko'
    ? 'Julkaistaan keskiviikkoisin.'
    : step.timing === 'tapahtumapaivana' ? 'Julkaistaan tapahtumapäivänä.' : null;

  return h('article', { class: `step${unlocked ? '' : ' locked'}${status === 'valmis' ? ' done' : ''}` },
    h('div', { class: 'step-head' },
      h('div', {},
        h('h3', {}, step.label),
        h('div', { class: 'detail' }, step.detail)),
      statusChip(status)),
    timingNote ? h('div', { class: 'step-note' }, timingNote) : null,
    unlocked
      ? body
      : h('div', { class: 'deps-note' },
        `Avautuu kun valmiina: ${step.deps.map((d) => STEPS.find((s) => s.id === d).label).join(', ')}`),
    step.action === 'form'
      ? h('div', { class: 'step-actions' },
        h('button', {
          class: 'btn btn-sm',
          onclick: () => openModal('Muokkaa tapahtumaa', eventForm(event)),
        }, 'Muokkaa tietoja'))
      : unlocked ? statusButtons(event, step, status) : null,
  );
}

/* ------------------------------ päänäkymä ------------------------------ */

function renderMain() {
  const content = document.getElementById('content');
  const event = selected();

  if (!event) {
    content.replaceChildren(h('div', { class: 'panel' },
      h('h2', {}, 'Aloitus'),
      h('p', { class: 'empty' },
        'Luo ensimmäinen tapahtuma, niin AddHelper avaa sille koko työnkulun: kuva, tekstit, '
        + 'Facebook-tapahtuma, jakelu Instagramiin, Clubyyn ja Webadoriin, kalenterivienti ja juliste.'),
    ));
    return;
  }

  const { done, total } = progress(event);
  const days = daysUntil(event.date);
  const countdown = days === null ? '' : days === 0 ? 'Tänään!' : days > 0 ? `${days} pv jäljellä` : `${-days} pv sitten`;

  const head = h('div', { class: 'event-head' },
    h('div', { class: 'head-row' },
      h('div', {},
        h('h2', {}, eventTitle(event)),
        h('div', { class: 'sub' },
          h('span', {}, shortDate(event.date)),
          timeRange(event) ? h('span', {}, `klo ${timeRange(event)}`) : null,
          event.venue ? h('span', {}, event.venue) : null,
          h('span', { class: 'pill pill-accent' }, event.type),
          countdown ? h('span', { class: 'pill pill-muted' }, countdown) : null)),
      h('div', { class: 'step-actions' },
        h('button', {
          class: 'btn btn-sm', onclick: () => openModal('Muokkaa tapahtumaa', eventForm(event)),
        }, 'Muokkaa'),
        h('a', { class: 'btn btn-sm btn-ghost', href: `/api/events/${event.id}/calendar.ics` }, '.ics'))),
    h('div', { class: 'progress' },
      h('div', { class: 'progress-bar' }, h('div', { style: `width:${Math.round((done / total) * 100)}%` })),
      h('div', { class: 'progress-label' }, `${done}/${total} vaihetta valmiina`)),
  );

  const visible = stepsForEvent(event);
  const lanes = [...new Set(visible.map((s) => s.lane))].sort((a, b) => a - b).map((lane) =>
    h('section', { class: 'lane' },
      h('div', { class: 'lane-title' }, LANES[lane] || `Vaihe ${lane}`),
      h('div', { class: 'lane-cards' },
        ...visible.filter((s) => s.lane === lane).map((step) => stepCard(event, step)))));

  content.replaceChildren(head, ...lanes);
}

function render() {
  renderSidebar();
  renderWednesday();
  renderMain();
}

/* ------------------------------ käynnistys ------------------------------ */

document.getElementById('new-event').addEventListener('click', () => {
  openModal('Uusi tapahtuma', eventForm(null));
});
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

(async function start() {
  try {
    state.config = await api('/config');
    const status = document.getElementById('ai-status');
    if (state.config.keyWarning) {
      status.textContent = 'AI: avain virheellinen';
      status.className = 'pill pill-accent';
      status.title = state.config.keyWarning;
      toast(state.config.keyWarning, true);
    } else {
      status.textContent = state.config.aiConfigured ? `AI: ${state.config.model}` : 'AI: pois — mallipohjat';
      status.className = state.config.aiConfigured ? 'pill pill-ok' : 'pill pill-muted';
    }
    await refresh(false);
  } catch (err) {
    toast(err.message, true);
  }
}());
