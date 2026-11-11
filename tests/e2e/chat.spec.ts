import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('AI chat desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('opens as a side panel and stores the key outside localStorage', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-action="open-chat"]');
    const panel = page.locator('.chat-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'side');
    await expect(page.locator('#chat-title')).toHaveText('AI chat');
    await expect(page.locator('[data-chat-setup]')).toBeVisible();

    await page.click('[data-action="close-chat"]');
    await expect(panel).toBeHidden();

    await page.keyboard.press('9');
    await expect(page).toHaveURL(/#settings/);

    const keyInput = page.getByLabel('AI API key');
    await expect(keyInput).toBeEnabled();
    await keyInput.fill('AIza-e2e-chat-key-123456');
    await page.click('[data-action="save-ai-key"]');
    await expect(page.locator('[data-ai-key-status="saved"]')).toBeVisible();

    const plaintext = await page.evaluate(() =>
      JSON.stringify(Object.entries(window.localStorage)),
    );
    expect(plaintext).not.toContain('AIza-e2e-chat-key-123456');

    await page.reload();
    await expect(page.locator('[data-ai-key-status="saved"]')).toBeVisible();

    await page.click('[data-action="open-chat"]');
    await expect(page.locator('[data-chat-setup]')).toHaveCount(0);
    await expect(page.getByLabel('Message AI')).toBeEnabled();
  });

  test('shows mocked theme and accent proposals, applies them, then undoes them', async ({ page }) => {
    let round = 0;
    await page.route('**/v1beta/models/**', async (route) => {
      round += 1;
      if (round > 1) {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'data: {"candidates":[{"content":{"parts":[{"text":"Done"}]}}]}\n\n',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"set_theme","args":{"theme":"dark"}}},{"functionCall":{"name":"set_accent","args":{"accent":"blue"}}}]}}]}\n\n',
        ].join(''),
      });
    });
    await page.goto('/#settings');
    const keyInput = page.getByLabel('AI API key');
    await keyInput.fill('AIza-e2e-action-key-123456');
    await page.click('[data-action="save-ai-key"]');
    await page.click('[data-action="open-chat"]');
    const input = page.getByLabel('Message AI');
    await input.fill('make it dark with a blue accent');
    await page.click('[data-action="chat-send"]');
    await expect(page.getByText('Switch theme')).toBeVisible();
    await expect(page.getByText('Change accent')).toBeVisible();
    await page.getByRole('button', { name: 'Apply Switch theme' }).click();
    await page.getByRole('button', { name: 'Apply Change accent' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('--accent', /.+/);
    const undos = page.getByRole('button', { name: 'Undo' });
    await expect(undos).toHaveCount(2);
    await page.click('[data-action="close-chat"]');
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('sends read-tool results back to Gemini for task analysis', async ({ page }) => {
    await page.addInitScript(() => {
      const key = 'personalOS_v1';
      const data = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      data.tasks = [{
        id: 'e2e-task',
        title: 'Revise algebra before Friday',
        due: '2099-01-02',
        priority: 'high',
        done: false,
        category: 'study',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deleted: false,
        deviceId: 'e2e',
      }];
      window.localStorage.setItem(key, JSON.stringify(data));
    });
    let round = 0;
    await page.route('**/v1beta/models/**', async (route) => {
      round += 1;
      if (round === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_tasks","args":{"filter":"pending"}}}]}}]}\n\n',
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"candidates":[{"content":{"parts":[{"text":"You have one pending task: Revise algebra before Friday."}]}}]}\n\n',
      });
    });
    await page.goto('/#settings');
    await page.getByLabel('AI API key').fill('AIza-e2e-task-key-123456');
    await page.click('[data-action="save-ai-key"]');
    await page.click('[data-action="open-chat"]');
    const input = page.getByLabel('Message AI');
    await input.fill('What are my pending tasks this week?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Revise algebra before Friday.')).toBeVisible();
  });
});

test.describe('AI chat mobile', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('opens as a bottom sheet without horizontal overflow', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-action="open-chat"]');
    const panel = page.locator('.chat-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-layout', 'sheet');

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeLessThanOrEqual(1);
      expect(box.width).toBeGreaterThanOrEqual(389);
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    await page.click('[data-action="close-chat"]');
    await expect(panel).toBeHidden();
  });
});
