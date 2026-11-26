/**
 * Статическая проверка собранного сайта без внешних зависимостей.
 * Запуск: npm run check (сборка + тесты + эта проверка).
 */
import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const errors = [];
let checks = 0;

const check = (condition, message) => {
  checks += 1;
  if (!condition) errors.push(message);
};

const exists = async (file) => {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const html = await readFile(path.join(dist, 'index.html'), 'utf8').catch(() => null);
if (!html) {
  console.error('✗ dist/index.html не найден. Сначала выполните npm run build.');
  process.exit(1);
}

/* --- document basics --- */
check(/^<!doctype html>/i.test(html.trim()), 'Нет <!doctype html> в начале документа');
check(/<html[^>]+lang="ru"/.test(html), 'Не указан lang="ru"');
check(/<meta[^>]+name="viewport"/.test(html), 'Нет meta viewport');
check(/<meta[^>]+name="theme-color"/.test(html), 'Нет theme-color');
check(/<link[^>]+rel="canonical"/.test(html), 'Нет canonical');
check(!/\{\{\w+\}\}/.test(html), 'В HTML остались шаблонные токены {{…}}');

const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
check(title.length >= 20, 'Title отсутствует или слишком короткий');
const description =
  html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/)?.[1] ?? '';
check(description.length >= 50, 'Meta description отсутствует или короче 50 символов');
check(/property="og:title"/.test(html), 'Нет og:title');
check(/property="og:image"/.test(html), 'Нет og:image');
check(/name="twitter:card"/.test(html), 'Нет twitter:card');
check((html.match(/<h1[\s>]/g) || []).length === 1, 'Должен быть ровно один <h1>');

/* --- ids, anchors, ARIA refs --- */
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);
check(ids.length === idSet.size, `Повторяющиеся id: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);

const anchors = [...html.matchAll(/<a\b[^>]*?href="([^"]*)"/g)].map((match) => match[1]);
for (const href of anchors) {
  check(href !== '' && href !== '#', `Пустая ссылка в разметке: href="${href}"`);
  if (href.startsWith('#')) {
    check(idSet.has(href.slice(1)), `Битая ссылка-якорь: ${href}`);
  }
  if (/^(javascript:|data:)/i.test(href)) {
    errors.push(`Небезопасная ссылка: ${href}`);
  }
}
checks += anchors.filter((href) => href.startsWith('#')).length; // anchors counted above

for (const attribute of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
  const refs = [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))];
  for (const [, value] of refs) {
    value.split(/\s+/).filter(Boolean).forEach((id) => {
      check(idSet.has(id), `${attribute} ссылается на несуществующий id «${id}»`);
    });
  }
}

/* --- local assets --- */
const assetRefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter(
    (ref) =>
      ref &&
      !ref.startsWith('#') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(ref) &&
      !ref.startsWith('//'),
  );

for (const ref of new Set(assetRefs)) {
  const file = path.resolve(dist, ref.split(/[?#]/)[0]);
  check(file.startsWith(dist), `Ссылка выходит за пределы dist: ${ref}`);
  check(await exists(file), `Не найден локальный файл: ${ref}`);
}

for (const image of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og.png']) {
  check(await exists(path.join(dist, 'assets', 'img', image)), `Не найден assets/img/${image}`);
}

// CSS url(...) references (fonts)
const cssFiles = (await readdir(path.join(dist, 'assets', 'css'))).filter((file) => file.endsWith('.css'));
for (const cssFile of cssFiles) {
  const css = await readFile(path.join(dist, 'assets', 'css', cssFile), 'utf8');
  const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((match) => match[1]);
  for (const url of urls) {
    if (/^[a-z]+:/i.test(url) || url.startsWith('data:')) continue;
    const file = path.resolve(dist, 'assets', 'css', url);
    check(await exists(file), `CSS ${cssFile}: не найден файл ${url}`);
  }
}

/* --- external links & images --- */
const tags = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const tag of tags) {
  if (!/target="_blank"/.test(tag)) continue;
  check(/rel="[^"]*noopener/.test(tag), `Ссылка target="_blank" без rel="noopener": ${tag.slice(0, 90)}`);
}

const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
for (const image of images) {
  check(/\balt="/.test(image), `Изображение без alt: ${image.slice(0, 80)}`);
}

/* --- form controls have labels --- */
const labelFor = new Set(
  [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]),
);
const wrappedIds = new Set();
for (const [, block] of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
  for (const [, id] of block.matchAll(/\bid="([^"]+)"/g)) wrappedIds.add(id);
}
const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => !/type="hidden"/.test(tag));
for (const control of controls) {
  const id = control.match(/\bid="([^"]+)"/)?.[1];
  check(id, `Элемент формы без id: ${control.slice(0, 80)}`);
  if (id) {
    check(labelFor.has(id) || wrappedIds.has(id), `Нет label для поля #${id}`);
  }
}

/* --- pricing and content rendered --- */
for (const service of SITE.services) {
  const needle = service.name.replace(/&/g, '&amp;');
  check(html.includes(needle), `В HTML нет услуги «${service.name}»`);
}
check(html.includes(SITE.contacts.telegram.url), 'В HTML нет ссылки Telegram из конфига');
check(html.includes(SITE.contacts.phoneHref), 'В HTML нет ссылки телефона из конфига');

/* --- JS syntax --- */
for (const file of ['app.js', 'inquiry.js', 'content.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(dist, 'assets', 'js', file)], {
    encoding: 'utf8',
  });
  check(result.status === 0, `Синтаксическая ошибка в ${file}: ${result.stderr.trim()}`);
}

/* --- report --- */
if (errors.length) {
  console.error(`✗ Проверка не пройдена: ${errors.length} ошибок\n`);
  errors.forEach((error) => console.error(`  • ${error}`));
  process.exit(1);
}

console.log(`✓ Проверка пройдена: ${checks} проверок, 0 ошибок`);
console.log('✓ Якоря, aria-ссылки, ассеты, формы, метаданные и JS — в порядке');
