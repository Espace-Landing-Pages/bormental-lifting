(function () {
  'use strict';

  const root = document.querySelector('.bormental-landing');
  if (!root) return;

  const view = root.ownerDocument.defaultView || window;
  const dialogOpeners = new WeakMap();
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

  function emitAnalytics(eventName, detail) {
    if (typeof view.CustomEvent !== 'function') return;

    view.dispatchEvent(new view.CustomEvent('bormental:analytics', {
      detail: Object.assign({ eventName: eventName }, detail || {})
    }));
  }

  function getPlacement(element) {
    if (!element) return 'page';
    if (element.matches('[data-mobile-cta]')) return 'mobile_sticky';

    const context = element.closest('[data-analytics-placement], section[id], dialog[id], header, footer');
    return context && (
      context.dataset.analyticsPlacement
      || context.id
      || context.tagName.toLowerCase()
    ) || 'page';
  }

  function prefersReducedMotion() {
    return Boolean(view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scheduleFocus(callback) {
    if (typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(callback);
    } else {
      callback();
    }
  }

  function isFocusTarget(element) {
    return Boolean(element && typeof element.focus === 'function');
  }

  function canRestoreFocus(element) {
    if (!isFocusTarget(element) || !element.isConnected || element.matches(':disabled')) return false;
    if (element.hidden || element.closest('[hidden], [inert]')) return false;

    const parentDialog = element.closest('dialog');
    return !parentDialog || parentDialog.open;
  }

  function isAvailableFocusable(element) {
    if (!isFocusTarget(element) || element.hidden || element.matches(':disabled')) return false;
    if (element.closest('[hidden], [inert], fieldset[disabled]')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;

    const style = view.getComputedStyle && view.getComputedStyle(element);
    return !style || (style.display !== 'none' && style.visibility !== 'hidden');
  }

  function getFocusableElements(dialog) {
    return Array.from(root.querySelectorAll(focusableSelector)).filter(function (element) {
      return dialog.contains(element) && isAvailableFocusable(element);
    });
  }

  function focusDialogStart(dialog) {
    if (!dialog || !dialog.open) return;

    const focusable = getFocusableElements(dialog);
    const autofocus = focusable.find(function (element) {
      return element.hasAttribute('autofocus');
    });
    const target = autofocus || focusable[0] || dialog;
    if (isFocusTarget(target)) target.focus();
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.open || typeof dialog.close !== 'function') return;
    dialog.close();
  }

  function openDialog(dialog, opener) {
    if (!dialog || typeof dialog.showModal !== 'function') return;

    if (dialog.open) {
      scheduleFocus(function () { focusDialogStart(dialog); });
      return;
    }

    const restoreTarget = isFocusTarget(opener) ? opener : root.ownerDocument.activeElement;
    dialogOpeners.set(dialog, isFocusTarget(restoreTarget) ? restoreTarget : null);

    try {
      dialog.showModal();
    } catch (error) {
      dialogOpeners.delete(dialog);
      if (canRestoreFocus(restoreTarget)) {
        scheduleFocus(function () { restoreTarget.focus(); });
      }
      return;
    }

    root.classList.add('is-modal-open');
    scheduleFocus(function () { focusDialogStart(dialog); });
  }

  root.addEventListener('click', function (event) {
    const target = event.target && event.target.closest && event.target.closest('a, button, dialog');
    if (!target || !root.contains(target)) return;

    const mobileAnchor = target.closest('details.mobile-nav a[href^="#"]');
    if (mobileAnchor) {
      const navigation = mobileAnchor.closest('details.mobile-nav');
      if (navigation) navigation.open = false;
    }

    if (target.matches('a[data-bormental-cta="popup"]')) {
      emitAnalytics('cta_click', {
        action: 'open_consultation_popup',
        placement: getPlacement(target)
      });
    }

    if (target.matches('a[href^="tel:"]')) {
      emitAnalytics('phone_click', { placement: getPlacement(target) });
    }

    const opener = target.closest('[data-open-dialog="license-dialog"]');
    if (opener) {
      openDialog(root.querySelector('#license-dialog'), opener);
      return;
    }

    const closeControl = target.closest('[data-close-dialog]');
    if (closeControl) {
      closeDialog(closeControl.closest('dialog'));
      return;
    }

    if (target.matches('dialog[open]') && event.target === target) closeDialog(target);
  });

  root.addEventListener('keydown', function (event) {
    const openDialog = root.querySelector('dialog[open]');
    if (!openDialog) return;

    if (event.key === 'Escape') {
      closeDialog(openDialog);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(openDialog);
    const activeElement = root.ownerDocument.activeElement;
    if (!focusable.length) {
      scheduleFocus(function () { openDialog.focus(); });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusIsOutside = activeElement === openDialog || !openDialog.contains(activeElement);

    if (event.shiftKey && (activeElement === first || focusIsOutside)) {
      scheduleFocus(function () { last.focus(); });
    } else if (!event.shiftKey && (activeElement === last || focusIsOutside)) {
      scheduleFocus(function () { first.focus(); });
    }
  });

  root.addEventListener('close', function (event) {
    const dialog = event.target;
    if (!dialog || !dialog.matches || !dialog.matches('dialog')) return;

    const opener = dialogOpeners.get(dialog);
    dialogOpeners.delete(dialog);
    if (!root.querySelector('dialog[open]')) root.classList.remove('is-modal-open');

    if (canRestoreFocus(opener)) {
      scheduleFocus(function () {
        if (!root.querySelector('dialog[open]') && canRestoreFocus(opener)) opener.focus();
      });
    }
  }, true);

  function initMobileCta() {
    const hero = root.querySelector('#hero');
    const mobileCta = root.querySelector('[data-mobile-cta]');
    if (!mobileCta) return;

    const mobileViewport = view.matchMedia && view.matchMedia('(max-width: 760px)');
    const setVisibility = function (visible) {
      mobileCta.classList.toggle('is-visible', visible);
      mobileCta.hidden = !visible;
      mobileCta.inert = !visible;
      mobileCta.setAttribute('aria-hidden', String(!visible));
    };

    setVisibility(false);
    if (!hero || typeof view.IntersectionObserver !== 'function') return;

    let heroHasPassed = false;
    let pastMainEnd = false;
    const visibleBlockers = new Set();
    const update = function () {
      const isMobile = mobileViewport ? mobileViewport.matches : view.innerWidth <= 760;
      setVisibility(isMobile && heroHasPassed && !pastMainEnd && visibleBlockers.size === 0);
    };

    const heroObserver = new view.IntersectionObserver(function (entries) {
      const entry = entries[0];
      if (!entry) return;
      heroHasPassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      update();
    }, { threshold: 0 });

    const blockerObserver = new view.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleBlockers.add(entry.target);
        else visibleBlockers.delete(entry.target);
      });
      update();
    }, {
      threshold: 0,
      rootMargin: '0px 0px 12% 0px'
    });

    heroObserver.observe(hero);
    const blockers = new Set(root.querySelectorAll('#clinic, #reviews, #faq'));
    blockers.forEach(function (blocker) { blockerObserver.observe(blocker); });

    const mainEnd = root.querySelector('main > :last-child');
    if (mainEnd) {
      const mainEndObserver = new view.IntersectionObserver(function (entries) {
        const entry = entries[0];
        if (!entry) return;
        pastMainEnd = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        update();
      }, { threshold: 0 });
      mainEndObserver.observe(mainEnd);
    }
    if (mobileViewport && typeof mobileViewport.addEventListener === 'function') {
      mobileViewport.addEventListener('change', update);
    }
  }

  function initReveals() {
    const reveals = Array.from(root.querySelectorAll('[data-reveal]'));
    if (!reveals.length || prefersReducedMotion()) return;

    const revealScope = root.querySelector('main');
    if (!revealScope || typeof view.IntersectionObserver !== 'function') {
      reveals.forEach(function (element) { element.classList.add('is-revealed'); });
      return;
    }

    revealScope.classList.add('reveal-ready');
    const revealObserver = new view.IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });

    reveals.forEach(function (element) { revealObserver.observe(element); });
  }

  initMobileCta();
  initReveals();
}());
