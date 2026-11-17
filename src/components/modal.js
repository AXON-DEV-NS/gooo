import { el } from './dom.js';

export function renderModal(modalConfig, store) {
  if (!modalConfig) return null;

  return el(
    'div',
    {
      className: 'modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': modalConfig.title || 'نافذة تأكيد',
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          store.closeModal();
        }
      },
    },
    el(
      'div',
      { className: 'modal-card' },
      el(
        'div',
        { className: 'card-head' },
        el('h2', { className: 'card-title' }, modalConfig.title),
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn--sm focusable',
            onClick: () => store.closeModal(),
          },
          'إغلاق'
        )
      ),
      modalConfig.body ? el('p', { style: 'line-height:1.6;' }, modalConfig.body) : null,
      Array.isArray(modalConfig.bullets) && modalConfig.bullets.length > 0
        ? el(
            'ul',
            { style: 'margin:0;padding-inline-start:22px;display:grid;gap:6px;line-height:1.6;' },
            ...modalConfig.bullets.map((line) => el('li', null, line))
          )
        : null,
      modalConfig.detailsNode || null,
      el(
        'div',
        { style: 'display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;' },
        el(
          'button',
          {
            type: 'button',
            className: 'btn focusable',
            dataset: { autofocus: modalConfig.confirmDanger ? 'true' : undefined },
            onClick: () => store.closeModal(),
          },
          modalConfig.cancelLabel || 'إلغاء'
        ),
        modalConfig.onConfirm
          ? el(
              'button',
              {
                type: 'button',
                className: `btn focusable ${modalConfig.confirmDanger ? 'btn--danger' : 'btn--primary'}`,
                dataset: { autofocus: modalConfig.confirmDanger ? undefined : 'true' },
                onClick: () => {
                  modalConfig.onConfirm();
                  store.closeModal();
                },
              },
              modalConfig.confirmLabel || 'تأكيد'
            )
          : null
      )
    )
  );
}
