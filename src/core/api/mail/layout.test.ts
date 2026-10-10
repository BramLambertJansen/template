import { expect, test } from 'vitest';
import { escapeHtml, renderMail } from './layout.ts';

// Mail-layout (roadmap 3f): tekst en HTML met dezelfde inhoud; invoer van gebruikers wordt ge-escaped.
const content = {
  appName: 'Mijn App',
  greeting: 'Hallo Ada,',
  paragraphs: ['Je bent uitgenodigd.'],
  action: { label: 'Wachtwoord instellen', url: 'https://app.example.test/uitnodiging?token=abc&x=1' },
  closing: ['De link werkt 7 dagen.'],
};

test('de opmaak ligt vast (tekst en HTML)', () => {
  const mail = renderMail(content);
  expect(mail.text).toMatchSnapshot('tekst');
  expect(mail.html).toMatchSnapshot('html');
});

test('de tekstversie heeft de link op een eigen regel en de app als afzender', () => {
  const lines = renderMail(content).text.split('\n');
  expect(lines).toContain('https://app.example.test/uitnodiging?token=abc&x=1');
  expect(lines.slice(-2)).toEqual(['-- ', 'Mijn App']);
});

test('naam en tekst met HTML worden ge-escaped, ook in de link', () => {
  const { html } = renderMail({
    ...content,
    greeting: 'Hallo <script>alert(1)</script>,',
    action: { label: 'Klik "hier"', url: 'https://app.example.test/?a="><img src=x>' },
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('Hallo &lt;script&gt;alert(1)&lt;/script&gt;,');
  expect(html).toContain('Klik &quot;hier&quot;');
});

test.each(['javascript:alert(1)', 'data:text/html,hoi', 'mailto:a@b.nl'])('weigert een link met %s', (url) => {
  expect(() => renderMail({ ...content, action: { label: 'x', url } })).toThrow(/alleen http\(s\)-links/);
});

test('zonder actie: geen knop en geen losse link', () => {
  const { text, html } = renderMail({ appName: 'Mijn App', greeting: 'Hallo,', paragraphs: ['Alleen tekst.'] });
  expect(html).not.toContain('<a ');
  expect(text).not.toContain('http');
});

test('escapeHtml', () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
