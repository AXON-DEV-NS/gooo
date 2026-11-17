import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { DEFAULT_WEEKLY_SCHEDULE } from '../data/study-schedule.js';
import { toArabicDigits } from '../services/clock.js';
import {
  createTaskRecord,
  cycleTaskStatus,
  getTaskStatusLabel,
  sortTasks,
} from '../services/domain.js';

const QUICK_PRESETS = [
  { title: 'جلسة مذاكرة أساسية', category: 'مذاكرة', startTime: '16:00', endTime: '17:00', priority: 'عالية' },
  { title: 'مراجعة وتلخيص الدرس', category: 'مراجعة', startTime: '17:30', endTime: '18:15', priority: 'متوسطة' },
  { title: 'حل الواجب والتمرينات', category: 'مدرسة', startTime: '19:30', endTime: '20:30', priority: 'عالية' },
];

export function renderTasksPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const tasks = sortTasks(appState.tasks);
  const studyPlan = runtime.studyPlan;
  const weeklyStats = runtime.weeklyStats;

  const canSwapToday = (studyPlan?.blocks || []).filter((b) => b.kind === 'study_block').length >= 2;
  const smartStudyCard = el(
    'section',
    { className: 'card card--hero' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, `جدول المذاكرة الذكي — ${studyPlan?.dayName || 'اليوم'}`),
      el(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' },
        el('span', { className: 'badge badge--primary tabular-nums' }, `إنجاز الأسبوع: ${toArabicDigits(weeklyStats?.completedHours ?? 0)} / ${toArabicDigits(weeklyStats?.targetHours ?? 12)} س`),
        el('span', { className: 'badge badge--gold tabular-nums' }, `المراكم المتبقي: ${toArabicDigits(weeklyStats?.backlogRemaining ?? 9)}`),
        canSwapToday
          ? el(
              'button',
              { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.studyActions.swapTodayBlocks() },
              'تبديل ترتيب البلوكين'
            )
          : null,
        el(
          'button',
          {
            type: 'button',
            className: `btn btn--sm focusable ${studyPlan?.shiftOverridden ? 'btn--warning' : ''}`,
            onClick: () => store.studyActions.toggleShiftOverrideToday(),
          },
          studyPlan?.shiftOverridden ? 'تفعيل الإزاحة التلقائية للصلاة' : 'تجاوز إزاحة الصلاة اليوم'
        )
      )
    ),
    studyPlan?.holidayStatus === 'eid'
      ? el('p', { className: 'badge badge--success', style: 'white-space:normal;' }, studyPlan.holidayMessage)
      : el(
          'div',
          { className: 'list-stack' },
          ...(studyPlan?.blocks || []).map((b) =>
            el(
              'div',
              { className: `list-item ${b.completed ? 'list-item--done' : ''}` },
              el(
                'div',
                { style: 'min-width:0;' },
                el(
                  'div',
                  { style: 'font-weight:700;' },
                  `${b.subject} `,
                  el('span', { className: 'badge' }, b.tag),
                  b.wasShifted ? el('span', { className: 'badge badge--warning', style: 'margin-right:6px;' }, b.shiftReason) : null
                ),
                el(
                  'div',
                  { className: 'card-subtitle tabular-nums' },
                  `${toArabicDigits(b.startTime)} – ${toArabicDigits(b.endTime)}${b.wasShifted ? ` (الأصلي: ${toArabicDigits(b.originalStartTime)}–${toArabicDigits(b.originalEndTime)})` : ''} · ${b.guideText}`
                )
              ),
              b.isFreeRest
                ? el('span', { className: 'badge badge--success' }, 'استرح')
                : el(
                    'div',
                    { style: 'display:flex;gap:8px;flex-shrink:0;' },
                    el(
                      'button',
                      {
                        type: 'button',
                        dataset: { focusId: `study-block-start-${b.id}` },
                        className: 'btn btn--sm focusable',
                        onClick: () => {
                          store.studyActions.startBlock(b);
                          store.navigate('focus');
                        },
                      },
                      'بدء البلوك'
                    ),
                    el(
                      'button',
                      {
                        type: 'button',
                        'aria-pressed': b.completed ? 'true' : 'false',
                        dataset: { focusId: `study-block-done-${b.id}` },
                        className: `btn btn--sm focusable ${b.completed ? 'btn--primary' : ''}`,
                        onClick: () => store.studyActions.toggleBlockDone(b),
                      },
                      b.completed ? '✓ منجز' : '✓ تعليم منجز'
                    )
                  )
            )
          )
        ),
    el(
      'details',
      { style: 'margin-top:6px;' },
      el('summary', { className: 'btn btn--sm focusable', style: 'display:inline-flex;' }, 'عرض الجدول الأسبوعي الكامل (السبت – الجمعة)'),
      el(
        'div',
        { className: 'grid-3', style: 'margin-top:10px;' },
        ...[6, 0, 1, 2, 3, 4, 5].map((wd) => {
          const day = DEFAULT_WEEKLY_SCHEDULE[wd];
          const customDay = appState.settings.study?.customBlocksByDay?.[String(wd)];
          const dayBlocks = Array.isArray(customDay) && customDay.length > 0 ? customDay : day.blocks;
          return el(
            'div',
            { className: 'card', style: 'background:var(--bg-elevated);' },
            el('strong', null, day.dayName),
            el('span', { className: 'card-subtitle' }, day.note),
            ...dayBlocks.map((db) =>
              el(
                'div',
                { className: 'meta-source tabular-nums' },
                `${toArabicDigits(db.startTime)}: ${db.subject === 'مرن' ? appState.settings.study?.weakestSubject || 'مرن' : db.subject} [${db.tag}]`
              )
            )
          );
        })
      )
    )
  );

  const titleInput = el('input', {
    type: 'text',
    className: 'input focusable',
    placeholder: 'عنوان المهمة أو الحصة...',
    maxlength: 120,
  });
  const startInput = el('input', { type: 'time', className: 'input focusable', value: '16:00' });
  const endInput = el('input', { type: 'time', className: 'input focusable', value: '17:00' });
  const categorySelect = el(
    'select',
    { className: 'select focusable' },
    el('option', { value: 'مذاكرة' }, 'مذاكرة'),
    el('option', { value: 'مدرسة' }, 'مدرسة / دروس'),
    el('option', { value: 'مراجعة' }, 'مراجعة'),
    el('option', { value: 'ورد' }, 'ورد يومي'),
    el('option', { value: 'تنظيم' }, 'تنظيم')
  );
  const prioritySelect = el(
    'select',
    { className: 'select focusable' },
    el('option', { value: 'عالية' }, 'أولوية عالية'),
    el('option', { value: 'متوسطة', selected: true }, 'أولوية متوسطة'),
    el('option', { value: 'عادية' }, 'أولوية عادية')
  );

  function addTaskFromForm(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      store.pushToast('أدخل عنوان المهمة أولاً.', 'warning');
      return;
    }
    const created = createTaskRecord({
      title,
      category: categorySelect.value,
      startTime: startInput.value || '16:00',
      endTime: endInput.value || '17:00',
      priority: prioritySelect.value,
    });
    store.updateAppState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, created],
    }));
    titleInput.value = '';
    store.pushToast('تمت إضافة المهمة إلى الجدول.', 'info');
  }

  const addFormCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, icon('plus', 18), 'إضافة مهمة أو فترة دراسية'),
    el(
      'div',
      { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' },
      el('span', { className: 'card-subtitle' }, 'إضافة سريعة بالريموت:'),
      ...QUICK_PRESETS.map((preset) =>
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn--sm focusable',
            onClick: () => {
              const created = createTaskRecord(preset);
              store.updateAppState((prev) => ({
                ...prev,
                tasks: [...prev.tasks, created],
              }));
              store.pushToast(`أضيفت: ${preset.title}`, 'info');
            },
          },
          `+ ${preset.title}`
        )
      )
    ),
    el(
      'form',
      { onSubmit: addTaskFromForm, className: 'grid-3', style: 'align-items:end;' },
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'العنوان'), titleInput),
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'التصنيف'), categorySelect),
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'الأولوية'), prioritySelect),
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'وقت البداية'), startInput),
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'وقت النهاية'), endInput),
      el(
        'button',
        { type: 'submit', className: 'btn btn--primary focusable' },
        icon('plus', 18),
        'إضافة للجدول'
      )
    )
  );

  const listCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'جدول اليوم والمهام'),
      el('span', { className: 'badge' }, `${toArabicDigits(tasks.length)} مهام`)
    ),
    tasks.length === 0
      ? el('p', { className: 'card-subtitle' }, 'الجدول فارغ حالياً. استخدم أزرار الإضافة السريعة أعلاه.')
      : el(
          'div',
          { className: 'list-stack' },
          ...tasks.map((task) => {
            const itemClass =
              task.status === 'completed'
                ? 'list-item list-item--done'
                : task.status === 'in_progress'
                  ? 'list-item list-item--active'
                  : 'list-item';
            return el(
              'div',
              { className: itemClass, dataset: { rowKey: `task-${task.id}` } },
              el(
                'div',
                { style: 'min-width:0;overflow-wrap:anywhere;' },
                el('div', { style: 'font-weight:700;' }, task.title),
                el(
                  'div',
                  { className: 'card-subtitle tabular-nums' },
                  `${toArabicDigits(task.startTime)} – ${toArabicDigits(task.endTime)} · ${task.category} · أولوية ${task.priority} · ${getTaskStatusLabel(task.status)}`
                )
              ),
              el(
                'div',
                { style: 'display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;' },
                el(
                  'button',
                  {
                    type: 'button',
                    dataset: { focusId: `task-cycle-${task.id}` },
                    className: 'btn btn--primary btn--sm focusable',
                    onClick: () =>
                      store.updateAppState((prev) => ({
                        ...prev,
                        tasks: prev.tasks.map((t) =>
                          t.id === task.id
                            ? { ...t, status: cycleTaskStatus(t.status), updatedAt: new Date().toISOString() }
                            : t
                        ),
                      })),
                  },
                  task.status === 'pending'
                    ? 'بدء التنفيذ'
                    : task.status === 'in_progress'
                      ? 'إتمام'
                      : 'إعادة لغير مكتمل'
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    dataset: { focusId: `task-delete-${task.id}` },
                    className: 'btn btn--danger btn--sm focusable',
                    onClick: () =>
                      store.setModal({
                        title: 'تأكيد حذف المهمة',
                        body: `هل تريد حذف «${task.title}» من الجدول؟`,
                        confirmLabel: 'حذف',
                        confirmDanger: true,
                        onConfirm: () => {
                          store.updateAppState((prev) => ({
                            ...prev,
                            tasks: prev.tasks.filter((t) => t.id !== task.id),
                          }));
                        },
                      }),
                  },
                  icon('trash', 16),
                  'حذف'
                )
              )
            );
          })
        )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader(
      'المذاكرة والجدول اليومي',
      'جدول المذاكرة الأسبوعي والمهام مرتبة بالتكيّف التلقائي للصلاة والمناسبات',
      store,
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary focusable',
          onClick: () => store.navigate('focus'),
        },
        icon('clock', 18),
        'مؤقت البلوك والتركيز'
      )
    ),
    smartStudyCard,
    addFormCard,
    listCard
  );
}
