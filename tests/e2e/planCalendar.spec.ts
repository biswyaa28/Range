import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

function localISO(date = new Date()): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

function collectConsoleErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.describe('Plan calendar desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('views, create, done, edit, delete+undo, month day, import, persistence', async ({
    page,
  }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#plan');
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('radio', { name: 'Week' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('.cal-col')).toHaveCount(7);

    // Create a weekly block through the modal.
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await expect(page.locator('.modal-title')).toHaveText('New block');
    await expect(page.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.fill('#bf-title', 'DSA Lecture');
    await page.selectOption('#bf-cat', 'class');
    await page.fill('#bf-start', '09:00');
    await page.fill('#bf-end', '10:00');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.toast:has-text("Block added")')).toBeVisible();

    const block = page.getByRole('button', {
      name: 'DSA Lecture, 09:00 to 10:00, personal',
    });
    await expect(block).toBeVisible();

    // Mark done from the block popover.
    await block.click();
    const popover = page.getByRole('dialog', { name: 'Block actions' });
    await expect(popover).toBeVisible();
    await expect(popover.locator('h3')).toHaveText('DSA Lecture');
    await popover.getByRole('button', { name: 'Mark done' }).click();
    await expect(
      page.getByRole('button', {
        name: 'DSA Lecture, 09:00 to 10:00, personal, done',
      }),
    ).toHaveClass(/done/);

    // Edit the block title.
    await page
      .getByRole('button', {
        name: 'DSA Lecture, 09:00 to 10:00, personal, done',
      })
      .click();
    await page
      .getByRole('dialog', { name: 'Block actions' })
      .getByRole('button', { name: 'Edit' })
      .click();
    await expect(page.locator('.modal-title')).toHaveText('Edit block');
    await page.fill('#bf-title', 'DSA Lecture edited');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.toast:has-text("Block updated")')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'DSA Lecture edited, 09:00 to 10:00, personal, done',
      }),
    ).toBeVisible();

    // Delete and undo.
    await page
      .getByRole('button', {
        name: 'DSA Lecture edited, 09:00 to 10:00, personal, done',
      })
      .click();
    await page
      .getByRole('dialog', { name: 'Block actions' })
      .getByRole('button', { name: 'Delete' })
      .click();
    const deleteToast = page.locator('.toast:has-text("Block deleted")');
    await expect(deleteToast).toBeVisible();
    await expect(page.locator('.cal-blk:has-text("DSA Lecture edited")')).toHaveCount(0);
    await deleteToast.locator('.toast-action-btn:has-text("Undo")').click();
    await expect(
      page.getByRole('button', {
        name: 'DSA Lecture edited, 09:00 to 10:00, personal, done',
      }),
    ).toBeVisible();

    // Day / week / month views.
    await page.getByRole('radio', { name: 'Day' }).click();
    await expect(page.locator('.cal[data-mode="day"]')).toBeVisible();
    await expect(page.locator('.cal-col')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Week' }).click();
    await expect(page.locator('.cal-col')).toHaveCount(7);
    await page.getByRole('radio', { name: 'Month' }).click();
    await expect(page.locator('.cal-mcell')).toHaveCount(42);

    // Click today's month cell to open day view.
    await page.locator('.cal-mcell.today').click();
    await expect(page.getByRole('radio', { name: 'Day' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('.cal[data-mode="day"]')).toBeVisible();

    // Import a one-off block for today.
    const today = localISO();
    await page.getByRole('button', { name: 'Import timetable' }).click();
    await page.fill(
      '#tt-json',
      JSON.stringify([
        { title: 'Imported Lab', day: today, start: '14:00', end: '15:30' },
        { day: 1, start: '11:00', end: '12:00' },
      ]),
    );
    await page.getByRole('button', { name: 'Validate and preview' }).click();
    await expect(page.locator('.modal-title')).toHaveText('Preview');
    await expect(page.getByText(/1 valid row/)).toBeVisible();
    await expect(page.getByText(/Missing title/)).toBeVisible();
    await page.getByRole('button', { name: 'Import 1 block' }).click();
    await expect(page.locator('.toast:has-text("Imported 1 block")')).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Imported Lab, 14:00 to 15:30, college',
      }),
    ).toBeVisible();

    // Persistence across reload.
    await page.reload();
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    await expect(
      page.getByRole('button', {
        name: 'DSA Lecture edited, 09:00 to 10:00, personal, done',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Imported Lab, 14:00 to 15:30, college',
      }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Plan calendar mobile (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('pager, create, mark done, views, month day, and persistence', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/#plan');
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.cal-col')).toHaveCount(7);

    // The week pager centers today's column.
    await page.waitForTimeout(600);
    const todayColumn = page.locator('.cal-col.today');
    await expect(todayColumn).toBeVisible();
    const box = await todayColumn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    }

    // Create a block in the modal.
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page.fill('#bf-title', 'Mobile block');
    await page.fill('#bf-start', '09:00');
    await page.fill('#bf-end', '10:00');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const block = page.getByRole('button', {
      name: 'Mobile block, 09:00 to 10:00, personal',
    });
    await expect(block).toBeVisible();

    // Mark done.
    await block.click();
    await page
      .getByRole('dialog', { name: 'Block actions' })
      .getByRole('button', { name: 'Mark done' })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Mobile block, 09:00 to 10:00, personal, done',
      }),
    ).toBeVisible();

    // Views and month day click.
    await page.getByRole('radio', { name: 'Day' }).click();
    await expect(page.locator('.cal-col')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Month' }).click();
    await expect(page.locator('.cal-mcell')).toHaveCount(42);
    await page.locator('.cal-mcell.today').click();
    await expect(page.locator('.cal[data-mode="day"]')).toBeVisible();

    await expectNoHorizontalOverflow(page);

    // Persistence across reload.
    await page.reload();
    await expect(page.locator('.view-head h1')).toHaveText('Calendar');
    await expect(
      page.getByRole('button', {
        name: 'Mobile block, 09:00 to 10:00, personal, done',
      }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
  });
});
