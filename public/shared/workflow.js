/**
 * Työnkulun määrittely — sama tiedosto käytössä sekä palvelimella että selaimessa.
 * Vaiheet ja riippuvuudet vastaavat pohjapiirroksen vuokaaviota.
 */

export const STEPS = [
  {
    id: 'tapahtuma',
    label: 'Tapahtuma',
    detail: 'Päivämäärä, tapahtumatyyppi',
    deps: [],
    lane: 1,
    action: 'form',
  },
  {
    id: 'kuva',
    label: 'Kuva / Video',
    detail: 'AI, sähköposti, valmiit',
    deps: ['tapahtuma'],
    lane: 2,
    action: 'image',
  },
  {
    id: 'some-teksti',
    label: 'Some-teksti',
    detail: 'AI, artistit, valmiit',
    deps: ['kuva'],
    lane: 3,
    action: 'generate',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    detail: 'Video / mainos tapahtumapäivänä',
    deps: ['some-teksti'],
    lane: 4,
    action: 'channel',
    copyKey: 'tiktok',
    imagePreset: 'story',
    url: 'https://www.tiktok.com/tiktokstudio/upload',
    urlLabel: 'Avaa TikTok Studio',
    timing: 'tapahtumapaivana',
  },
  {
    id: 'facebook',
    label: 'Facebook-tapahtuma',
    detail: 'Salon puskaradio, joka viikon keskiviikko',
    deps: ['some-teksti'],
    lane: 4,
    action: 'channel',
    copyKey: 'facebook',
    imagePreset: 'fb-event',
    url: 'https://www.facebook.com/events/create/',
    urlLabel: 'Luo Facebook-tapahtuma',
    timing: 'keskiviikko',
    extraLinks: [
      { label: 'Salon puskaradio -ryhmä', url: 'https://www.facebook.com/search/groups/?q=salon%20puskaradio' },
    ],
  },
  {
    id: 'gcal',
    label: 'Google-kalenteri',
    detail: 'Tapahtumien vienti kalenteriin',
    deps: ['facebook'],
    lane: 5,
    action: 'calendar',
  },
  {
    id: 'cluby',
    label: 'Cluby',
    detail: 'Tekstit Facebook-tapahtumasta',
    deps: ['facebook'],
    lane: 5,
    action: 'channel',
    copyKey: 'cluby',
    imagePreset: 'ig-square',
    url: 'https://cluby.com/',
    urlLabel: 'Avaa Cluby',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    detail: 'Tekstit Facebook-tapahtumasta',
    deps: ['facebook'],
    lane: 5,
    action: 'channel',
    copyKey: 'instagram',
    imagePreset: 'ig-portrait',
    url: 'https://www.instagram.com/',
    urlLabel: 'Avaa Instagram',
  },
  {
    id: 'webador',
    label: 'Webador',
    detail: 'Tekstit Facebookista',
    deps: ['facebook'],
    lane: 5,
    action: 'channel',
    copyKey: 'webador',
    imagePreset: 'fb-post',
    url: 'https://www.webador.fi/',
    urlLabel: 'Avaa Webador',
  },
  {
    id: 'feelment',
    label: 'Feelment',
    detail: 'Kuvaan tapahtuman tiedot',
    deps: ['facebook'],
    lane: 6,
    action: 'poster',
  },
  {
    id: 'intro',
    label: 'Video-introt',
    detail: 'Tekstit lähetykseen',
    deps: ['tapahtuma'],
    lane: 1,
    action: 'channel',
    copyKey: 'intro',
    imagePreset: 'yt-thumb',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    detail: 'Live-streamit',
    deps: ['intro'],
    lane: 2,
    action: 'channel',
    copyKey: 'youtube',
    imagePreset: 'yt-thumb',
    url: 'https://studio.youtube.com/',
    urlLabel: 'Avaa YouTube Studio',
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));

/** Tekstikentät, jotka sisällöngenerointi tuottaa. */
export const COPY_KEYS = ['facebook', 'instagram', 'tiktok', 'cluby', 'webador', 'youtube', 'intro'];

export const COPY_LABELS = {
  facebook: 'Facebook-tapahtuman kuvaus',
  instagram: 'Instagram-kuvateksti',
  tiktok: 'TikTok-teksti',
  cluby: 'Cluby-kuvaus',
  webador: 'Webador-sivun teksti',
  youtube: 'YouTube-lähetyksen kuvaus',
  intro: 'Video-intron käsikirjoitus',
};

export const EVENT_TYPES = [
  'Keikka',
  'Klubi-ilta',
  'DJ-ilta',
  'Karaoke',
  'Livestream',
  'Yksityistilaisuus',
  'Muu',
];

/**
 * Vaiheen tila: 'odottaa' | 'valmis' | 'ohitettu'.
 * Vaihe on avoinna vasta kun kaikki riippuvuudet ovat valmiita tai ohitettuja.
 */
export function isUnlocked(step, steps) {
  return step.deps.every((dep) => {
    const status = steps?.[dep]?.status;
    return status === 'valmis' || status === 'ohitettu';
  });
}

/** Livestream-vaiheet näytetään vain jos tapahtumasta tehdään lähetys. */
export function stepsForEvent(event) {
  return STEPS.filter((step) =>
    (step.id === 'youtube' || step.id === 'intro' ? Boolean(event?.livestream) : true));
}

export function progress(event) {
  const relevant = stepsForEvent(event);
  const done = relevant.filter((step) => {
    const status = event?.steps?.[step.id]?.status;
    return status === 'valmis' || status === 'ohitettu';
  }).length;
  return { done, total: relevant.length };
}
