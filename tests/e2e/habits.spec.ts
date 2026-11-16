import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('Habits', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/#home');
  });

  test('adds a habit and checks it in from Home and Plan', async ({ page }) => {
    await page.click('[data-action="habit-add"]');
    await page.fill('#habit-name', 'Stretch');
    await page.selectOption('select[aria-label="Habit schedule"]', 'weekdays');
    await page.click('[data-action="habit-create"]');

    const check = page.locator('[data-action="habit-check"]').first();
    await expect(check).toHaveAttribute('aria-pressed', 'false');
    await check.click();
    await expect(check).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.habit-streak').first()).toContainText('1');

    await page.goto('/#plan');
    const planCheck = page.locator('[data-action="habit-check"]').first();
    await expect(planCheck).toHaveAttribute('aria-pressed', 'true');
    await planCheck.click();
    await expect(planCheck).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.locator('.habit-name').first()).toContainText('Stretch');
  });
});
