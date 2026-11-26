import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../src/content.js';
import {
  buildTelegramLink,
  computeEstimate,
  formatInquiry,
  formatPrice,
  pluralServices,
  validateContact,
  validateName,
} from '../src/assets/js/inquiry.js';

test('смета суммирует выбранные услуги', () => {
  const result = computeEstimate(SITE, ['laptop', 'cleaning']);
  assert.equal(result.count, 2);
  assert.equal(result.base, 1500 + 1900);
  assert.equal(result.urgentFee, 0);
  assert.equal(result.visitFee, 0);
  assert.equal(result.total, 3400);
  assert.deepEqual(
    result.services.map((service) => service.id),
    ['laptop', 'cleaning'],
  );
});

test('срочность и выезд добавляются к смете', () => {
  const result = computeEstimate(SITE, ['laptop', 'pc'], { urgent: true, visit: true });
  assert.equal(result.base, 2700);
  assert.equal(result.urgentFee, Math.round(2700 * SITE.extras.urgent.rate));
  assert.equal(result.visitFee, SITE.extras.visit.price);
  assert.equal(result.total, 2700 + result.urgentFee + 500);
});

test('пустая смета не списывает выезд', () => {
  const result = computeEstimate(SITE, [], { visit: true, urgent: true });
  assert.equal(result.count, 0);
  assert.equal(result.total, 0);
  assert.equal(result.visitFee, 0);
  assert.equal(result.urgentFee, 0);
});

test('абонемент не попадает в разовый расчёт', () => {
  const result = computeEstimate(SITE, ['support', 'remote']);
  assert.equal(result.count, 1);
  assert.equal(result.services[0].id, 'remote');
  assert.equal(result.total, 800);
});

test('неизвестные id игнорируются', () => {
  const result = computeEstimate(SITE, ['nope', 'laptop']);
  assert.equal(result.count, 1);
  assert.equal(result.total, 1500);
});

test('телефон и Telegram проходят валидацию', () => {
  for (const value of ['+7 999 123-45-67', '8 (999) 123-45-67', '89991234567', '@tok_service']) {
    const result = validateContact(value);
    assert.equal(result.valid, true, value);
  }
});

test('некорректный контакт отклоняется', () => {
  for (const value of ['', '   ', 'позвоните мне', '12345', '@a', '@имя']) {
    assert.equal(validateContact(value).valid, false, value);
  }
});

test('имя проверяется и нормализуется', () => {
  assert.deepEqual(validateName('  Анна   Петрова '), { valid: true, value: 'Анна Петрова' });
  assert.equal(validateName('A').valid, false);
  assert.equal(validateName('   ').valid, false);
});

test('склонение слова «услуга»', () => {
  const cases = {
    0: 'услуг',
    1: 'услуга',
    2: 'услуги',
    4: 'услуги',
    5: 'услуг',
    11: 'услуг',
    21: 'услуга',
    22: 'услуги',
    25: 'услуг',
  };
  for (const [count, word] of Object.entries(cases)) {
    assert.equal(pluralServices(Number(count)), word);
  }
});

test('цена форматируется по-русски', () => {
  assert.equal(formatPrice(1500).replace(/\s/g, ' '), '1 500 ₽');
  assert.equal(formatPrice(6900).replace(/\s/g, ' '), '6 900 ₽');
});

test('заявка содержит все ключевые поля', () => {
  const estimate = computeEstimate(SITE, ['laptop', 'cleaning'], { visit: true });
  const message = formatInquiry(
    SITE,
    {
      name: 'Анна Петрова',
      contact: '+7 999 123-45-67',
      serviceName: 'Ремонт ноутбуков',
      comment: 'Не включается после залития.',
      estimate,
    },
    new Date('2026-11-26T12:00:00Z'),
  );

  const flat = message.replace(/\s/g, ' ');
  assert.match(flat, /Заявка с сайта «ТОК»/);
  assert.match(flat, /Имя: Анна Петрова/);
  assert.match(flat, /Связь: \+7 999 123-45-67/);
  assert.match(flat, /Услуга: Ремонт ноутбуков/);
  assert.match(flat, /Расчёт: Ремонт ноутбуков, Чистка и замена термопасты/);
  assert.match(flat, /Ориентир: от 3 900 ₽ \(выезд \+500 ₽\)/);
  assert.match(flat, /Комментарий: Не включается после залития\./);
  assert.match(flat, /Дата: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
  assert.doesNotMatch(message, /undefined|null/);
});

test('заявка без сметы и комментария остаётся аккуратной', () => {
  const message = formatInquiry(SITE, {
    name: 'Иван',
    contact: '@ivan',
    comment: '',
  });
  assert.doesNotMatch(message, /Ориентир/);
  assert.doesNotMatch(message, /Комментарий/);
  assert.doesNotMatch(message, /undefined/);
});

test('ссылка Telegram корректно кодирует текст', () => {
  const text = 'Заявка\nИмя: Анна & Иван';
  const link = buildTelegramLink(SITE, text);
  assert.ok(link.startsWith(`${SITE.contacts.telegram.url}?text=`));
  assert.equal(link.split('?text=')[1], encodeURIComponent(text));
  assert.equal(decodeURIComponent(link.split('?text=')[1]), text);
});

test('ссылка Telegram учитывает существующие query-параметры', () => {
  const site = {
    ...SITE,
    contacts: { ...SITE.contacts, telegram: { ...SITE.contacts.telegram, url: 'https://t.me/x?start=1' } },
  };
  assert.ok(buildTelegramLink(site, 'hi').startsWith('https://t.me/x?start=1&text='));
});

test('контент целостен: уникальные услуги и заполненный FAQ', () => {
  const ids = SITE.services.map((service) => service.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SITE.services.every((service) => service.price > 0));
  assert.ok(SITE.faq.length >= 5);
  assert.ok(SITE.process.steps.length >= 3);
  assert.ok(SITE.contacts.telegram.url.startsWith('https://t.me/'));
  assert.ok(SITE.contacts.phoneHref.startsWith('tel:'));
});
