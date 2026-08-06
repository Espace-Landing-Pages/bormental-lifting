import { formatRussianPhone, isCompleteRussianPhone } from './utils.js';

const leadModal = document.querySelector('#lead-modal');
const consultation = document.querySelector('#consultation');
const footer = document.querySelector('.site-footer');
const mobileCta = document.querySelector('[data-mobile-cta]');
const dialogOpeners = new WeakMap();
const dialogsClosingWithoutRestore = new WeakSet();
const fieldErrorHiddenMode = new WeakMap();

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function emitAnalytics(eventName, detail = {}) {
  if (typeof window.CustomEvent !== 'function') return;

  window.dispatchEvent?.(new window.CustomEvent('bormental:analytics', {
    detail: { eventName, ...detail }
  }));
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function getPlacement(element) {
  if (!element) return 'page';
  if (element.matches?.('[data-mobile-cta]')) return 'mobile_sticky';

  const context = element.closest?.('[data-analytics-placement], section[id], dialog[id], header, footer');
  return context?.dataset.analyticsPlacement
    || context?.id
    || context?.tagName?.toLowerCase()
    || 'page';
}

function isFocusTarget(element) {
  return Boolean(element && typeof element.focus === 'function');
}

function canRestoreFocus(element) {
  if (!isFocusTarget(element) || !element.isConnected || element.matches?.(':disabled')) return false;
  if (element.hidden || element.closest?.('[hidden], [inert]')) return false;

  const parentDialog = element.closest?.('dialog');
  return !parentDialog || parentDialog.open;
}

function isAvailableFocusable(element) {
  if (!isFocusTarget(element) || element.hidden || element.matches?.(':disabled')) return false;
  if (element.closest?.('[hidden], [inert], fieldset[disabled]')) return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle?.(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

function getFocusableElements(dialog) {
  return [...dialog.querySelectorAll(focusableSelector)].filter(isAvailableFocusable);
}

function focusDialogStart(dialog) {
  if (!dialog?.open) return;

  const focusable = getFocusableElements(dialog);
  const autofocus = focusable.find((element) => element.hasAttribute('autofocus'));
  (autofocus || focusable[0] || dialog).focus?.();
}

function scheduleFocus(callback) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
  } else {
    callback();
  }
}

function syncModalState() {
  document.body?.classList.toggle('is-modal-open', Boolean(document.querySelector('dialog[open]')));
}

function closeDialog(dialog, { restoreFocus = true } = {}) {
  if (!dialog?.open || typeof dialog.close !== 'function') return;
  if (!restoreFocus) dialogsClosingWithoutRestore.add(dialog);
  dialog.close();
}

function openDialog(dialog, opener = null) {
  if (!dialog || typeof dialog.showModal !== 'function') return false;

  if (dialog.open) {
    scheduleFocus(() => focusDialogStart(dialog));
    return true;
  }

  const currentDialog = document.querySelector('dialog[open]');
  let restoreTarget = isFocusTarget(opener) ? opener : document.activeElement;

  if (currentDialog && currentDialog !== dialog) {
    if (restoreTarget?.closest?.('dialog') === currentDialog) {
      restoreTarget = dialogOpeners.get(currentDialog) || null;
    }
    closeDialog(currentDialog, { restoreFocus: false });
  }

  dialogOpeners.set(dialog, isFocusTarget(restoreTarget) ? restoreTarget : null);

  try {
    dialog.showModal();
  } catch {
    dialogOpeners.delete(dialog);
    syncModalState();
    if (canRestoreFocus(restoreTarget)) scheduleFocus(() => restoreTarget.focus());
    return false;
  }

  syncModalState();
  scheduleFocus(() => focusDialogStart(dialog));
  return true;
}

document.querySelectorAll('[data-open-lead-modal]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    emitAnalytics('cta_click', {
      action: 'open_lead_modal',
      placement: getPlacement(trigger)
    });
    openDialog(leadModal, trigger);
  });
});

document.querySelectorAll('[data-open-dialog]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = trigger.dataset.openDialog?.replace(/^#/, '');
    const dialog = targetId ? document.getElementById(targetId) : null;
    openDialog(dialog, trigger);
  });
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelectorAll('[data-close-dialog]').forEach((trigger) => {
    trigger.addEventListener('click', () => closeDialog(dialog));
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });

  dialog.addEventListener('close', () => {
    const shouldRestore = !dialogsClosingWithoutRestore.has(dialog);
    const opener = dialogOpeners.get(dialog);
    dialogsClosingWithoutRestore.delete(dialog);
    dialogOpeners.delete(dialog);
    syncModalState();

    if (shouldRestore && canRestoreFocus(opener)) {
      scheduleFocus(() => {
        if (!document.querySelector('dialog[open]') && canRestoreFocus(opener)) opener.focus();
      });
    }
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus?.();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusIsOutside = document.activeElement === dialog || !dialog.contains(document.activeElement);

    if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
      event.preventDefault();
      first.focus();
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  const openDialogElement = document.querySelector('dialog[open]');
  if (!openDialogElement) return;
  event.preventDefault();
  closeDialog(openDialogElement);
});

function getFieldError(form, field) {
  if (!form || !field) return null;

  const aliases = new Set([
    field.name,
    field.id,
    field.dataset?.field
  ].filter(Boolean));
  const describedIds = new Set([
    ...(field.getAttribute('aria-describedby') || '').split(/\s+/),
    field.getAttribute('aria-errormessage')
  ].filter(Boolean));
  const errors = [...form.querySelectorAll('[data-field-error]')];

  const declaredError = errors.find((error) => {
    const declaredField = error.dataset.fieldError || error.dataset.for || error.getAttribute('for');
    return aliases.has(declaredField) || describedIds.has(error.id);
  });
  if (declaredError) return declaredError;

  if (field.nextElementSibling?.matches?.('[data-field-error]')) return field.nextElementSibling;

  const label = field.closest?.('label');
  if (label?.nextElementSibling?.matches?.('[data-field-error]')) return label.nextElementSibling;

  const fieldContainer = field.closest?.('.field, .form-field, .checkbox, .consent');
  const containerError = fieldContainer?.querySelector?.('[data-field-error]');
  if (containerError) return containerError;

  if (field.matches?.('input[type="tel"]')) {
    return form.querySelector('[data-phone-error]');
  }

  return null;
}

function setFieldError(form, field, message = '') {
  if (!field) return;

  if (message) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');

  const error = getFieldError(form, field);
  if (!error) return;

  if (!fieldErrorHiddenMode.has(error)) {
    fieldErrorHiddenMode.set(error, error.hasAttribute('hidden'));
  }
  error.textContent = message;
  if (fieldErrorHiddenMode.get(error)) error.hidden = !message;

  if (message && error.id) {
    const describedIds = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedIds.add(error.id);
    field.setAttribute('aria-describedby', [...describedIds].join(' '));
  }
}

function isContractRequired(field) {
  return field.required || ['name', 'phone', 'consent'].includes(field.name);
}

function requiredMessage(field) {
  if (field.name === 'name') return 'Введите имя.';
  if (field.name === 'phone' || field.matches?.('input[type="tel"]')) return 'Введите номер телефона.';
  if (field.name === 'consent' || field.matches?.('input[type="checkbox"]')) {
    return 'Подтвердите согласие на обработку персональных данных.';
  }
  return 'Заполните обязательное поле.';
}

function getValidationMessage(form, field) {
  if (!field || field.disabled) return '';

  const required = isContractRequired(field);
  const type = (field.type || '').toLowerCase();

  if (type === 'checkbox' && required && !field.checked) return requiredMessage(field);

  if (type === 'radio' && required) {
    const group = [...form.elements].filter((candidate) => candidate.name === field.name);
    if (!group.some((candidate) => candidate.checked)) return requiredMessage(field);
  }

  const value = typeof field.value === 'string' ? field.value.trim() : '';
  if (required && type !== 'checkbox' && type !== 'radio' && !value) return requiredMessage(field);

  if ((field.name === 'phone' || type === 'tel') && !isCompleteRussianPhone(field.value)) {
    return 'Введите полный номер телефона.';
  }

  if (field.validity && !field.validity.valid) return 'Проверьте правильность заполнения поля.';
  return '';
}

function getFormFields(form) {
  const fields = form.querySelectorAll('[required], [name="name"], [name="phone"], [name="consent"], input[type="tel"]');
  return [...new Set(fields)];
}

function validateForm(form) {
  let firstInvalid = null;

  getFormFields(form).forEach((field) => {
    const message = getValidationMessage(form, field);
    setFieldError(form, field, message);
    if (message && !firstInvalid) firstInvalid = field;
  });

  firstInvalid?.focus?.();
  return !firstInvalid;
}

function handleDemoSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!validateForm(form)) return;

  const success = form.querySelector('[data-form-success], .form-success');
  if (success) {
    success.textContent = 'Данные не отправлены: это публичная версия для просмотра и согласования.';
    success.hidden = false;
  }

  form.classList.add('is-success');
  form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((submit) => {
    submit.disabled = true;
  });

  emitAnalytics('lead_form_submit', {
    formId: form.id || 'lead-form',
    mode: 'demo'
  });
}

document.querySelectorAll('input[type="tel"]').forEach((input) => {
  input.addEventListener('focus', () => {
    if (!input.value.trim()) input.value = '+7';
  });

  input.addEventListener('input', () => {
    input.value = formatRussianPhone(input.value);
    setFieldError(input.form || input.closest('form'), input);
  });

  input.addEventListener('blur', () => {
    input.value = formatRussianPhone(input.value);
  });
});

document.querySelectorAll('form[data-lead-form]').forEach((form) => {
  const clearChangedField = (event) => {
    const field = event.target;
    if (field?.matches?.('input, select, textarea')) setFieldError(form, field);
  };

  form.addEventListener('input', clearChangedField);
  form.addEventListener('change', clearChangedField);

  form.addEventListener('submit', handleDemoSubmit);
  form.querySelector('[data-demo-fieldset]')?.removeAttribute('disabled');

  form.dataset.enhanced = 'true';
});

document.querySelectorAll('details.mobile-nav a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', () => {
    const navigation = anchor.closest('details.mobile-nav');
    if (navigation) navigation.open = false;
  });
});

document.querySelectorAll('[data-scroll-to-form]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    consultation?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
    emitAnalytics('cta_click', {
      action: 'scroll_to_form',
      placement: getPlacement(trigger)
    });
  });
});

document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
  link.addEventListener('click', () => {
    emitAnalytics('phone_click', { placement: getPlacement(link) });
  });
});

function initMobileCta() {
  const hero = document.querySelector('#hero');
  if (!mobileCta) return;
  const mobileViewport = window.matchMedia?.('(max-width: 760px)');
  const setVisibility = (visible) => {
    mobileCta.classList.toggle('is-visible', visible);
    mobileCta.hidden = !visible;
    mobileCta.inert = !visible;
    mobileCta.setAttribute('aria-hidden', String(!visible));
  };

  setVisibility(false);
  if (!hero || typeof window.IntersectionObserver !== 'function') return;

  let heroHasPassed = false;
  const visibleBlockers = new Set();
  const update = () => {
    setVisibility(Boolean(mobileViewport?.matches) && heroHasPassed && visibleBlockers.size === 0);
  };

  const heroObserver = new window.IntersectionObserver(([entry]) => {
    if (!entry) return;
    heroHasPassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
    update();
  }, { threshold: 0 });

  const blockerObserver = new window.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleBlockers.add(entry.target);
      else visibleBlockers.delete(entry.target);
    });
    update();
  }, {
    threshold: 0,
    rootMargin: '0px 0px 12% 0px'
  });

  heroObserver.observe(hero);
  const blockers = new Set([
    footer,
    ...document.querySelectorAll('#clinic, #reviews, #faq, #consultation')
  ].filter(Boolean));
  blockers.forEach((blocker) => blockerObserver.observe(blocker));
  mobileViewport?.addEventListener?.('change', update);
}

function initReveals() {
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if (!reveals.length || prefersReducedMotion()) return;

  document.documentElement?.classList.add('reveal-ready');

  if (typeof window.IntersectionObserver !== 'function') {
    reveals.forEach((element) => element.classList.add('is-revealed'));
    return;
  }

  const revealObserver = new window.IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px'
  });

  reveals.forEach((element) => revealObserver.observe(element));
}

initMobileCta();
initReveals();
