import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

interface CanvasMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  s: number;
  e: number;
}

async function canvasMetrics(page: Page, selector: string): Promise<CanvasMetrics> {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      s: Number((element as HTMLElement).dataset.s),
      e: Number((element as HTMLElement).dataset.e),
    };
  });
}

function yAt(metrics: CanvasMetrics, minute: number): number {
  return metrics.y + ((minute - metrics.s) / (metrics.e - metrics.s)) * metrics.height;
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.describe('Plan calendar drag desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('drag create, move to another day, resize, cancel, delete/undo, persistence', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/#plan');
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');

    const todayIso = await page.locator('.cal-col.today').getAttribute('data-iso');
    expect(todayIso).toBeTruthy();
    const targetIso = await page.locator('.cal-col').evaluateAll((columns, today) => {
      const target = columns.find(
        (column) => (column as HTMLElement).dataset.iso !== today,
      );
      return (target as HTMLElement | undefined)?.dataset.iso ?? '';
    }, todayIso);
    expect(targetIso).toBeTruthy();

    // Drag on the empty grid between 08:00 and 09:30.
    const canvas = await canvasMetrics(page, '.cal-col.today .cal-canvas');
    const x = canvas.x + canvas.width / 2;
    await page.mouse.move(x, yAt(canvas, 480));
    await page.mouse.down();
    await page.mouse.move(x, yAt(canvas, 570), { steps: 8 });
    const ghost = page.locator('.cal-ghost');
    await expect(ghost).toBeVisible();
    await expect(ghost.locator('b')).toHaveText('08:00 – 09:30 · 1h 30m');
    await page.mouse.up();

    await expect(page.locator('.modal-title')).toHaveText('New block');
    await expect(page.locator('#bf-start')).toHaveValue('08:00');
    await expect(page.locator('#bf-end')).toHaveValue('09:30');
    await expect(page.getByRole('radio', { name: 'Once' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.fill('#bf-title', 'Dragged Block');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const block = page.getByRole('button', {
      name: 'Dragged Block, 08:00 to 09:30, personal',
    });
    await expect(block).toBeVisible();

    // Move the one-off block to another weekday within the visible week.
    const sourceBox = await block.boundingBox();
    const targetColumn = page.locator(`.cal-col[data-iso="${targetIso}"]`);
    const targetBox = await targetColumn.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (sourceBox && targetBox) {
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 15);
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        sourceBox.y + 15,
        { steps: 10 },
      );
      await page.mouse.up();
    }

    const movedBlock = targetColumn.getByRole('button', {
      name: 'Dragged Block, 08:00 to 09:30, personal',
    });
    await expect(movedBlock).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Dragged Block moved to 08:00 to 09:30 on',
    );

    // Resize from the bottom edge by 30 minutes.
    const movedBox = await movedBlock.boundingBox();
    expect(movedBox).not.toBeNull();
    if (movedBox) {
      await page.mouse.move(
        movedBox.x + movedBox.width / 2,
        movedBox.y + movedBox.height - 4,
      );
      await page.mouse.down();
      await page.mouse.move(
        movedBox.x + movedBox.width / 2,
        movedBox.y + movedBox.height + 24,
        { steps: 6 },
      );
      await page.mouse.up();
    }
    const resizedBlock = targetColumn.getByRole('button', {
      name: 'Dragged Block, 08:00 to 10:00, personal',
    });
    await expect(resizedBlock).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      'Dragged Block resized to 08:00 to 10:00',
    );

    // Escape cancels an in-flight move and restores the original time.
    const resizeBox = await resizedBlock.boundingBox();
    expect(resizeBox).not.toBeNull();
    if (resizeBox) {
      await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 15);
      await page.mouse.down();
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2,
        resizeBox.y + 120,
        { steps: 6 },
      );
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
    await expect(
      targetColumn.getByRole('button', {
        name: 'Dragged Block, 08:00 to 10:00, personal',
      }),
    ).toBeVisible();

    // Delete from the keyboard and restore through the Undo toast.
    await resizedBlock.focus();
    await page.keyboard.press('Delete');
    await expect(targetColumn.locator('.cal-blk:has-text("Dragged Block")')).toHaveCount(0);
    const undo = page.locator('.toast-action-btn:has-text("Undo")');
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(
      targetColumn.getByRole('button', {
        name: 'Dragged Block, 08:00 to 10:00, personal',
      }),
    ).toBeVisible();

    // Persistence keeps the moved day, times and resized end.
    await page.reload();
    await expect(
      page
        .locator(`.cal-col[data-iso="${targetIso}"]`)
        .getByRole('button', {
          name: 'Dragged Block, 08:00 to 10:00, personal',
        }),
    ).toBeVisible();
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('personalOS_v1');
      const state = raw ? (JSON.parse(raw) as { blocks: Array<{ title: string; day: string; start: string; end: string }> }) : null;
      return state?.blocks.find((item) => item.title === 'Dragged Block');
    });
    expect(stored).toMatchObject({
      day: targetIso,
      start: '08:00',
      end: '10:00',
    });

    // The actions popover flips and clamps inside the viewport.
    const persisted = page
      .locator(`.cal-col[data-iso="${targetIso}"]`)
      .getByRole('button', {
        name: 'Dragged Block, 08:00 to 10:00, personal',
      });
    await persisted.click();
    const popover = page.getByRole('dialog', { name: 'Block actions' });
    await expect(popover).toBeVisible();
    const popoverBox = await popover.boundingBox();
    expect(popoverBox).not.toBeNull();
    if (popoverBox) {
      expect(popoverBox.x).toBeGreaterThanOrEqual(0);
      expect(popoverBox.y).toBeGreaterThanOrEqual(0);
      expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(1280);
      expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(800);
    }
    await page.keyboard.press('Escape');

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Plan calendar drag mobile (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('long-press create, resize, keyboard day move, delete/undo, persistence', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/#plan');
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    await page.waitForTimeout(700);
    await expectNoHorizontalOverflow(page);

    const todayIso = await page.locator('.cal-col.today').getAttribute('data-iso');
    expect(todayIso).toBeTruthy();

    // A 400ms press on empty grid activates the touch drag; moving sets the end.
    const canvas = await canvasMetrics(page, '.cal-col.today .cal-canvas');
    const x = canvas.x + canvas.width / 2;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: yAt(canvas, 480), id: 1 }],
    });
    await page.waitForTimeout(400);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: yAt(canvas, 570), id: 1 }],
    });
    await page.waitForTimeout(80);
    await expect(page.locator('.cal-ghost b')).toHaveText('08:00 – 09:30 · 1h 30m');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page.locator('.modal-title')).toHaveText('New block');
    await expect(page.locator('#bf-start')).toHaveValue('08:00');
    await expect(page.locator('#bf-end')).toHaveValue('09:30');
    await page.fill('#bf-title', 'Touch Block');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const block = page.locator('.cal-col.today').getByRole('button', {
      name: 'Touch Block, 08:00 to 09:30, personal',
    });
    await expect(block).toBeVisible();

    // Resize by dragging the bottom edge with the mouse (layout path).
    const box = await block.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height + 24, {
        steps: 6,
      });
      await page.mouse.up();
    }
    const resized = page.locator('.cal-col.today').getByRole('button', {
      name: 'Touch Block, 08:00 to 10:00, personal',
    });
    await expect(resized).toBeVisible();

    // Delete and undo from the keyboard.
    await resized.focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('.cal-blk:has-text("Touch Block")')).toHaveCount(0);
    const undo = page.locator('.toast-action-btn:has-text("Undo")');
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(resized).toBeVisible();

    // Keyboard cross-day move in the week pager.
    const status = page.getByRole('status');
    await resized.focus();
    await page.keyboard.press('ArrowRight');
    await expect(status).toContainText('Touch Block moved to 08:00 to 10:00');

    const readDay = () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('personalOS_v1');
        const state = raw
          ? (JSON.parse(raw) as {
              blocks: Array<{ title: string; day: string }>;
            })
          : null;
        return state?.blocks.find((item) => item.title === 'Touch Block')?.day;
      });
    await expect.poll(readDay).not.toBe(todayIso);
    const expectedDay = await readDay();

    // Reload keeps the cross-day move and the resized end.
    await page.reload();
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('personalOS_v1');
      const state = raw ? (JSON.parse(raw) as { blocks: Array<{ title: string; day: string; start: string; end: string }> }) : null;
      return state?.blocks.find((item) => item.title === 'Touch Block');
    });
    expect(stored).toMatchObject({
      day: expectedDay,
      start: '08:00',
      end: '10:00',
    });

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
});
