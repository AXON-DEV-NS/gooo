const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',');

export function isElementVisible(el) {
  if (!el) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function canAcceptFocus(el) {
  if (!el || !document.contains(el)) return false;
  if (el.disabled || el.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

export function getFocusableElements(root = document) {
  const modal = root.querySelector?.('.modal-backdrop');
  const scope = modal || root;
  const all = Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR));
  return all.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return isElementVisible(el);
  });
}

/**
 * خوارزمية التنقل المكاني بالريموت: تختار أقرب عنصر في الاتجاه المطلوب
 * بناءً على مركز المستطيل مع ترجيح المحاذاة على المحور العمودي/الأفقي.
 */
export function findNextSpatialElement(currentEl, candidates, direction) {
  if (!candidates || candidates.length === 0) return null;
  if (!currentEl || !candidates.includes(currentEl)) {
    return candidates[0];
  }

  const curRect = currentEl.getBoundingClientRect();
  const cx = curRect.left + curRect.width / 2;
  const cy = curRect.top + curRect.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === currentEl) continue;
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    let inDirection = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    if (direction === 'ArrowRight') {
      inDirection = dx > 4;
      primaryDist = dx;
      secondaryDist = Math.abs(dy);
    } else if (direction === 'ArrowLeft') {
      inDirection = dx < -4;
      primaryDist = -dx;
      secondaryDist = Math.abs(dy);
    } else if (direction === 'ArrowDown') {
      inDirection = dy > 4;
      primaryDist = dy;
      secondaryDist = Math.abs(dx);
    } else if (direction === 'ArrowUp') {
      inDirection = dy < -4;
      primaryDist = -dy;
      secondaryDist = Math.abs(dx);
    }

    if (!inDirection) continue;

    // تفضيل العناصر المتداخلة على نفس الصف/العمود
    const score = primaryDist + secondaryDist * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

export function isRemoteBackEvent(event) {
  const key = event.key;
  const code = event.keyCode || event.which;
  return (
    key === 'Escape' ||
    key === 'BrowserBack' ||
    key === 'GoBack' ||
    key === 'XF86Back' ||
    key === 'Backspace' ||
    code === 27 ||
    code === 8 ||
    code === 461 || // LG webOS Back
    code === 10009 // Samsung Tizen Return
  );
}

export function isRemoteConfirmEvent(event) {
  const key = event.key;
  const code = event.keyCode || event.which;
  return key === 'Enter' || key === 'NumpadEnter' || key === 'Select' || code === 13 || code === 23;
}

export function installRemoteNavigation({ onBack, onKeyObserved }) {
  let currentFocused = null;

  function ensureElementVisibleInMain(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const mainEl = document.getElementById('main-content');
    if (!mainEl || !mainEl.contains(el)) return;
    const mainRect = mainEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (mainRect.height <= 0 || elRect.height <= 0) return;

    const padding = 16;
    if (elRect.top < mainRect.top + padding) {
      mainEl.scrollTop = Math.max(0, mainEl.scrollTop - (mainRect.top + padding - elRect.top));
    } else if (elRect.bottom > mainRect.bottom - padding) {
      mainEl.scrollTop += elRect.bottom - (mainRect.bottom - padding);
    }
  }

  function markFocused(el, { ensureIntoView = false } = {}) {
    if (currentFocused && currentFocused !== el) {
      currentFocused.classList.remove('is-remote-focused');
    }
    currentFocused = el;
    if (el) {
      el.classList.add('is-remote-focused');
      try {
        el.focus({ preventScroll: true });
      } catch {
        // المتصفح القديم لا يدعم خيارات focus؛ نتجاهل بأمان دون تمرير قسري
      }
      if (ensureIntoView) {
        ensureElementVisibleInMain(el);
      }
    }
  }

  function ensureFocus() {
    const candidates = getFocusableElements(document);
    if (candidates.length === 0) return;
    if (!currentFocused || !document.contains(currentFocused) || !candidates.includes(currentFocused)) {
      const preferred =
        candidates.find((el) => el.dataset.autofocus === 'true') ||
        candidates.find((el) => el.classList.contains('nav-item') && el.classList.contains('is-active')) ||
        candidates[0];
      markFocused(preferred);
    }
  }

  function handleKeyDown(event) {
    if (typeof onKeyObserved === 'function') {
      onKeyObserved({
        key: event.key || '(unknown)',
        code: event.code || '',
        keyCode: event.keyCode || event.which || 0,
      });
    }

    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase() || '';
    const isTextEntry =
      (tag === 'input' && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(active.type)) ||
      tag === 'textarea';

    if (isRemoteBackEvent(event)) {
      if (isTextEntry && (event.key === 'Backspace' || event.keyCode === 8)) {
        return;
      }
      event.preventDefault();
      if (typeof onBack === 'function') {
        onBack();
      }
      return;
    }

    const dir = event.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(dir)) {
      // داخل حقل نصي: نترك اليمين واليسار لتحريك المؤشر، بينما الأعلى والأسفل ينقلان التركيز
      if (isTextEntry && (dir === 'ArrowLeft' || dir === 'ArrowRight')) {
        return;
      }
      if (tag === 'select' && (dir === 'ArrowUp' || dir === 'ArrowDown')) {
        return;
      }

      event.preventDefault();
      const candidates = getFocusableElements(document);
      if (candidates.length === 0) return;

      const startEl = candidates.includes(active) ? active : currentFocused;
      let nextEl = findNextSpatialElement(startEl, candidates, dir);

      // بديل منطقي (من اليمين لليسار) إذا لم يوجد عنصر في الاتجاه المكاني
      if (!nextEl && startEl && candidates.includes(startEl)) {
        const idx = candidates.indexOf(startEl);
        if (dir === 'ArrowLeft' || dir === 'ArrowDown') {
          nextEl = candidates[(idx + 1) % candidates.length];
        } else {
          nextEl = candidates[(idx - 1 + candidates.length) % candidates.length];
        }
      }

      markFocused(nextEl || candidates[0], { ensureIntoView: true });
      return;
    }

    if (isRemoteConfirmEvent(event)) {
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button' || tag === 'a') {
        return;
      }
      if (active && typeof active.click === 'function') {
        event.preventDefault();
        active.click();
      }
    }
  }

  function handleFocusIn(event) {
    if (event.target && event.target !== document.body) {
      if (currentFocused && currentFocused !== event.target) {
        currentFocused.classList.remove('is-remote-focused');
      }
      currentFocused = event.target;
      currentFocused.classList.add('is-remote-focused');
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('focusin', handleFocusIn);

  return {
    ensureFocus,
    focusElement(target, options = { preventScroll: true }) {
      if (canAcceptFocus(target)) {
        markFocused(target, options);
        return true;
      }
      return false;
    },
    focusSelector(selector, options = {}) {
      const target = document.querySelector(selector);
      if (canAcceptFocus(target)) {
        markFocused(target, options);
      } else {
        ensureFocus();
      }
    },
    destroy() {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    },
  };
}
