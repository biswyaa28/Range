import { test, expect } from '@playwright/test';

const routes = ['home', 'plan', 'tasks', 'notes', 'focus', 'insights', 'inbox', 'settings'] as const;

// Inline text links are the documented exception; everything else must be
// at least 44x44 on a coarse pointer.
const INLINE_LINK_EXCEPTION =
  'a[href]:not([role="button"]):not(.btn):not(.ibtn):not(.sbtn):not(.tab)';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem('personalOS_v1');
    const data = raw ? JSON.parse(raw) : {};
    data.profile = { ...(data.profile || {}), onboarded: true };
    window.localStorage.setItem('personalOS_v1', JSON.stringify(data));
  });
});

for (const route of routes) {
  test(`${route} controls meet the 44px touch target`, async ({ page }) => {
    await page.goto(`/#${route}`);
    await expect(page.locator('main h1').first()).toBeVisible();

    const small = await page.evaluate((exception) => {
      const selector =
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="tab"]';
      const failures: string[] = [];
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (el.matches(exception)) return;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        if (rect.width < 44 || rect.height < 44) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 40);
          failures.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      });
      return failures;
    }, INLINE_LINK_EXCEPTION);

    expect(small).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
