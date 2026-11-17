import { el } from './dom.js';
import { icon } from './icons.js';

export const NAV_ITEMS = [
  { id: 'home', label: 'الرئيسية', icon: 'home', aliases: ['home'] },
  { id: 'prayer', label: 'الصلاة', icon: 'moon', aliases: ['prayer'] },
  { id: 'study', label: 'المذاكرة', icon: 'tasks', aliases: ['study', 'tasks', 'focus'] },
  { id: 'quran', label: 'القرآن الكريم', icon: 'book', aliases: ['quran'] },
  { id: 'habits', label: 'العادات', icon: 'habits', aliases: ['habits', 'content'] },
  { id: 'settings', label: 'الإعدادات', icon: 'settings', aliases: ['settings', 'diagnostics'] },
];

export function renderNavBar(activeRoute, store) {
  return el(
    'nav',
    { className: 'bottom-nav', 'aria-label': 'التنقل الرئيسي' },
    ...NAV_ITEMS.map((item) => {
      const isActive = item.aliases.includes(activeRoute);
      return el(
        'button',
        {
          type: 'button',
          className: `nav-item focusable ${isActive ? 'is-active' : ''}`,
          'aria-current': isActive ? 'page' : undefined,
          dataset: { route: item.id },
          onClick: () => store.navigate(item.id),
        },
        icon(item.icon, 18),
        el('span', null, item.label)
      );
    })
  );
}

export function renderSubpageHeader(title, subtitle, store, extraActions = null) {
  return el(
    'div',
    { className: 'page-header-row' },
    el(
      'div',
      { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;' },
      el(
        'button',
        {
          type: 'button',
          className: 'btn focusable',
          onClick: () => store.goBack(),
        },
        icon('back', 18),
        'رجوع'
      ),
      el(
        'div',
        null,
        el('h1', { style: 'font-size: var(--text-xl);' }, title),
        subtitle ? el('p', { className: 'card-subtitle' }, subtitle) : null
      )
    ),
    extraActions
  );
}
