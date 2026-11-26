/**
 * Чистая логика расчёта и заявки.
 * Не зависит от DOM — покрыта тестами в tests/.
 */

const moneyFormatter = new Intl.NumberFormat('ru-RU');

export function formatNumber(value) {
  return moneyFormatter.format(Number(value) || 0);
}

export function formatPrice(value) {
  return `${formatNumber(value)} ₽`;
}

export function pluralServices(count) {
  const n = Math.abs(Number(count)) || 0;
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'услуга';
  if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return 'услуги';
  return 'услуг';
}

/**
 * Считает предварительную смету по выбранным услугам.
 * Абонемент (subscription) в разовый расчёт не входит.
 */
export function computeEstimate(site, selectedIds, options = {}) {
  const ids = new Set(selectedIds || []);
  const services = site.services.filter(
    (service) => ids.has(service.id) && !service.subscription,
  );
  const base = services.reduce((sum, service) => sum + Number(service.price || 0), 0);

  const urgentRate = Number(site.extras?.urgent?.rate ?? 0);
  const urgentFee = options.urgent && base > 0 ? Math.round(base * urgentRate) : 0;

  const visitPrice = Number(site.extras?.visit?.price ?? 0);
  const visitFee = options.visit && services.length > 0 ? visitPrice : 0;

  return {
    services,
    count: services.length,
    base,
    urgentFee,
    visitFee,
    total: base + urgentFee + visitFee,
  };
}

/** @returns {{valid: true, value: string} | {valid: false, message: string}} */
export function validateName(raw) {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < 2) {
    return { valid: false, message: 'Укажите имя — хотя бы две буквы.' };
  }
  if (value.length > 60) {
    return { valid: false, message: 'Слишком длинное имя — до 60 символов.' };
  }
  return { valid: true, value };
}

/** Принимает телефон (10–15 цифр) или ник Telegram вида @name. */
export function validateContact(raw) {
  const value = String(raw ?? '').trim();
  if (!value) {
    return { valid: false, message: 'Укажите телефон или ник в Telegram.' };
  }
  if (value.startsWith('@')) {
    if (/^@[A-Za-z0-9_]{4,32}$/.test(value)) {
      return { valid: true, value };
    }
    return {
      valid: false,
      message: 'Ник в Telegram — от 4 до 32 латинских букв, цифр или «_», например @tok_service.',
    };
  }
  const digits = value.replace(/\D/g, '');
  const phoneLike = /^[+()\d\s-]+$/.test(value);
  if (phoneLike && digits.length >= 10 && digits.length <= 15) {
    return { valid: true, value };
  }
  return {
    valid: false,
    message: 'Похоже, в контакте ошибка. Укажите телефон или ник вида @tok_service.',
  };
}

export function formatInquiryDate(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Собирает текстовую заявку для Telegram.
 * @param {object} site
 * @param {{name: string, contact: string, serviceName?: string, comment?: string, estimate?: object|null}} data
 * @param {Date} date
 */
export function formatInquiry(site, data, date = new Date()) {
  const lines = [
    `Заявка с сайта «${site.business.name}»`,
    '',
    `Имя: ${data.name}`,
    `Связь: ${data.contact}`,
  ];

  if (data.serviceName) {
    lines.push(`Услуга: ${data.serviceName}`);
  }

  const estimate = data.estimate;
  if (estimate && estimate.count > 0) {
    lines.push(`Расчёт: ${estimate.services.map((service) => service.name).join(', ')}`);
    const fees = [];
    if (estimate.urgentFee > 0) {
      fees.push(`срочность +${formatPrice(estimate.urgentFee)}`);
    }
    if (estimate.visitFee > 0) {
      fees.push(`выезд +${formatPrice(estimate.visitFee)}`);
    }
    lines.push(
      `Ориентир: от ${formatPrice(estimate.total)}${fees.length ? ` (${fees.join(', ')})` : ''}`,
    );
  }

  const comment = String(data.comment ?? '').trim();
  if (comment) {
    lines.push(`Комментарий: ${comment}`);
  }

  lines.push('', `Дата: ${formatInquiryDate(date)}`);
  return lines.join('\n');
}

/** Ссылка на чат Telegram с подставленным текстом заявки. */
export function buildTelegramLink(site, text) {
  const base = String(site.contacts.telegram.url).replace(/\/$/, '');
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}text=${encodeURIComponent(text)}`;
}
