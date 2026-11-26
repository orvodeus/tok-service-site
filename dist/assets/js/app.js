import { SITE } from './content.js';
import {
  buildTelegramLink,
  computeEstimate,
  formatInquiry,
  formatPrice,
  pluralServices,
  validateContact,
  validateName,
} from './inquiry.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior = () => (reduceMotion.matches ? 'auto' : 'smooth');

/* ------------------------------------------------------------------
   Scroll reveal
   ------------------------------------------------------------------ */
function initReveal() {
  const items = $$('[data-reveal]');
  if (!items.length) return;

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
  );

  items.forEach((item) => observer.observe(item));
}

/* ------------------------------------------------------------------
   Header: active section
   ------------------------------------------------------------------ */
function initScrollSpy() {
  const links = $$('.nav a[href^="#"]');
  if (!links.length || !('IntersectionObserver' in window)) return;

  const sections = links
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach((link) => {
      if (link.hash === `#${id}`) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: '-42% 0px -50% 0px', threshold: 0 },
  );

  sections.forEach((section) => observer.observe(section));
}

/* ------------------------------------------------------------------
   Mobile navigation
   ------------------------------------------------------------------ */
function initMenu() {
  const dialog = $('#mobile-menu');
  const openButton = $('[data-menu-open]');
  const closeButton = $('[data-menu-close]');
  if (!dialog || !openButton || typeof dialog.showModal !== 'function') return;

  const setBodyLock = (locked) => {
    document.body.classList.toggle('menu-open', locked);
  };

  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    dialog.focus();
    openButton.setAttribute('aria-expanded', 'true');
    setBodyLock(true);
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  openButton.addEventListener('click', open);
  closeButton?.addEventListener('click', close);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  dialog.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
    setBodyLock(false);
  });

  $$('a', dialog).forEach((link) => {
    link.addEventListener('click', () => close());
  });
}

/* ------------------------------------------------------------------
   Estimator
   ------------------------------------------------------------------ */
function initEstimator() {
  const section = $('#calculator');
  const rows = $('#estimate-rows');
  const empty = $('#estimate-empty');
  const total = $('#estimate-total');
  const totalPrefix = $('.summary__prefix');
  const count = $('#estimate-count');
  const status = $('#estimate-status');
  const summaryAmount = $('.summary__amount');
  const toForm = $('#estimate-to-form');
  const reset = $('#estimate-reset');
  const serviceInputs = $$('[data-estimate-service]');
  const extras = $$('[data-extra]');
  const addLinks = $$('[data-add-service]');
  const discussLinks = $$('[data-discuss-service]');
  if (!rows || !empty || !total || !count || !toForm) return;

  const state = { selected: new Set(), visit: false, urgent: false };
  const names = new Map(SITE.services.map((service) => [service.id, service.name]));
  let bumpTimer = 0;
  let lastTotal = null;

  const syncInputs = () => {
    serviceInputs.forEach((input) => {
      input.checked = state.selected.has(input.value);
    });
    extras.forEach((input) => {
      input.checked = input.value === 'visit' ? state.visit : state.urgent;
    });
  };

  const syncCatalogLinks = () => {
    addLinks.forEach((link) => {
      const id = link.dataset.addService;
      const isOn = state.selected.has(id);
      link.classList.toggle('is-in-estimate', isOn);
      link.setAttribute(
        'aria-label',
        `${isOn ? 'Убрать' : 'Добавить'} услугу «${names.get(id) ?? ''}» ${
          isOn ? 'из расчёта' : 'в расчёт'
        }`,
      );
    });
  };

  const makeRow = (name, price, isFee = false) => {
    const li = document.createElement('li');
    li.className = `summary__row${isFee ? ' summary__row--fee' : ''}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'summary__row-name';
    nameEl.textContent = name;
    const priceEl = document.createElement('span');
    priceEl.className = 'summary__row-price';
    priceEl.textContent = `${isFee ? '+' : ''}${formatPrice(price)}`;
    li.append(nameEl, priceEl);
    return li;
  };

  const render = (announce = false) => {
    const estimate = computeEstimate(SITE, [...state.selected], {
      visit: state.visit,
      urgent: state.urgent,
    });

    rows.replaceChildren();
    estimate.services.forEach((service) => {
      rows.append(makeRow(service.name, service.price));
    });
    if (estimate.urgentFee > 0) {
      rows.append(makeRow(SITE.extras.urgent.name, estimate.urgentFee, true));
    }
    if (estimate.visitFee > 0) {
      rows.append(makeRow(SITE.extras.visit.name, estimate.visitFee, true));
    }

    const isEmpty = estimate.count === 0;
    empty.hidden = !isEmpty;
    rows.hidden = isEmpty;

    count.textContent = `${estimate.count} ${pluralServices(estimate.count)}`;
    total.textContent = isEmpty ? '—' : formatPrice(estimate.total);
    if (totalPrefix) totalPrefix.hidden = isEmpty;
    summaryAmount?.classList.toggle('is-empty', isEmpty);
    toForm.disabled = isEmpty;
    if (reset) reset.disabled = isEmpty;

    if (summaryAmount && lastTotal !== null && lastTotal !== estimate.total && !reduceMotion.matches) {
      window.clearTimeout(bumpTimer);
      summaryAmount.classList.add('is-bumping');
      bumpTimer = window.setTimeout(() => summaryAmount.classList.remove('is-bumping'), 380);
    }
    lastTotal = estimate.total;

    syncCatalogLinks();

    if (announce && status) {
      status.textContent = isEmpty
        ? 'Ничего не выбрано.'
        : `Выбрано ${estimate.count} ${pluralServices(estimate.count)}. Ориентир — от ${formatPrice(
            estimate.total,
          )}.`;
    }

    return estimate;
  };

  const toggleService = (id, shouldSelect) => {
    if (!names.has(id)) return;
    if (shouldSelect) state.selected.add(id);
    else state.selected.delete(id);
  };

  serviceInputs.forEach((input) => {
    input.addEventListener('change', () => {
      toggleService(input.value, input.checked);
      render(true);
    });
  });

  extras.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.value === 'visit') state.visit = input.checked;
      if (input.value === 'urgent') state.urgent = input.checked;
      render(true);
    });
  });

  addLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const id = link.dataset.addService;
      const wasSelected = state.selected.has(id);
      toggleService(id, !wasSelected);
      syncInputs();
      render(true);

      if (!wasSelected && section) {
        const rect = section.getBoundingClientRect();
        const visible = rect.top < window.innerHeight - 80 && rect.bottom > 80;
        if (!visible) {
          section.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        }
      }
    });
  });

  reset?.addEventListener('click', () => {
    state.selected.clear();
    state.visit = false;
    state.urgent = false;
    syncInputs();
    render(true);
    clearHandoff();
  });

  /* Handoff to the inquiry form */
  const handoffBox = $('#form-estimate');
  const handoffChips = $('#form-estimate-chips');
  const handoffClear = $('#form-estimate-clear');
  let handoff = null;

  const renderHandoff = (estimate) => {
    if (!handoffBox || !handoffChips) return;
    handoffChips.replaceChildren(
      ...estimate.services.map((service) => {
        const chip = document.createElement('span');
        chip.className = 'form__chip';
        chip.textContent = service.name;
        return chip;
      }),
    );
    if (estimate.visitFee > 0) {
      const chip = document.createElement('span');
      chip.className = 'form__chip';
      chip.textContent = 'Выезд мастера';
      handoffChips.append(chip);
    }
    if (estimate.urgentFee > 0) {
      const chip = document.createElement('span');
      chip.className = 'form__chip';
      chip.textContent = 'Срочно';
      handoffChips.append(chip);
    }
    handoffBox.hidden = false;
  };

  const clearHandoff = () => {
    handoff = null;
    if (handoffBox) handoffBox.hidden = true;
    if (handoffChips) handoffChips.replaceChildren();
  };

  toForm.addEventListener('click', () => {
    const estimate = render(false);
    if (estimate.count === 0) return;
    handoff = {
      ids: [...state.selected],
      options: { visit: state.visit, urgent: state.urgent },
    };
    renderHandoff(estimate);

    const nameField = $('#name');
    nameField?.focus({ preventScroll: true });
    $('#contact')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  });

  handoffClear?.addEventListener('click', clearHandoff);

  discussLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const select = $('#service');
      if (select) select.value = link.dataset.discussService;
    });
  });

  render(false);
  syncInputs();

  return {
    getHandoff: () => handoff,
    clearHandoff,
  };
}

/* ------------------------------------------------------------------
   Inquiry form
   ------------------------------------------------------------------ */
function initForm(estimator) {
  const form = $('#inquiry-form');
  if (!form) return;

  const nameInput = $('#name');
  const contactInput = $('#contact-input');
  const serviceSelect = $('#service');
  const commentInput = $('#comment');
  const consentInput = $('#consent');
  const commentCount = $('#comment-count');
  const errorBox = $('#form-errors');
  const errorList = errorBox ? $('ul', errorBox) : null;
  const result = $('#form-result');
  const resultPreview = $('#result-preview');
  const resultTelegram = $('#result-telegram');
  const resultCopy = $('#result-copy');
  const copyStatus = $('#copy-status');
  const resultFallback = $('#result-fallback');
  let copyTimer = 0;

  const fieldErrors = {
    name: { input: nameInput, box: $('#name-error') },
    contact: { input: contactInput, box: $('#contact-error') },
    consent: { input: consentInput, box: $('#consent-error') },
  };

  const setFieldError = (key, message) => {
    const field = fieldErrors[key];
    if (!field?.input || !field.box) return;
    field.box.textContent = message || '';
    field.box.hidden = !message;
    if (message) field.input.setAttribute('aria-invalid', 'true');
    else field.input.removeAttribute('aria-invalid');
  };

  const clearFieldError = (key) => setFieldError(key, '');

  const hideErrors = () => {
    if (!errorBox) return;
    errorBox.hidden = true;
    errorList?.replaceChildren();
  };

  const showErrors = (errors) => {
    if (!errorBox || !errorList) return;
    errorList.replaceChildren(
      ...errors.map(({ key, message }) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${fieldErrors[key]?.input?.id ?? key}`;
        link.textContent = message;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          fieldErrors[key]?.input?.focus();
        });
        li.append(link);
        return li;
      }),
    );
    errorBox.hidden = false;
    errorBox.focus();
  };

  const revalidate = (key) => {
    if (fieldErrors[key]?.input?.getAttribute('aria-invalid') !== 'true') return;

    if (key === 'name') {
      const check = validateName(nameInput.value);
      setFieldError('name', check.valid ? '' : check.message);
    }
    if (key === 'contact') {
      const check = validateContact(contactInput.value);
      setFieldError('contact', check.valid ? '' : check.message);
    }
    if (key === 'consent') {
      setFieldError('consent', consentInput.checked ? '' : 'Без согласия мы не можем принять заявку.');
    }
  };

  nameInput?.addEventListener('input', () => revalidate('name'));
  contactInput?.addEventListener('input', () => revalidate('contact'));
  consentInput?.addEventListener('change', () => revalidate('consent'));

  if (commentInput && commentCount) {
    const updateCount = () => {
      commentCount.textContent = String(commentInput.value.length);
    };
    commentInput.addEventListener('input', updateCount);
    updateCount();
  }

  const resetCopyStatus = () => {
    window.clearTimeout(copyTimer);
    if (copyStatus) {
      copyStatus.textContent = '';
      copyStatus.classList.remove('is-error');
    }
    if (resultCopy) resultCopy.textContent = 'Скопировать текст';
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  };

  resultCopy?.addEventListener('click', async () => {
    if (!resultPreview) return;
    const text = resultPreview.textContent || '';
    window.clearTimeout(copyTimer);
    if (copyStatus) {
      copyStatus.classList.remove('is-error');
      copyStatus.textContent = 'Копируем…';
    }
    try {
      const ok = await copyText(text);
      if (!ok) throw new Error('copy failed');
      if (copyStatus) copyStatus.textContent = 'Скопировано — можно вставить в чат.';
      if (resultCopy) resultCopy.textContent = 'Скопировано';
    } catch {
      if (copyStatus) {
        copyStatus.textContent = 'Не удалось скопировать автоматически. Текст выделен — нажмите Ctrl+C.';
        copyStatus.classList.add('is-error');
      }
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(resultPreview);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    copyTimer = window.setTimeout(resetCopyStatus, 5000);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    hideErrors();
    resetCopyStatus();

    const errors = [];
    const name = validateName(nameInput?.value);
    if (!name.valid) {
      setFieldError('name', name.message);
      errors.push({ key: 'name', message: name.message });
    } else {
      clearFieldError('name');
    }

    const contact = validateContact(contactInput?.value);
    if (!contact.valid) {
      setFieldError('contact', contact.message);
      errors.push({ key: 'contact', message: contact.message });
    } else {
      clearFieldError('contact');
    }

    if (!consentInput?.checked) {
      const message = 'Отметьте согласие на обработку данных.';
      setFieldError('consent', message);
      errors.push({ key: 'consent', message });
    } else {
      clearFieldError('consent');
    }

    if (errors.length) {
      showErrors(errors);
      return;
    }

    const service = SITE.services.find((item) => item.id === serviceSelect?.value);
    const handoff = estimator?.getHandoff();
    const estimate = handoff ? computeEstimate(SITE, handoff.ids, handoff.options) : null;

    const message = formatInquiry(SITE, {
      name: name.value,
      contact: contact.value,
      serviceName: service?.name ?? '',
      comment: commentInput?.value ?? '',
      estimate: estimate && estimate.count > 0 ? estimate : null,
    });

    const link = buildTelegramLink(SITE, message);
    if (resultPreview) resultPreview.textContent = message;
    if (resultTelegram) resultTelegram.href = link;
    if (result) result.hidden = false;
    if (resultFallback) resultFallback.hidden = true;

    let opened = null;
    try {
      opened = window.open(link, '_blank');
      if (opened) opened.opener = null;
    } catch {
      opened = null;
    }
    if (!opened && resultFallback) resultFallback.hidden = false;

    result?.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'center',
    });
  });
}

/* ------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
initReveal();
initScrollSpy();
initMenu();
const estimator = initEstimator();
initForm(estimator);
