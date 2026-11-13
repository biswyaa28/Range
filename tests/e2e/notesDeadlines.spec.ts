import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('Notes and Deadlines Views Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('Notes: create, edit, pin, search, delete+undo, and persistence', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/#notes');

    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verify view header
    await expect(page.locator('.view-head h1')).toHaveText('Notes');

    // 1. Create a note via NEW button
    await page.click('button[data-action="note-new"]');
    await expect(page.locator('#note-title')).toBeVisible();

    // 2. Edit note title and body
    await page.fill('#note-title', 'Design System Ideas');
    await page.fill('#note-body', 'Tokenized typography and elevation.\nSecond line details.');
    // Trigger blur/autosave
    await page.locator('#note-body').blur();
    await page.waitForTimeout(500);

    // Verify list item updated
    await expect(page.locator('.note-item .ni-title:has-text("Design System Ideas")')).toBeVisible();
    await expect(page.locator('.note-item .ni-snip:has-text("Tokenized typography and elevation.")')).toBeVisible();

    // 3. Pin note
    const pinBtn = page.locator('button[data-action="note-pin"]');
    await pinBtn.click();
    await expect(pinBtn).toHaveClass(/on/);
    await expect(page.locator('.note-item .chip.solid:has-text("Pinned")')).toBeVisible();

    // 4. Create another note
    await page.click('button[data-action="note-new"]');
    await page.fill('#note-title', 'Shopping List');
    await page.fill('#note-body', 'Oat milk, Apples');
    await page.locator('#note-body').blur();
    await page.waitForTimeout(500);

    // Pinned note should still be first in the list
    const firstTitle = page.locator('.note-item .ni-title').first();
    await expect(firstTitle).toHaveText('Design System Ideas');

    // 5. Live Search
    const searchInput = page.locator('#notes-search');
    await searchInput.fill('Apples');
    await expect(page.locator('.note-item .ni-title:has-text("Shopping List")')).toBeVisible();
    await expect(page.locator('.note-item .ni-title:has-text("Design System Ideas")')).toBeHidden();
    await searchInput.fill('');
    await expect(page.locator('.note-item .ni-title:has-text("Design System Ideas")')).toBeVisible();

    // 6. Delete note and Undo
    await page.click('.note-item:has-text("Shopping List")');
    await page.click('button[data-action="note-del"]');

    await expect(page.locator('.note-item:has-text("Shopping List")')).toBeHidden();
    const toast = page.locator('.toast:has-text("Note deleted")');
    await expect(toast).toBeVisible();
    await toast.locator('.toast-action-btn:has-text("Undo")').click();

    // Restored
    await expect(page.locator('.note-item:has-text("Shopping List")')).toBeVisible();

    // 7. Reload and check persistence
    await page.reload();
    await page.waitForSelector('.note-item');
    await expect(page.locator('.note-item:has-text("Design System Ideas")')).toBeVisible();
    await expect(page.locator('.note-item:has-text("Shopping List")')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('Deadlines & Bell Popover: approve from bell, add deadline, reload persistence', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Load demo data from Settings first to get pending items
    await page.goto('/#settings');
    await page.click('button[data-action="demo-load"]');
    await expect(page.locator('.toast:has-text("Demo data loaded")')).toBeVisible();

    // 2. Bell badge shows count
    const bellBtn = page.locator('button.bellbtn');
    await expect(bellBtn).toBeVisible();
    const badge = page.locator('#bell-badge');
    await expect(badge).toBeVisible();
    const countText = await badge.innerText();
    const count = parseInt(countText, 10);
    expect(count).toBeGreaterThan(0);

    // 3. Open Bell popover and approve a deadline
    await bellBtn.click();
    const popover = page.locator('.bellpop');
    await expect(popover).toBeVisible();

    const firstPendingRow = popover.locator('.bp-row').first();
    const approvedTitle = await firstPendingRow.locator('.bp-t b').innerText();
    await firstPendingRow.locator('button.ok:has-text("Approve")').click();

    // Badge decreases by 1
    const newCount = parseInt(await badge.innerText(), 10);
    expect(newCount).toBe(count - 1);

    // Close popover
    await bellBtn.click();
    await expect(popover).toBeHidden();

    // 4. Navigate to Plan -> Deadlines tab
    await page.goto('/#plan');
    await page.click('button[role="radio"]:has-text("Deadlines")');

    // The approved deadline is now visible in "All deadlines"
    await expect(page.locator('.dl-card .dl-title:has-text("' + approvedTitle + '")')).toBeVisible();

    // 5. Add deadline via Quick Add form
    await page.fill('#dl-title', 'E2E Deadline Test');
    await page.fill('#dl-course', 'CS999');
    await page.fill('#dl-due', '2026-11-20');
    await page.selectOption('#dl-type', 'exam');
    await page.click('#dl-form button[type="submit"]');

    await expect(page.locator('.dl-card .dl-title:has-text("E2E Deadline Test")')).toBeVisible();

    // 6. Reload and check persistence
    await page.reload();
    await page.click('button[role="radio"]:has-text("Deadlines")');
    await expect(page.locator('.dl-card .dl-title:has-text("E2E Deadline Test")')).toBeVisible();

    // No overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Notes and Deadlines Views Mobile (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('Notes mobile: list then full-screen editor with back, create/edit, no overflow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/#notes');

    // No horizontal overflow
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          ),
        { message: 'Notes list should not overflow horizontally' },
      )
      .toBe(false);

    // 1. Create a note
    await page.click('button[data-action="note-new"]');

    // In mobile editing mode, editor is visible and list is hidden
    const editor = page.locator('.notes-editor');
    await expect(editor).toBeVisible();
    await expect(page.locator('.notes-list')).toBeHidden();

    // 2. Type title and body
    await page.fill('#note-title', 'Mobile Quick Note');
    await page.fill('#note-body', 'Typing from mobile viewport');
    await page.locator('#note-body').blur();
    await page.waitForTimeout(400);

    // 3. Click back button to return to list
    const backBtn = page.locator('button[data-action="notes-back"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Now list is visible, editor is hidden
    await expect(page.locator('.notes-list')).toBeVisible();
    await expect(page.locator('.note-item:has-text("Mobile Quick Note")')).toBeVisible();
    await page.waitForTimeout(250);

    // No horizontal overflow
    const offenders = await page.evaluate(() => {
      const width = window.innerWidth;
      return Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > width + 1 || rect.left < -1)
        .slice(0, 12)
        .map(({ el, rect }) => ({
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (el.textContent ?? '').slice(0, 80),
        }));
    });
    if (offenders.length) console.log('OVERFLOW', JSON.stringify(offenders, null, 2));

    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          ),
        { message: 'Notes list should not overflow horizontally' },
      )
      .toBe(false);

    expect(consoleErrors).toEqual([]);
  });

  test('Deadlines mobile: view pending, add/edit modal, segmented milestone bars, no overflow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/#plan');
    await page.click('button[role="radio"]:has-text("Deadlines")');

    // Add deadline via FAB
    const fab = page.locator('button.fab[data-action="dl-new"]');
    await expect(fab).toBeVisible();
    await fab.click();

    // Modal opens
    await expect(page.locator('.modal-box h2')).toHaveText('Add deadline');
    await page.fill('#modal-dl-title', 'Mobile Exam');
    await page.fill('#modal-dl-course', 'BIO101');
    await page.fill('#modal-dl-due', '2026-11-15');
    await page.click('.modal-box button[type="submit"]');

    await expect(page.locator('.dl-card:has-text("Mobile Exam")')).toBeVisible();
    // Segmented milestone bars visible
    await expect(page.locator('.dl-card:has-text("Mobile Exam") .segs')).toBeVisible();

    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    expect(consoleErrors).toEqual([]);
  });
});
