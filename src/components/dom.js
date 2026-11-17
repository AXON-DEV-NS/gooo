/**
 * منشئ عناصر DOM آمن يضبط النصوص عبر textContent لمنع أي حقن HTML/XSS،
 * ويوفر تحديثاً موضعياً دقيقاً (In-Place Patching) لمنع إعادة بناء الصفحات وقفز التمرير.
 */

const BLOCKED_ATTRS = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const SKIP_DIFF_ATTRS = new Set(['data-focus-id']);

function bindManagedEvent(node, eventName, fn) {
  if (!node.__jawooHandlers) {
    node.__jawooHandlers = {};
  }
  if (!node.__jawooBoundEvents) {
    node.__jawooBoundEvents = new Set();
  }
  node.__jawooHandlers[eventName] = fn;
  if (!node.__jawooBoundEvents.has(eventName)) {
    node.__jawooBoundEvents.add(eventName);
    node.addEventListener(eventName, (e) => {
      const currentFn = node.__jawooHandlers?.[eventName];
      if (typeof currentFn === 'function') {
        return currentFn(e);
      }
      return undefined;
    });
  }
}

function flattenChildren(items, out = []) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (Array.isArray(item)) {
      flattenChildren(item, out);
    } else {
      out.push(item);
    }
  }
  return out;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === 'object') {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null || val === false) continue;
      if (BLOCKED_ATTRS.has(key)) continue;
      if (key === 'className') {
        node.className = val;
      } else if (key === 'dataset' && typeof val === 'object') {
        for (const [dk, dv] of Object.entries(val)) {
          if (dv !== undefined && dv !== null) {
            node.dataset[dk] = String(dv);
          }
        }
      } else if (key.startsWith('on') && typeof val === 'function') {
        bindManagedEvent(node, key.slice(2).toLowerCase(), val);
      } else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'value') {
        node[key] = val;
        if (key === 'disabled' && val) {
          node.setAttribute('disabled', '');
        }
      } else {
        node.setAttribute(key, val === true ? '' : String(val));
      }
    }
  }

  const flatChildren = flattenChildren(children);
  for (const child of flatChildren) {
    if (child === undefined || child === null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      node.appendChild(child);
    }
  }
  return node;
}

export function clearNode(node) {
  while (node && node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function syncElementAttributes(cur, next) {
  const wasRemoteFocused = cur.classList?.contains('is-remote-focused');
  const preserveDetailsOpen = cur.tagName === 'DETAILS' && cur.hasAttribute('open');

  // إزالة السمات غير الموجودة في العنصر الجديد
  for (const attr of Array.from(cur.attributes)) {
    const name = attr.name;
    if (SKIP_DIFF_ATTRS.has(name)) continue;
    if (preserveDetailsOpen && name === 'open') continue;
    if (!next.hasAttribute(name)) {
      cur.removeAttribute(name);
    }
  }

  // تحديث أو إضافة السمات المتغيرة فقط
  for (const attr of Array.from(next.attributes)) {
    const name = attr.name;
    if (name === 'class') continue;
    if (preserveDetailsOpen && name === 'open') continue;
    if (cur.getAttribute(name) !== attr.value) {
      cur.setAttribute(name, attr.value);
    }
  }

  const targetClass = next.className || '';
  const curClassClean = (cur.className || '').replace(/\bis-remote-focused\b/g, '').trim();
  const nextClassClean = targetClass.replace(/\bis-remote-focused\b/g, '').trim();
  if (curClassClean !== nextClassClean || wasRemoteFocused !== cur.classList?.contains('is-remote-focused')) {
    cur.className = targetClass;
    if (wasRemoteFocused && (cur === document.activeElement || nextClassClean.includes('focusable'))) {
      cur.classList.add('is-remote-focused');
    }
  }

  // مزامنة الخصائص الحية لعناصر النماذج دون تدمير العنصر
  if (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA') {
    cur.disabled = Boolean(next.disabled);
    cur.checked = Boolean(next.checked);
    if (cur !== document.activeElement && cur.value !== next.value) {
      cur.value = next.value;
    }
  } else if (cur.tagName === 'OPTION') {
    cur.disabled = Boolean(next.disabled);
    cur.selected = Boolean(next.selected);
  } else if (cur.tagName === 'BUTTON' || cur.tagName === 'SELECT') {
    cur.disabled = Boolean(next.disabled);
  }

  // نقل معالجات الأحداث المحدثة للعنصر القائم
  if (next.__jawooHandlers) {
    for (const [evt, fn] of Object.entries(next.__jawooHandlers)) {
      bindManagedEvent(cur, evt, fn);
    }
    for (const evt of Object.keys(cur.__jawooHandlers || {})) {
      if (!next.__jawooHandlers[evt]) {
        delete cur.__jawooHandlers[evt];
      }
    }
  } else if (cur.__jawooHandlers) {
    cur.__jawooHandlers = {};
  }
}

function getNodeMatchKey(node) {
  if (!node || node.nodeType !== 1) return null;
  return node.dataset?.focusId || node.dataset?.rowKey || node.id || null;
}

export function patchElementInPlace(cur, next) {
  if (!cur || !next) return cur;
  if (cur.nodeType === 3 && next.nodeType === 3) {
    if (cur.nodeValue !== next.nodeValue) {
      cur.nodeValue = next.nodeValue;
    }
    return cur;
  }

  if (cur.nodeType !== 1 || next.nodeType !== 1 || cur.tagName !== next.tagName) {
    if (cur.parentNode) {
      cur.parentNode.replaceChild(next, cur);
    }
    return next;
  }

  // عناصر SVG التزيينية لا تحتاج إلى فحص متكرر إذا تطابقت
  if (cur.tagName.toLowerCase() === 'svg') {
    if (cur.outerHTML !== next.outerHTML && cur.parentNode) {
      cur.parentNode.replaceChild(next, cur);
      return next;
    }
    return cur;
  }

  syncElementAttributes(cur, next);

  const curChildren = Array.from(cur.childNodes);
  const nextChildren = Array.from(next.childNodes);

  // ربط العناصر المميزة بمفاتيح focusId للحفاظ على عقد DOM للأزرار دون إتلافها عند التصفية أو الترتيب
  const keyedCurMap = new Map();
  for (const child of curChildren) {
    const k = getNodeMatchKey(child);
    if (k && !keyedCurMap.has(k)) {
      keyedCurMap.set(k, child);
    }
  }

  let curIndex = 0;
  for (let nextIndex = 0; nextIndex < nextChildren.length; nextIndex += 1) {
    const nextChild = nextChildren[nextIndex];
    const nextKey = getNodeMatchKey(nextChild);
    const currentAtPos = cur.childNodes[nextIndex];

    let matched = null;
    if (nextKey && keyedCurMap.has(nextKey)) {
      const candidate = keyedCurMap.get(nextKey);
      if (candidate.tagName === nextChild.tagName) {
        matched = candidate;
      }
    } else if (
      currentAtPos &&
      currentAtPos.nodeType === nextChild.nodeType &&
      (nextChild.nodeType === 3 ||
        (currentAtPos.tagName === nextChild.tagName && !getNodeMatchKey(currentAtPos) && !nextKey))
    ) {
      matched = currentAtPos;
    }

    if (matched) {
      if (matched !== currentAtPos) {
        cur.insertBefore(matched, currentAtPos || null);
      }
      patchElementInPlace(matched, nextChild);
    } else if (
      currentAtPos &&
      currentAtPos.nodeType === 1 &&
      nextChild.nodeType === 1 &&
      currentAtPos.tagName === nextChild.tagName &&
      (!nextKey || !keyedCurMap.has(nextKey)) &&
      !getNodeMatchKey(currentAtPos)
    ) {
      patchElementInPlace(currentAtPos, nextChild);
    } else {
      cur.insertBefore(nextChild, currentAtPos || null);
    }
    curIndex += 1;
  }

  while (cur.childNodes.length > nextChildren.length) {
    cur.removeChild(cur.lastChild);
  }

  // مزامنة اختيار <select> بعد تحديث خيارات <option>
  if (cur.tagName === 'SELECT' && next.selectedIndex >= 0 && cur.selectedIndex !== next.selectedIndex) {
    cur.selectedIndex = next.selectedIndex;
  }

  return cur;
}
