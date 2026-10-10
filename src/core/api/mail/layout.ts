// Eén basissjabloon voor elke mail (roadmap 3f): platte tekst én HTML met dezelfde inhoud, afzender (app-naam) en
// voettekst. Alle tekst wordt ge-escaped (een naam is invoer van een gebruiker); een actielink moet http(s) zijn.
// HTML met inline stijlen en een tabel als knop: mailprogramma's negeren <style> en moderne CSS.

export interface MailContent {
  readonly appName: string;
  readonly greeting: string;
  readonly paragraphs: readonly string[];
  // De knop; in de tekstversie staat de link op een eigen regel, zodat een mailprogramma hem klikbaar maakt.
  readonly action?: { readonly label: string; readonly url: string };
  // Na de knop, bijv. hoe lang de link werkt.
  readonly closing?: readonly string[];
}

export interface RenderedMail {
  readonly text: string;
  readonly html: string;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function safeUrl(url: string): string {
  const { protocol } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`mail: alleen http(s)-links, niet ${protocol}`);
  return url;
}

const FONT = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;';
const P = `margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2933;${FONT}`;

function paragraph(text: string): string {
  return `<p style="${P}">${escapeHtml(text)}</p>`;
}

function button(label: string, url: string): string {
  const href = escapeHtml(url);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>',
    `<td style="border-radius:6px;background:#1f2933;"><a href="${href}" style="display:inline-block;padding:12px 20px;`,
    `font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;${FONT}">${escapeHtml(label)}</a></td>`,
    '</tr></table>',
    `<p style="${P}font-size:13px;color:#52606d;">Werkt de knop niet? Open dan deze link:<br>`,
    `<a href="${href}" style="color:#1f2933;word-break:break-all;">${href}</a></p>`,
  ].join('');
}

function renderText(content: MailContent, url: string | undefined): string {
  return [
    content.greeting,
    '',
    ...content.paragraphs.flatMap((text) => [text, '']),
    ...(content.action === undefined || url === undefined ? [] : [url, '']),
    ...(content.closing ?? []).flatMap((text) => [text, '']),
    '-- ',
    content.appName,
  ].join('\n');
}

function renderHtml(content: MailContent, url: string | undefined): string {
  const body = [
    paragraph(content.greeting),
    ...content.paragraphs.map(paragraph),
    ...(content.action === undefined || url === undefined ? [] : [button(content.action.label, url)]),
    ...(content.closing ?? []).map(paragraph),
  ].join('');
  const footer = `<p style="${P}margin:24px 0 0;font-size:13px;color:#52606d;">${escapeHtml(content.appName)}</p>`;
  return [
    '<!doctype html><html lang="nl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(content.appName)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f5f7fa;">',
    '<div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px;">',
    body,
    footer,
    '</div></body></html>',
  ].join('');
}

export function renderMail(content: MailContent): RenderedMail {
  const url = content.action === undefined ? undefined : safeUrl(content.action.url);
  return { text: renderText(content, url), html: renderHtml(content, url) };
}
