import { test, expect, type Page } from '@playwright/test';

async function loadDemo(page: Page) {
  await page.goto('/#settings');
  await page.click('[data-action="demo-load"]');
  await expect(page.locator('[data-action="demo-remove"]')).toBeVisible();
  await page.goto('/#home');
  await expect(page.locator('.bento .card').first()).toBeVisible();
}

async function cardIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.card[data-card]')).map(
      (element) => element.dataset.card ?? '',
    ),
  );
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.describe('Home View Desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('greeting, search, drag, resize, hide, preset and persistence', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await loadDemo(page);
    await noOverflow(page);

    await expect(page.locator('.smart h1')).toContainText(/Good|Hey/);
    await expect(page.locator('.smart .live')).not.toBeEmpty();

    // Search finds a note by body text and opens it.
    await page.fill('#home-search', 'Raft');
    const noteResult = page.locator('#sres button:has-text("Reading list")');
    await expect(noteResult).toBeVisible();
    await noteResult.click();
    await expect(page).toHaveURL(/#notes/);
    await page.goto('/#home');

    // Scope chips narrow the live results.
    await page.fill('#home-search', 'Finish OS');
    await expect(page.locator('#sres button:has-text("Finish OS assignment write-up")')).toBeVisible();
    await page.click('.chips button:has-text("Blocks")');
    await expect(page.locator('#sres .empty-s')).toHaveText('No matches.');
    await page.click('.chips button:has-text("All")');
    await page.fill('#home-search', '');

    // Enter customize mode.
    await page.click('.cust');
    await expect(page.locator('.editbar')).toBeVisible();
    await expect(page.locator('.tray')).toBeVisible();
    await expect(page.locator('.card .rz').first()).toBeVisible();

    // Drag "Today's progress" after "Focus".
    const handle = page.locator('.card[data-card="progress"] [data-role="drag"]');
    const focusCard = page.locator('.card[data-card="focus"]');
    const handleBox = await handle.boundingBox();
    const focusBox = await focusCard.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(focusBox).not.toBeNull();
    if (handleBox && focusBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.move(focusBox.x + focusBox.width - 16, focusBox.y + focusBox.height / 2, {
        steps: 12,
      });
      await page.waitForTimeout(80);
      await page.mouse.up();
    }

    await expect
      .poll(async () => {
        const ids = await cardIds(page);
        return ids.indexOf('progress') > ids.indexOf('focus');
      })
      .toBe(true);

    // Resize today's tasks by two columns (M -> L) with the corner handle.
    const tasksCard = page.locator('.card[data-card="tasks"]');
    await tasksCard.scrollIntoViewIfNeeded();
    const bentoWidth = await page.locator('.bento').evaluate((element) => element.clientWidth);
    const column = (bentoWidth - 11 * 20) / 12;
    const resizeHandle = tasksCard.locator('.rz');
    const resizeBox = await resizeHandle.boundingBox();
    expect(resizeBox).not.toBeNull();
    if (resizeBox) {
      await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2 + 2 * (column + 20) + 10,
        resizeBox.y + resizeBox.height / 2,
        { steps: 12 },
      );
      await page.waitForTimeout(80);
      await page.mouse.up();
    }
    await expect(tasksCard).toHaveAttribute('data-size', 'L');

    await page.click('.editbar .pbtn:has-text("Done")');
    await noOverflow(page);

    // Reload: drag and resize persist.
    await page.waitForTimeout(250);
    await page.reload();
    await expect(page.locator('.bento .card').first()).toBeVisible();
    const reloaded = await cardIds(page);
    expect(reloaded.indexOf('progress')).toBeGreaterThan(reloaded.indexOf('focus'));
    await expect(page.locator('.card[data-card="tasks"]')).toHaveAttribute('data-size', 'L');

    // Hide a card, reload to prove it stays hidden, then re-add it from the tray.
    await page.click('.cust');
    await page.click('[aria-label="Hide Weekly activity from Home"]');
    await expect(page.locator('.card[data-card="weekly"]')).toHaveCount(0);
    await page.waitForTimeout(250);
    await page.reload();
    await page.click('.cust');
    await expect(page.locator('.card[data-card="weekly"]')).toHaveCount(0);
    await page.click('#hidden-tray [data-role="show"][data-card="weekly"]');
    await expect(page.locator('.card[data-card="weekly"]')).toBeVisible();
    await expect(page.locator('#hidden-tray [data-card="weekly"]')).toHaveCount(0);

    // Preset switch + reload persistence.
    await page.selectOption('#preset-sel', 'minimal');
    await expect.poll(async () => (await cardIds(page)).length).toBe(4);
    await page.waitForTimeout(250);
    await page.reload();
    await expect.poll(async () => (await cardIds(page)).length).toBe(4);

    // Greeting quick actions route and focus the right targets.
    await page.click('.smart button:has-text("Start focus")');
    await expect(page).toHaveURL(/#focus/);
    await expect(page.locator('#focus-start')).toBeFocused();

    await page.goto('/#home');
    await page.click('.smart button:has-text("Add task")');
    await expect(page).toHaveURL(/#tasks/);
    await expect(page.locator('#todo-title')).toBeFocused();

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Home View Mobile (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no resize handles, buttons reorder/resize, hide, preset, search', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await loadDemo(page);
    await noOverflow(page);

    await page.click('.cust');
    await expect(page.locator('.editbar')).toBeVisible();
    await expect(page.locator('.card .rz')).toHaveCount(0);
    await noOverflow(page);

    const before = await cardIds(page);
    await page.click('[aria-label="Move Today’s progress later"]');
    await expect
      .poll(async () => {
        const ids = await cardIds(page);
        return ids.indexOf('progress') > before.indexOf('progress');
      })
      .toBe(true);

    await page.click('[aria-label="Set Focus to large"]');
    await expect(page.locator('.card[data-card="focus"]')).toHaveAttribute('data-size', 'L');

    await page.click('[aria-label="Hide Weekly activity from Home"]');
    await expect(page.locator('.card[data-card="weekly"]')).toHaveCount(0);
    await page.click('#hidden-tray [data-role="show"][data-card="weekly"]');
    await expect(page.locator('.card[data-card="weekly"]')).toBeVisible();

    await page.selectOption('#preset-sel', 'minimal');
    await expect.poll(async () => (await cardIds(page)).length).toBe(4);
    await page.click('.editbar .pbtn:has-text("Done")');
    await noOverflow(page);

    await page.fill('#home-search', 'Finish OS');
    await expect(
      page.locator('#sres button:has-text("Finish OS assignment write-up")'),
    ).toBeVisible();
    await page.click('#sres button:has-text("Finish OS assignment write-up")');
    await expect(page).toHaveURL(/#tasks/);

    await page.goto('/#home');
    await page.click('.smart button:has-text("Start focus")');
    await expect(page).toHaveURL(/#focus/);
    await expect(page.locator('#focus-start')).toBeFocused();

    expect(consoleErrors).toHaveLength(0);
  });
});
