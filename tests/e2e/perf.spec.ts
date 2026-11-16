import { test, expect } from '@playwright/test';
import { seedStressProfile, STRESS_COUNT } from './stressSeed';

test.describe('5,000-task performance', () => {
  test.setTimeout(60_000);
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders in under 1.5s, keeps the DOM small, and reaches the last row', async ({ page }) => {
    await seedStressProfile(page, STRESS_COUNT);

    const started = Date.now();
    await page.goto('/#tasks');
    await expect(page.locator('[data-virtual-index="0"]')).toBeVisible({ timeout: 5000 });
    const initialRenderMs = Date.now() - started;

    const metrics = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint');
      const navigation = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return {
        fcp: paint.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null,
        domInteractive: navigation?.domInteractive ?? null,
        domRows: document.querySelectorAll('[data-virtual-index]').length,
      };
    });

    console.log(
      `perf: initial=${initialRenderMs}ms fcp=${Math.round(metrics.fcp ?? 0)}ms domInteractive=${Math.round(metrics.domInteractive ?? 0)}ms domRows=${metrics.domRows}`,
    );

    expect(initialRenderMs).toBeLessThan(1500);
    expect(metrics.domRows).toBeLessThan(200);
    expect(metrics.domRows).toBeGreaterThan(0);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
    }
    await expect(page.locator('[data-virtual-index="4999"]')).toBeVisible({ timeout: 5000 });
    expect(await page.locator('[data-virtual-index]').count()).toBeLessThan(200);
  });
});
