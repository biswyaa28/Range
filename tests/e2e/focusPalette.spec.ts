import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './support';

async function loadDemo(page: Page) {
  await page.goto('/#settings');
  await page.click('[data-action="demo-load"]');
  await expect(page.locator('[data-action="demo-remove"]')).toBeVisible();
  await page.goto('/#home');
  await expect(page.locator('.bento .card').first()).toBeVisible();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

// The real Fullscreen API depends on browser chrome; these specs cover the
// fixed-overlay fallback so Esc and the overlay itself are deterministic.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        value: undefined,
        configurable: true,
      });
    } catch {
      // leave the native API alone
    }
  });
});

test.describe('Focus mode and command palette desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 900 } });

  test('F opens focus mode, the timer survives Esc and runs on the Focus tab', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await loadDemo(page);

    await page.keyboard.press('f');
    await expect(page.locator('.fm')).toBeVisible();
    await expect(page.locator('#fm-time')).toHaveText('25:00');
    await expect(page.locator('#fm-mode')).toHaveText('Focus');
    await expect(page.getByLabel('Session label')).not.toHaveValue('');

    await page.click('#fm-start');
    await expect(page.locator('#fm-start')).toHaveText('Pause');
    await page.waitForTimeout(1200);

    await page.keyboard.press('Escape');
    await expect(page.locator('.fm')).toHaveCount(0);

    // The timer keeps running after the overlay closes.
    await page.keyboard.press('g');
    await page.keyboard.press('f');
    await expect(page).toHaveURL(/#focus/);
    await expect(page.locator('#pomo-start-btn')).toHaveText('Pause');
    await expect(page.locator('#pomo-time')).toHaveText(/24:5\d/);

    expect(consoleErrors).toHaveLength(0);
  });

  test('palette navigates, remembers recents and opens a live task result', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await loadDemo(page);

    await page.keyboard.press('Control+k');
    await expect(page.locator('.pal')).toBeVisible();
    await expect(page.locator('#pal-q')).toBeFocused();
    await page.fill('#pal-q', 'plan');
    await expect(page.locator('.pal-row').first()).toContainText('Plan');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#plan/);
    await expect(page.locator('.pal')).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await expect(page.locator('.pal-hdr').first()).toHaveText('Recent');
    await page.fill('#pal-q', 'Finish OS assignment');
    const taskResult = page.locator(
      '.pal-row:has-text("Finish OS assignment write-up")',
    );
    await expect(taskResult).toBeVisible();
    await expect(taskResult).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('.modal-title')).toHaveText('Edit task');
    await expect(page.locator('#edit-task-title')).toHaveValue(
      'Finish OS assignment write-up',
    );

    expect(consoleErrors).toHaveLength(0);
  });

  test('chords, Shift+N and the typing guard respect the current surface', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await loadDemo(page);

    await page.keyboard.press('g');
    await expect(page.locator('.cchip')).toHaveClass(/show/);
    await expect(page.locator('.cchip')).toHaveText('g…');
    await page.keyboard.press('p');
    await expect(page).toHaveURL(/#plan/);

    await page.keyboard.press('g');
    await page.keyboard.press('t');
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('#todo-title')).toBeVisible();

    // Typing must never leak into global shortcuts.
    await page.locator('#todo-title').fill('focus mode test');
    await page.keyboard.type('gh');
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('.fm')).toHaveCount(0);

    await page.locator('#todo-title').blur();
    await page.keyboard.press('Shift+n');
    await expect(page).toHaveURL(/#plan/);
    await expect(page.locator('.modal-title')).toHaveText('New block');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-container')).toHaveCount(0);

    await page.keyboard.press('n');
    await expect(page.locator('.cchip')).toHaveText('n…');
    await page.keyboard.press('t');
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('#todo-title')).toBeFocused();

    expect(consoleErrors).toHaveLength(0);
  });

  test('prompter enters reading mode and responds to keyboard controls', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/#focus');

    await page.getByRole('radio', { name: 'Prompter' }).click();
    await page.fill('[aria-label="Prompter script"]', 'Opening line.\n\nSecond beat.');
    await page.getByRole('button', { name: /Open reading mode/ }).click();

    await expect(page.locator('.pr-overlay')).toBeVisible();
    await expect(page.locator('.pr-text')).toContainText('Opening line.');

    await page.keyboard.press('m');
    await expect(page.locator('.pr-stage')).toHaveClass(/mirror/);

    await page.keyboard.press('=');
    await expect(page.locator('.pr-text')).toHaveCSS('font-size', '56px');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Speed 4')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause scrolling' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.pr-overlay')).toHaveCount(0);

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Focus mode and palette mobile (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('touch targets, overlay exit and palette stay inside the viewport', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await loadDemo(page);
    await page.goto('/#focus');
    await noOverflow(page);

    await page.getByRole('button', { name: 'Enter focus mode' }).click();
    await expect(page.locator('.fm')).toBeVisible();
    await noOverflow(page);

    for (const selector of [
      '.fm-exit',
      '[data-fmnoise="white"]',
      '[data-fmnoise="pink"]',
      '[data-fmnoise="brown"]',
      '[data-fmact="sleep"]',
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    }

    await page.locator('.fm-exit').click();
    await expect(page.locator('.fm')).toHaveCount(0);

    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('.pal')).toBeVisible();
    await noOverflow(page);
    await page.fill('#pal-q', 'plan');
    await page.locator('#pal-list .pal-row:has-text("Plan")').first().click();
    await expect(page).toHaveURL(/#plan/);
    await noOverflow(page);

    expect(consoleErrors).toHaveLength(0);
  });
});
