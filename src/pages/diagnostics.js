import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { toArabicDigits } from '../services/clock.js';
import { collectTvDiagnostics } from '../services/diagnostics.js';

export function renderDiagnosticsPage(snapshot, store) {
  const { runtime } = snapshot;
  const diag = collectTvDiagnostics();

  const specRow = (label, value, ok = null) =>
    el(
      'div',
      { className: 'list-item' },
      el('strong', null, label),
      el(
        'span',
        {
          className: ok === null ? 'badge' : ok ? 'badge badge--success' : 'badge badge--warning',
          style: 'overflow-wrap:anywhere;white-space:normal;',
        },
        value
      )
    );

  const hardwareCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, icon('tv', 20), 'قياسات الشاشة والمتصفح (المرحلة صفر)'),
    el(
      'div',
      { className: 'list-stack' },
      specRow('أبعاد العرض الفعلية (Viewport)', `${toArabicDigits(diag.viewportWidth)} × ${toArabicDigits(diag.viewportHeight)} (${diag.resolutionTier})`),
      specRow('دقة اللوحة المعلنة (Screen)', `${toArabicDigits(diag.screenWidth)} × ${toArabicDigits(diag.screenHeight)} · DPR ${diag.dpr}`),
      specRow('نسبة العرض ١٦:٩', diag.isLandscape16x9 ? 'متوافقة' : 'شاشة غير ١٦:٩ أو نافذة مقلصة', diag.isLandscape16x9),
      specRow('التخزين المحلي (localStorage)', diag.localStorageOk ? 'يعمل ويحفظ البيانات' : 'غير مدعوم أو محجوب', diag.localStorageOk),
      specRow('التقويم الهجري المدمج بالمتصفح', diag.islamicCalendarSupported ? 'مدعوم (أم القرى)' : 'غير مدعوم — يعمل البديل الحسابي المحلي', diag.islamicCalendarSupported),
      specRow('دعم CSS Grid والمتغيرات', diag.cssGridAndVarsSupported ? 'مدعوم' : 'جزئي', diag.cssGridAndVarsSupported),
      specRow('دعم الصوت (Audio & WebAudio)', diag.audioElementSupported && diag.webAudioSupported ? 'متاح — يتطلب تفعيل التفاعل' : 'دعم جزئي', diag.audioElementSupported),
      specRow('الشبكة (fetch + AbortController)', diag.fetchSupported && diag.online ? 'متاح ومتصل' : diag.fetchSupported ? 'متاح (الشبكة مفصولة)' : 'غير متاح', diag.fetchSupported),
      specRow('معرف المتصفح (User-Agent)', diag.userAgent)
    )
  );

  const interactiveCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, 'اختبارات الريموت والصوت وحدود الأمان'),
    el(
      'div',
      { style: 'display:flex;gap:10px;flex-wrap:wrap;' },
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary focusable',
          onClick: async () => {
            const res = await store.audio.unlockAndTest();
            store.pushToast(res.ok ? 'نجح اختبار الصوت!' : res.reason, res.ok ? 'info' : 'danger');
          },
        },
        icon('volume', 18),
        'اختبار تشغيل الصوت'
      ),
      el(
        'button',
        {
          type: 'button',
          className: `btn focusable ${runtime.overscanGuideVisible ? 'btn--gold' : ''}`,
          onClick: () => store.toggleOverscanGuide(),
        },
        runtime.overscanGuideVisible ? 'إخفاء إطار الأمان ٤٪' : 'إظهار إطار الأمان ٤٪'
      )
    ),
    el(
      'div',
      { className: 'card', style: 'background:var(--bg-subtle);margin-top:8px;' },
      el('strong', null, 'اختبار أزرار الريموت الحية'),
      el('p', { className: 'card-subtitle' }, 'اضغط أي زر في ريموت التلفاز أو لوحة المفاتيح لعرض الرمز الفعلي الذي يرسله المتصفح:'),
      el(
        'div',
        {
          id: 'diag-keys-log',
          className: 'tabular-nums',
          style: 'font-weight:700;min-height:28px;overflow-wrap:anywhere;',
        },
        runtime.observedKeys.length > 0
          ? runtime.observedKeys.map((k) => `${k.key} (code: ${k.code || '-'}, keyCode: ${k.keyCode})`).join(' | ')
          : 'بانتظار ضغطة زر من الريموت...'
      )
    ),
    el(
      'p',
      { className: 'meta-source' },
      'ملاحظة: بعد إتمام هذا الفحص على تلفاز توشيبا الحقيقي، سجّل الطراز والنتائج في docs/tv-test-report-template.md.'
    )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('فحص التلفاز والمتصفح (المرحلة صفر)', 'أداة التحقق العملي على تلفاز توشيبا قبل اعتماد التشغيل الدائم', store),
    el('div', { className: 'grid-2' }, hardwareCard, interactiveCard)
  );
}
