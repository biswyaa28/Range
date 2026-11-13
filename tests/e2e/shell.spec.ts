import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('App Shell Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('desktop navigation, theme toggle, accent switch, keys 1-9', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Check no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verify initial route is Home/Today
    await expect(page.locator('.crumb')).toContainText('Home');
    await expect(page.locator('.crumb')).toContainText('Today');

    // Desktop top tabs exist, mobile tabbar is hidden
    await expect(page.locator('#topbar .tabs')).toBeVisible();
    await expect(page.locator('#tabbar')).toBeHidden();

    // Navigate to Plan tab
    await page.click('#topbar button[data-tab="plan"]');
    await expect(page).toHaveURL(/#plan/);
    await expect(page.locator('.crumb')).toContainText('Plan');

    // Navigate using key shortcuts (key 3 for tasks, key 9 for settings)
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('.crumb')).toContainText('Tasks');

    await page.keyboard.press('9');
    await expect(page).toHaveURL(/#settings/);
    await expect(page.locator('.crumb')).toContainText('Settings');

    // Theme toggle in Settings
    const lightOption = page.locator('button.seg-btn:has-text("Light")');
    await lightOption.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const darkOption = page.locator('button.seg-btn:has-text("Dark")');
    await darkOption.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Accent swatch changes --accent CSS var
    const blueSwatch = page.locator('button[data-accent="blue"]');
    await blueSwatch.click();
    const accentVar = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    });
    expect(accentVar.toLowerCase()).toBe('#0a84ff');    expect(consoleErrors).toHaveLength(0);
  });

  test('deep links keep breadcrumbs and sub-tabs in step', async ({ page }) => {
    await page.goto('/#deadlines');
    await expect(page.locator('.crumb')).toContainText('Deadlines');
    await expect(page.locator('.view-head h1')).toHaveText('Deadlines');

    await page.goto('/#prompter');
    await expect(page.locator('.crumb')).toContainText('Prompter');
    await expect(page.getByRole('radio', { name: 'Prompter' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Switching panels updates the hash so refresh and Back agree with the UI.
    await page.getByRole('radio', { name: 'Pomodoro' }).click();
    await expect(page).toHaveURL(/#focus$/);
    await expect(page.locator('.crumb')).toContainText('Pomodoro & sounds');

    await page.goto('/#plan');
    await page.getByRole('radio', { name: 'Deadlines' }).click();
    await expect(page).toHaveURL(/#deadlines$/);
    await expect(page.locator('.crumb')).toContainText('Deadlines');

    // Legacy number shortcuts land on the matching sub-tab.
    await page.goto('/#home');
    await page.keyboard.press('5');
    await expect(page).toHaveURL(/#deadlines$/);
    await page.keyboard.press('8');
    await expect(page).toHaveURL(/#prompter$/);
  });
});


test.describe('App Shell Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile bottom tab bar works and no horizontal overflow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Check no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Desktop tabs should be hidden, bottom tabbar should be visible
    await expect(page.locator('#topbar .tabs')).toBeHidden();
    await expect(page.locator('#tabbar')).toBeVisible();

    // Navigate via bottom tabbar
    const planTab = page.locator('#tabbar .tab:has-text("Plan")');
    await planTab.click();
    await expect(page).toHaveURL(/#plan/);
    await expect(page.locator('.crumb')).toContainText('Plan');

    const tasksTab = page.locator('#tabbar .tab:has-text("Tasks")');
    await tasksTab.click();
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('.crumb')).toContainText('Tasks');

    expect(consoleErrors).toHaveLength(0);
  });
});

