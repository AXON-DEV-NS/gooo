// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from '../main.js';
import { parseAndValidateBackup } from '../storage/backup.js';

describe('UI shell and sample backup integration', () => {
  let mounted = null;

  afterEach(() => {
    mounted?.destroy?.();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('validates src/data/sample-backup.json strictly', () => {
    const raw = fs.readFileSync(path.resolve('src/data/sample-backup.json'), 'utf8');
    const parsed = parseAndValidateBackup(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary.tasksCount).toBe(2);
    expect(parsed.summary.habitDaysCount).toBe(1);
    expect(parsed.summary.backlogRemaining).toBe(8);
  });

  it('mounts home dashboard and navigates cleanly across all 8 routes', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    mounted = mountApp(root);
    expect(root.textContent).toContain('جووو');
    expect(root.textContent).toContain('الصلاة القادمة');
    expect(root.textContent).toContain('تفعيل الصوت');
    expect(root.textContent).toContain('المراكم:');

    // محاكاة انقطاع الإنترنت -> تحول مؤشر الحالة إلى وضع العمل المحلي
    window.dispatchEvent(new Event('offline'));
    expect(root.textContent).toContain('وضع العمل المحلي (بدون إنترنت) — الحساب الفلكي نشط');

    // شريط التنقل السفلي موحد في ٦ تبويبات نظيفة
    expect(root.querySelectorAll('.bottom-nav .nav-item')).toHaveLength(6);

    const routes = ['prayer', 'study', 'quran', 'habits', 'content', 'focus', 'settings', 'diagnostics'];
    for (const r of routes) {
      mounted.store.navigate(r);
      expect(mounted.store.getSnapshot().runtime.route).toBe(r);
      expect(root.querySelector('main')?.textContent?.length).toBeGreaterThan(20);
    }

    // زر الرجوع يعود للخلف إلى صفحة الإعدادات ويتحقق من وجود الأقسام كلها
    mounted.store.goBack();
    expect(mounted.store.getSnapshot().runtime.route).toBe('settings');
    expect(root.textContent).toContain('جدول المذاكرة الذكي والتوقيت المتكيف');
    expect(root.textContent).toContain('شاشة التوقف والخلفيات المتحركة');
    expect(root.textContent).toContain('القرآن الكريم ووضع النوم');
    expect(root.textContent).toContain('قيام الليل الاختياري');
  });
});
