/**
 * Sähköpostien luku Gmailista IMAPin yli.
 *
 * Luetaan vain: yhteys avataan, viestit haetaan, yhteys suljetaan. Mitään ei
 * merkitä luetuksi eikä poisteta. Haku rajataan tarkoituksella tiukaksi, koska
 * viestien teksti lähetetään analysoitavaksi Claudelle.
 */

import fs from 'node:fs/promises';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const HOST = process.env.GMAIL_HOST || 'imap.gmail.com';
const PORT = Number(process.env.GMAIL_PORT || 993);
const MAILBOX = process.env.GMAIL_MAILBOX || 'INBOX';
const DAYS = Number(process.env.GMAIL_DAYS || 60);
const MAX_MESSAGES = Number(process.env.GMAIL_MAX || 40);
/** Viestistä lähetetään vain alku — sopimusliitteitä tai pitkiä ketjuja ei tarvita. */
const MAX_BODY_CHARS = Number(process.env.GMAIL_MAX_CHARS || 4000);

export function mailConfigured() {
  return Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.ADDHELPER_MAIL_FIXTURE);
}

/** Näytetään käyttöliittymässä, jotta käyttäjä tietää mitä haetaan. */
export function mailSettings() {
  return {
    user: process.env.GMAIL_USER || null,
    mailbox: MAILBOX,
    days: DAYS,
    max: MAX_MESSAGES,
    search: process.env.GMAIL_SEARCH || null,
    fixture: process.env.ADDHELPER_MAIL_FIXTURE || null,
  };
}

function trimBody(text) {
  if (!text) return '';
  return text
    // Lainatut vastausketjut pois: sama tieto toistuisi joka viestissä.
    .split(/^>.*$/m)[0]
    .split(/^-{2,}\s*Alkuperäinen viesti|^On .* wrote:$/m)[0]
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

function toMessage(parsed, uid) {
  return {
    id: parsed.messageId || `uid-${uid}`,
    uid,
    date: parsed.date ? parsed.date.toISOString() : null,
    from: parsed.from?.text || '',
    subject: parsed.subject || '(ei aihetta)',
    body: trimBody(parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ') || ''),
  };
}

/**
 * Hakee viestit joko oikeasta postilaatikosta tai fixture-tiedostosta.
 * Fixture on tarkoitettu kokeiluun ja testaukseen ilman Gmail-tunnuksia.
 */
export async function fetchMessages() {
  const fixture = process.env.ADDHELPER_MAIL_FIXTURE;
  if (fixture) {
    const raw = JSON.parse(await fs.readFile(fixture, 'utf8'));
    return raw.slice(0, MAX_MESSAGES).map((msg, index) => ({
      id: msg.id || `fixture-${index}`,
      uid: index,
      date: msg.date || null,
      from: msg.from || '',
      subject: msg.subject || '(ei aihetta)',
      body: trimBody(msg.body || ''),
    }));
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail-tunnukset puuttuvat. Lisää GMAIL_USER ja GMAIL_APP_PASSWORD .env-tiedostoon.');
  }

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  const messages = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(MAILBOX);
    try {
      const since = new Date(Date.now() - DAYS * 86400000);
      const query = { since };
      if (process.env.GMAIL_SEARCH) query.body = process.env.GMAIL_SEARCH;

      const uids = await client.search(query, { uid: true });
      // Uusimmat ensin, ja vain rajattu määrä.
      const selected = (uids || []).slice(-MAX_MESSAGES).reverse();

      for (const uid of selected) {
        const item = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!item?.source) continue;
        messages.push(toMessage(await simpleParser(item.source), uid));
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return messages;
}

/** Yhteyden testaus ilman viestien hakua. */
export async function testConnection() {
  if (process.env.ADDHELPER_MAIL_FIXTURE) return { ok: true, detail: 'Fixture-tiedosto käytössä.' };
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { ok: false, detail: 'GMAIL_USER tai GMAIL_APP_PASSWORD puuttuu.' };
  }
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });
  try {
    await client.connect();
    const box = await client.status(MAILBOX, { messages: true });
    await client.logout();
    return { ok: true, detail: `Yhteys ${MAILBOX}-kansioon toimii (${box.messages} viestiä).` };
  } catch (err) {
    await client.close().catch(() => {});
    return { ok: false, detail: mailErrorMessage(err) };
  }
}

export function mailErrorMessage(err) {
  const raw = err?.message || String(err);
  if (/Invalid credentials|AUTHENTICATIONFAILED/i.test(raw)) {
    return 'Kirjautuminen ei onnistunut. Tarkista GMAIL_USER ja sovellussalasana — '
      + 'tavallinen Google-salasana ei kelpaa IMAPiin.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED/i.test(raw)) {
    return 'Yhteyttä Gmailiin ei saatu. Tarkista verkkoyhteys ja palomuuri (portti 993).';
  }
  if (/Mailbox doesn.t exist|NONEXISTENT/i.test(raw)) {
    return `Kansiota "${MAILBOX}" ei löydy. Tarkista GMAIL_MAILBOX.`;
  }
  return raw;
}
