/**
 * مدير قفل واستعادة التركيز والتمرير للريموت (Strict Scroll & Focus Lock Manager).
 * يضمن عدم قفز مؤشر الريموت أو تحرك أي حاوية قابلة للتمرير بيكسلاً واحداً عند أي تفاعل.
 */

function safeFocusPreventScroll(el) {
  if (!el || typeof el.focus !== 'function') return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    // في البيئات القديمة جداً نتفادى التمرير القسري
  }
}

export function captureUiFocusLock() {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  const focusId = active?.dataset?.focusId || null;
  const routeAttr = active?.dataset?.route || null;
  const tagName = active?.tagName?.toLowerCase() || '';
  const isTextInput = tagName === 'input' || tagName === 'textarea';

  let selectionStart = null;
  let selectionEnd = null;
  if (isTextInput) {
    try {
      selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : null;
      selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
    } catch {
      // بعض أنواع input مثل time/date لا تدعم selectionStart
    }
  }

  const mainEl = document.getElementById('main-content');
  const mainScrollTop = mainEl ? mainEl.scrollTop : 0;
  const windowScrollX = typeof globalThis.scrollX === 'number' ? globalThis.scrollX : 0;
  const windowScrollY = typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0;

  const scrollContainers = [];
  const root = document.getElementById('app') || document.body;
  if (root) {
    const candidates = [root, ...root.querySelectorAll('main, nav, section, div, ul')];
    const seenEls = new Set();
    for (const candidate of candidates) {
      if (seenEls.has(candidate)) continue;
      seenEls.add(candidate);
      if (candidate.scrollTop > 0 || candidate.scrollLeft > 0) {
        scrollContainers.push({
          element: candidate,
          id: candidate.id || null,
          scrollTop: candidate.scrollTop,
          scrollLeft: candidate.scrollLeft,
        });
      }
    }
  }

  return {
    focusId,
    routeAttr,
    mainScrollTop,
    windowScrollX,
    windowScrollY,
    scrollContainers,
    selectionStart,
    selectionEnd,
  };
}

export function restoreScrollPositions(lock) {
  if (!lock || typeof document === 'undefined') return;

  const mainEl = document.getElementById('main-content');
  if (mainEl && mainEl.scrollTop !== lock.mainScrollTop) {
    mainEl.scrollTop = lock.mainScrollTop;
  }

  for (const item of lock.scrollContainers || []) {
    const targetEl =
      item.element && document.contains(item.element)
        ? item.element
        : item.id
          ? document.getElementById(item.id)
          : null;
    if (!targetEl) continue;
    if (targetEl.scrollTop !== item.scrollTop) {
      targetEl.scrollTop = item.scrollTop;
    }
    if (targetEl.scrollLeft !== item.scrollLeft) {
      targetEl.scrollLeft = item.scrollLeft;
    }
  }

  if (typeof globalThis.scrollTo === 'function') {
    const curX = typeof globalThis.scrollX === 'number' ? globalThis.scrollX : 0;
    const curY = typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0;
    if (curX !== lock.windowScrollX || curY !== lock.windowScrollY) {
      try {
        globalThis.scrollTo({ left: lock.windowScrollX, top: lock.windowScrollY, behavior: 'auto' });
      } catch {
        globalThis.scrollTo(lock.windowScrollX, lock.windowScrollY);
      }
    }
  }
}

export function assignFallbackFocusIds(rootElement, routeName = 'app') {
  if (!rootElement) return;
  const interactive = rootElement.querySelectorAll(
    'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
  );
  const cards = Array.from(rootElement.querySelectorAll('.card, header, nav, .modal-card'));
  const seen = new Map();
  for (const node of interactive) {
    if (node.dataset.focusId) {
      seen.set(node.dataset.focusId, (seen.get(node.dataset.focusId) || 0) + 1);
      continue;
    }
    const routeKey = node.dataset.route ? `nav-${node.dataset.route}` : null;
    const namedKey = node.getAttribute('data-focus-key') || node.id || node.getAttribute('name') || null;
    const cardParent = node.closest('.card, header, nav, .modal-card');
    const cardIdx = cardParent ? cards.indexOf(cardParent) : -1;
    const scopePrefix = cardIdx >= 0 ? `s${cardIdx}` : 'root';
    const base = routeKey || (namedKey ? `${routeName}-${namedKey}` : `${routeName}-${scopePrefix}-${node.tagName.toLowerCase()}`);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    node.dataset.focusId = count === 0 ? base : `${base}-${count}`;
  }
}

export function restoreUiFocusLock(lock, remote) {
  if (!lock || typeof document === 'undefined') return false;

  restoreScrollPositions(lock);

  let target = null;
  if (lock.focusId) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(lock.focusId)
      : lock.focusId.replace(/["\\]/g, '\\$&');
    target = document.querySelector(`[data-focus-id="${escaped}"]`);
  }
  if (!target && lock.routeAttr) {
    target = document.querySelector(`.nav-item[data-route="${lock.routeAttr}"]`);
  }

  if (!target) {
    return false;
  }

  if (document.activeElement !== target) {
    if (remote && typeof remote.focusElement === 'function') {
      const ok = remote.focusElement(target, { preventScroll: true });
      if (!ok) return false;
    } else {
      safeFocusPreventScroll(target);
    }
  } else {
    target.classList?.add('is-remote-focused');
  }

  restoreScrollPositions(lock);

  if (lock.selectionStart !== null && typeof target.setSelectionRange === 'function') {
    try {
      target.setSelectionRange(lock.selectionStart, lock.selectionEnd ?? lock.selectionStart);
    } catch {
      // تجاهل آمن
    }
  }

  return true;
}
