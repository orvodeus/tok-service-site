/**
 * Собирает статический сайт в dist/.
 * Запуск: npm run build
 */
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const number = new Intl.NumberFormat('ru-RU');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[character];
  });

const price = (value) => `${number.format(value)} ₽`;
const twoDigits = (index) => String(index + 1).padStart(2, '0');

const plusIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.5v11M2.5 8h11"/></svg>`;
const arrowIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 11 11 5M5.5 5H11v5.5"/></svg>`;

function renderServices() {
  return SITE.services
    .map((service, index) => {
      const addControl = service.subscription
        ? `<a class="service__add" href="#contact" data-discuss-service="${escapeHtml(
            service.id,
          )}" aria-label="Обсудить услугу «${escapeHtml(service.name)}»">${arrowIcon}</a>`
        : `<a class="service__add" href="#calculator" data-add-service="${escapeHtml(
            service.id,
          )}" aria-label="Добавить услугу «${escapeHtml(
            service.name,
          )}» в расчёт">${plusIcon}</a>`;

      return `<li class="service" data-reveal style="--reveal-delay:${(
        Math.min(index, 6) * 0.035
      ).toFixed(3)}s">
            <span class="service__num">${twoDigits(index)}</span>
            <div class="service__body">
              <h3>${escapeHtml(service.name)}</h3>
              <p>${escapeHtml(service.summary)}</p>
            </div>
            <div class="service__meta">
              <span class="service__price"><span>от</span>${price(service.price)}</span>
              <span class="service__time">${escapeHtml(service.duration)}</span>
            </div>
            ${addControl}
          </li>`;
    })
    .join('\n          ');
}

function renderCalculatorOptions() {
  return SITE.services
    .filter((service) => !service.subscription)
    .map(
      (service) => `<label class="check">
                  <input type="checkbox" id="estimate-${escapeHtml(service.id)}" value="${escapeHtml(service.id)}" data-estimate-service>
                  <span class="check__box" aria-hidden="true"></span>
                  <span class="check__text"><span class="check__name">${escapeHtml(
                    service.name,
                  )}</span></span>
                  <span class="check__price">от ${price(service.price)}</span>
                </label>`,
    )
    .join('\n                ');
}

function renderSteps() {
  return SITE.process.steps
    .map(
      (step, index) => `<li class="step" data-reveal style="--reveal-delay:${(index * 0.05).toFixed(2)}s">
              <div class="step__top">
                <span class="step__num">${twoDigits(index)}</span>
                <span class="step__meta">${escapeHtml(step.meta)}</span>
              </div>
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.text)}</p>
            </li>`,
    )
    .join('\n            ');
}

function renderPrinciples() {
  return SITE.process.principles
    .map(
      (principle) => `<article class="principle">
                <h3>${escapeHtml(principle.title)}</h3>
                <p>${escapeHtml(principle.text)}</p>
              </article>`,
    )
    .join('\n              ');
}

function renderFaq() {
  return SITE.faq
    .map(
      (item, index) => `<details class="faq__item"${index === 0 ? ' open' : ''} data-reveal style="--reveal-delay:${Math.min(
        index,
        5,
      ) * 0.03}s">
            <summary>
              <span>${escapeHtml(item.q)}</span>
              <span class="faq__icon" aria-hidden="true"></span>
            </summary>
            <div class="faq__body"><p>${escapeHtml(item.a)}</p></div>
          </details>`,
    )
    .join('\n          ');
}

function renderHours() {
  return SITE.contacts.hours
    .map(
      (row) => `<dt>${escapeHtml(row.days)}</dt><dd>${escapeHtml(row.time)}</dd>`,
    )
    .join('\n                    ');
}

function renderServiceOptions() {
  return SITE.services
    .map(
      (service) =>
        `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)}</option>`,
    )
    .join('\n                      ');
}

function buildTokens() {
  const { business, contacts, pricing, extras, form } = SITE;
  const weekdays = contacts.hours.filter((row) => row.days !== 'Вс');

  return {
    title: escapeHtml(business.title),
    description: escapeHtml(business.description),
    siteUrl: escapeHtml(business.siteUrl),
    businessName: escapeHtml(business.name),
    businessFullName: escapeHtml(business.fullName),
    tagline: escapeHtml(business.tagline),
    city: escapeHtml(business.city),
    disclaimer: escapeHtml(business.disclaimer),
    copyrightYear: escapeHtml(business.copyrightYear),
    phone: escapeHtml(contacts.phone),
    phoneHref: escapeHtml(contacts.phoneHref),
    email: escapeHtml(contacts.email),
    telegramUrl: escapeHtml(contacts.telegram.url),
    telegramHandle: escapeHtml(contacts.telegram.handle),
    addressLine: escapeHtml(contacts.address.line),
    addressNote: escapeHtml(contacts.address.note),
    hoursInline: escapeHtml(
      weekdays.map((row) => `${row.days} ${row.time}`).join(' · '),
    ),
    hoursShort: escapeHtml(
      weekdays[0] ? `${weekdays[0].days} ${weekdays[0].time}` : '',
    ),
    hours: renderHours(),
    diagnosticsPrice: number.format(pricing.diagnostics),
    estimateNote: escapeHtml(`${pricing.estimateNote} ${pricing.diagnosticsNote}`),
    visitName: escapeHtml(extras.visit.name),
    visitDescription: escapeHtml(extras.visit.description),
    visitPrice: number.format(extras.visit.price),
    urgentName: escapeHtml(extras.urgent.name),
    urgentDescription: escapeHtml(extras.urgent.description),
    urgentPercent: Math.round(extras.urgent.rate * 100),
    commentMax: form.commentMax,
    consentText: escapeHtml(form.consentText),
    privacyNote: escapeHtml(form.privacyNote),
    services: renderServices(),
    calculatorOptions: renderCalculatorOptions(),
    steps: renderSteps(),
    principles: renderPrinciples(),
    faq: renderFaq(),
    formServiceOptions: renderServiceOptions(),
  };
}

async function main() {
  const template = await readFile(path.join(srcDir, 'template.html'), 'utf8');
  const tokens = buildTokens();

  const unknown = new Set();
  let html = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in tokens)) {
      unknown.add(key);
      return match;
    }
    return tokens[key];
  });
  if (unknown.size) {
    throw new Error(`Неизвестные токены шаблона: ${[...unknown].join(', ')}`);
  }
  if (/\{\{\w+\}\}/.test(html)) {
    throw new Error('В шаблоне остались незаполненные токены.');
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(path.join(srcDir, 'assets'), path.join(distDir, 'assets'), { recursive: true });
  await cp(
    path.join(srcDir, 'content.js'),
    path.join(distDir, 'assets', 'js', 'content.js'),
  );
  await writeFile(path.join(distDir, 'index.html'), html, 'utf8');
  await writeFile(
    path.join(distDir, 'robots.txt'),
    'User-agent: *\nAllow: /\n',
    'utf8',
  );

  console.log(`✓ dist/index.html — ${(html.length / 1024).toFixed(1)} КБ`);
  console.log(`✓ dist/assets — шрифты, стили, скрипты, изображения`);
}

main().catch((error) => {
  console.error('Сборка не удалась:', error.message);
  process.exitCode = 1;
});
