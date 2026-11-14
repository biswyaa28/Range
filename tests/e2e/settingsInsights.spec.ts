import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './support';

function todayISO(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

async function readSaved(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('personalOS_v1');
    return raw ? JSON.parse(raw) : null;
  });
}

test.describe('Settings desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('persists appearance, haptics and profile; exports and imports a backup', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#tasks');
    await page.fill('#todo-title', 'Round trip task');
    await page.click('#todo-form button[type="submit"]');
    await expect(page.locator('.task-title:has-text("Round trip task")')).toBeVisible();

    await page.goto('/#settings');
    await expectNoOverflow(page);
    await expect(page.locator('.settings-about').first()).toContainText('Local-first');
    await expect(page.locator('.settings-about').first()).toContainText('v0.1.0');

    await page.click('button.seg-btn:has-text("Light")');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.click('[data-accent="pink"]');
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    );
    expect(accent.toLowerCase()).toBe('#ff5e9c');

    const haptics = page.getByRole('switch', { name: 'Haptic feedback' });
    await expect(haptics).toHaveAttribute('aria-checked', 'true');
    await haptics.click();
    await expect(haptics).toHaveAttribute('aria-checked', 'false');
    await page.click('[data-haptic-level="strong"]');
    await page.getByRole('switch', { name: 'Sound feedback' }).click();
    await page.fill('#pref-name', 'Ada');

    await page.waitForTimeout(150);
    const before = await readSaved(page);
    expect(before.profile.name).toBe('Ada');
    expect(before.profile.accent).toBe('pink');
    expect(before.profile.haptics).toEqual({ on: false, level: 'strong', sound: true });
    expect(before.settings.theme).toBe('light');

    await page.reload();
    await expect(page.locator('button.seg-btn:has-text("Light")')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('#pref-name')).toHaveValue('Ada');
    await expect(page.getByRole('switch', { name: 'Haptic feedback' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.locator('[data-haptic-level="strong"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('switch', { name: 'Sound feedback' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const reloadedAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    );
    expect(reloadedAccent.toLowerCase()).toBe('#ff5e9c');
    await expectNoOverflow(page);

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-action="export-data"]');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`personal-os-${todayISO()}.json`);

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    const backup = JSON.parse(readFileSync(filePath as string, 'utf8'));
    expect(backup.profile.name).toBe('Ada');
    expect(backup.tasks.some((task: { title: string }) => task.title === 'Round trip task')).toBe(
      true,
    );

    // Typed confirmation gate, then a full wipe.
    await page.click('[data-action="clear-data"]');
    const clearDialog = page.getByRole('dialog', { name: 'Clear data on this device' });
    await expect(clearDialog).toBeVisible();
    const clearConfirm = page.locator('[data-action="clear-confirm"]');
    await expect(clearConfirm).toBeDisabled();
    await page.fill('#clear-confirm-input', 'nope');
    await expect(clearConfirm).toBeDisabled();
    await expect(page.locator('#clear-confirm-input')).toHaveValue('nope');
    await page.fill('#clear-confirm-input', 'clear');
    await expect(clearConfirm).toBeEnabled();
    await clearConfirm.click();
    await expect(clearDialog).toBeHidden();

    await page.waitForTimeout(150);
    const cleared = await readSaved(page);
    expect(cleared.tasks).toHaveLength(0);
    expect(cleared.blocks).toHaveLength(0);
    expect(typeof cleared.clearedAt).toBe('string');
    expect(cleared.clearedAt.length).toBeGreaterThan(0);

    // Import the exported file back and prove the data returns.
    await page.setInputFiles('#imp-file', filePath as string);
    const importDialog = page.getByRole('dialog', { name: 'Import backup' });
    await expect(importDialog).toBeVisible();
    await expect(importDialog).toContainText('1 tasks');
    await page.click('[data-action="import-confirm"]');
    await expect(importDialog).toBeHidden();

    const restored = await readSaved(page);
    expect(restored.profile.name).toBe('Ada');
    expect(restored.tasks.some((task: { title: string }) => task.title === 'Round trip task')).toBe(
      true,
    );

    await page.reload();
    await expect(page.locator('#pref-name')).toHaveValue('Ada');
    expect(consoleErrors).toHaveLength(0);
  });

  test('searches settings and reorders Home widgets', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#settings');
    const search = page.getByLabel('Search settings');
    await search.fill('radius');
    await expect(page.getByRole('slider', { name: 'Corner radius' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear search field' }).click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expectNoOverflow(page);

    const widgets = page.locator('[data-widget-id]');
    await expect(widgets.nth(1)).toHaveAttribute('data-widget-id', 'weekly');
    await page.getByRole('button', { name: 'Move Focus up' }).click();
    await expect(widgets.nth(1)).toHaveAttribute('data-widget-id', 'focus');

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('personalOS_settings_v1');
          if (!raw) return -1;
          const parsed = JSON.parse(raw) as {
            data?: { homeWidgets?: { order?: string[] } };
          };
          return parsed.data?.homeWidgets?.order?.indexOf('focus') ?? -1;
        }),
      )
      .toBe(1);

    expect(consoleErrors).toHaveLength(0);
  });

  test('clear-all wipes data, records clearedAt, and first run returns on reload', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#settings');
    await page.fill('#pref-name', 'Ada');
    await page.click('[data-action="demo-load"]');
    await expect(page.locator('[data-action="demo-remove"]')).toBeVisible();

    const demo = await readSaved(page);
    expect(demo.settings.seeded).toBe(true);
    expect(demo.blocks.length).toBeGreaterThan(0);
    expect(demo.profile.onboarded).toBe(true);

    await page.click('[data-action="clear-data"]');
    await page.fill('#clear-confirm-input', 'clear');
    await page.click('[data-action="clear-confirm"]');
    await expect(page.getByRole('dialog', { name: 'Clear data on this device' })).toBeHidden();

    await page.waitForTimeout(150);
    const cleared = await readSaved(page);
    expect(cleared.blocks).toHaveLength(0);
    expect(cleared.tasks).toHaveLength(0);
    expect(cleared.notes).toHaveLength(0);
    expect(cleared.deadlines).toHaveLength(0);
    expect(cleared.settings.seeded).toBe(false);
    expect(cleared.profile.onboarded).toBe(false);
    expect(typeof cleared.clearedAt).toBe('string');

    // A wipe does not yank the current screen away; the next boot starts setup.
    await expect(
      page.getByRole('dialog', { name: 'Personalize Personal OS' }),
    ).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole('dialog', { name: 'Personalize Personal OS' }),
    ).toBeVisible();
    await expect(page.locator('.onb-count')).toHaveText('1 / 9');

    expect(consoleErrors).toHaveLength(0);
  });

  test('opens the keyboard cheat sheet from Settings', async ({ page }) => {
    await page.goto('/#settings');
    await page.click('[data-action="open-shortcuts"]');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  test('the device-clear modal separates local data from the cloud copy', async ({ page }) => {
    await page.goto('/#settings');
    await page.click('[data-action="clear-data"]');
    const dialog = page.getByRole('dialog', { name: 'Clear data on this device' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('from this device only');

    const confirm = page.locator('[data-action="clear-confirm"]');
    await expect(confirm).toBeDisabled();
    await page.fill('#clear-confirm-input', 'clear');
    await expect(confirm).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Insights desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('shows an honest empty state, then real demo history, on both ranges', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#insights');
    await expect(page.locator('.view-head h1')).toHaveText('Insights');
    await expect(page.getByText('No activity in this range yet')).toBeVisible();
    await expect(page.locator('[data-stat="completion"] .stat-big')).toHaveText('—');
    await expect(page.locator('[data-stat="tasks"] .stat-big')).toHaveText('0');
    await expect(page.locator('[data-stat="streak"] .stat-big')).toHaveText('0');
    await expect(page.locator('[data-stat="focus"] .stat-big')).toHaveText('0');
    await expect(page.locator('[data-health="steps"]')).toBeVisible();
    await expect(page.locator('[data-health="sleep"]')).toBeVisible();
    await expect(page.locator('[data-health="active"]')).toBeVisible();
    await expect(page.locator('.insights-health')).toContainText('Sample');
    await expectNoOverflow(page);

    await page.click('button.seg-btn:has-text("Last 30 days")');
    await expect(
      page.locator('svg[aria-label="Tasks done per day bar chart, last 30 days"]'),
    ).toBeVisible();
    await expect(page.locator('.insights-toolbar-note')).toHaveText(
      '0 active days in this range',
    );

    await page.getByRole('button', { name: 'Open plan' }).click();
    await expect(page).toHaveURL(/#plan/);

    await page.goto('/#settings');
    await page.click('[data-action="demo-load"]');
    await page.goto('/#insights');
    await expect(page.getByText('No activity in this range yet')).toBeHidden();
    await expect(page.locator('[data-stat="completion"] .stat-big')).not.toHaveText('—');
    await expect(page.locator('[data-stat="tasks"] .stat-big')).not.toHaveText('0');
    const chart = page.locator('svg[aria-label="Tasks done per day bar chart, this week"]');
    await expect(chart).toBeVisible();
    expect(await chart.locator('rect.cbar').count()).toBe(7);
    await expect(page.locator('.insights-chart-card').nth(1)).toContainText('Daily goal');
    await expect(page.locator('.insights-toolbar-note')).not.toHaveText(
      '0 active days in this range',
    );
    await expectNoOverflow(page);
    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Settings and Insights mobile (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test('settings and insights fit the viewport and keep their state', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#settings');
    await expectNoOverflow(page);
    await page.click('button.seg-btn:has-text("Dark")');
    await page.click('[data-accent="teal"]');
    await page.click('[data-haptic-level="light"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.waitForTimeout(150);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The theme is painted before the app bundle can run: stub out the module
    // so only index.html and theme-init.js execute.
    await page.route('**/src/main.tsx*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
    );
    await page.goto('/#settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const firstPaint = await page.evaluate(() => ({
      scheme: document.documentElement.style.colorScheme,
      background: getComputedStyle(document.documentElement).backgroundColor,
    }));
    expect(firstPaint.scheme).toBe('dark');
    expect(firstPaint.background).toBe('rgb(10, 10, 11)');
    await page.unroute('**/src/main.tsx*');
    await page.reload();

    await expect(page.locator('button.seg-btn:has-text("Dark")')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-haptic-level="light"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoOverflow(page);

    await page.goto('/#insights');
    await expectNoOverflow(page);
    await expect(page.getByText('No activity in this range yet')).toBeVisible();
    await expect(page.locator('[data-health="steps"]')).toBeVisible();

    await page.goto('/#settings');
    await page.click('[data-action="demo-load"]');
    await page.goto('/#insights');
    await expect(page.getByText('No activity in this range yet')).toBeHidden();
    await expect(page.locator('[data-stat="tasks"] .stat-big')).not.toHaveText('0');
    await expectNoOverflow(page);

    expect(consoleErrors).toHaveLength(0);
  });
});
