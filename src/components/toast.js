import { el } from './dom.js';

export function renderToasts(toasts, store) {
  if (!toasts || toasts.length === 0) return null;

  return el(
    'div',
    { className: 'toast-region', 'aria-live': 'polite' },
    ...toasts.map((t) =>
      el(
        'div',
        { className: `toast toast--${t.tone || 'info'}` },
        el('span', null, t.message),
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn--sm btn--ghost focusable',
            onClick: () => store.dismissToast(t.id),
          },
          'إخفاء'
        )
      )
    )
  );
}
