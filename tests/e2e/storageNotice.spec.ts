import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const TASKS = Array.from({ length: 20 }, (_, index) => ({
  id: `t-${index + 1}`,
  title: `Seeded task ${index + 1}`,
  due: null,
  priority: 'med',
  done: false,
  category: '',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deleted: false,
  deviceId: 'e2e',
}));

/** Seeds an onboarded save, then makes both persistence keys reject writes. */
async function installFailingStorage(page: Page): Promise<void> {
  await page.addInitScript((tasks) => {
    window.localStorage.setItem(
      'personalOS_v1',
      JSON.stringify({ profile: { onboarded: true }, tasks }),
    );

    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'personalOS_v1' || key === 'personalOS_settings_v1') {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  }, TASKS);
}

async function waitForAnimations(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const el = document.querySelector(target);
    return Boolean(el && el.getAnimations().every((animation) => animation.playState !== 'running'));
  }, selector);
}

test.describe('Storage failure warning', () => {
  test.use({ viewport: { width: 1280, height: 500 } });

  test('stays in the viewport while the page scrolls', async ({ page }) => {
    await installFailingStorage(page);
    await page.goto('/#tasks');

    const notice = page.getByRole('alert');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Changes aren't being saved.");

    // The recovery export must work even though persistence is failing.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^personal-os-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(notice.getByRole('status')).toContainText('Backup saved as');

    const canScroll = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 200,
    );
    expect(canScroll).toBe(true);

    const rect = () =>
      page.evaluate(() => {
        const el = document.querySelector('[role="alert"]');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });

    await waitForAnimations(page, '[role="alert"]');
    const before = await rect();
    expect(before).not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForFunction(() => window.scrollY > 200);

    const after = await rect();
    expect(after).not.toBeNull();
    // Fixed positioning means the viewport-relative box does not move.
    expect(Math.abs((after?.top ?? 0) - (before?.top ?? 0))).toBeLessThanOrEqual(1);
    expect(after?.top ?? -1).toBeGreaterThanOrEqual(0);
    expect(after?.bottom ?? Infinity).toBeLessThanOrEqual(500);

    // A toast must stack above the banner instead of covering it.
    await page.fill('#qadd-in', 'Toast clearance check');
    await page.press('#qadd-in', 'Enter');
    const toast = page.locator('.toast').last();
    await expect(toast).toBeVisible();
    await waitForAnimations(page, '.toast');

    const clearance = await page.evaluate(() => {
      const noticeEl = document.querySelector('[role="alert"]');
      const toastEl = document.querySelector('.toast');
      if (!noticeEl || !toastEl) return null;
      return {
        toastBottom: toastEl.getBoundingClientRect().bottom,
        noticeTop: noticeEl.getBoundingClientRect().top,
      };
    });
    expect(clearance).not.toBeNull();
    expect(clearance?.toastBottom ?? Infinity).toBeLessThanOrEqual(
      (clearance?.noticeTop ?? 0) - 4,
    );
  });
});

test.describe('Storage failure warning mobile', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('fits above the tab bar with readable buttons and toasts', async ({ page }) => {
    await installFailingStorage(page);
    await page.goto('/#tasks');

    const notice = page.getByRole('alert');
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export backup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry saving' })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await waitForAnimations(page, '[role="alert"]');

    const layout = await page.evaluate(() => {
      const noticeEl = document.querySelector('[role="alert"]');
      const tabbarEl = document.querySelector('#tabbar');
      if (!noticeEl || !tabbarEl) return null;
      const noticeBox = noticeEl.getBoundingClientRect();
      const tabbarBox = tabbarEl.getBoundingClientRect();
      return {
        left: noticeBox.left,
        right: noticeBox.right,
        bottom: noticeBox.bottom,
        tabbarTop: tabbarBox.top,
      };
    });
    expect(layout).not.toBeNull();
    expect(layout?.left ?? -1).toBeGreaterThanOrEqual(0);
    expect(layout?.right ?? Infinity).toBeLessThanOrEqual(390);
    // 4px breathing room above the floating tab bar.
    expect(layout?.bottom ?? Infinity).toBeLessThanOrEqual((layout?.tabbarTop ?? 0) - 4);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    await downloadPromise;
    await expect(notice.getByRole('status')).toContainText('Backup saved as');

    // The inline message makes the banner taller; toasts must still clear it.
    await page.fill('#qadd-in', 'Mobile toast clearance');
    await page.press('#qadd-in', 'Enter');
    await expect(page.locator('.toast').last()).toBeVisible();
    await waitForAnimations(page, '.toast');

    const clearance = await page.evaluate(() => {
      const noticeEl = document.querySelector('[role="alert"]');
      const toastEl = document.querySelector('.toast');
      if (!noticeEl || !toastEl) return null;
      return {
        toastBottom: toastEl.getBoundingClientRect().bottom,
        noticeTop: noticeEl.getBoundingClientRect().top,
      };
    });
    expect(clearance).not.toBeNull();
    expect(clearance?.toastBottom ?? Infinity).toBeLessThanOrEqual(
      (clearance?.noticeTop ?? 0) - 4,
    );
  });
});
