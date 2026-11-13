import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('Tasks View Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('add task, quick-add, complete, soft-delete, undo, filters, and persistence', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/#tasks');

    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verify view header
    await expect(page.locator('.view-head h1')).toHaveText('To-do');

    // 1. Add task via standard form
    await page.fill('#todo-title', 'Physics Assignment');
    await page.click('#todo-prio button:has-text("High")');
    await page.click('#todo-form button[type="submit"]');

    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeVisible();

    // 2. Add task via quick-add with live preview
    const quickInput = page.locator('#qadd-in');
    await quickInput.fill('Chemistry Lab tomorrow high prio');
    // Check live preview chip
    await expect(page.locator('.tasks-quick-preview')).toBeVisible();
    await expect(page.locator('.tasks-quick-preview')).toContainText('Chemistry Lab');
    await page.press('#qadd-in', 'Enter');

    await expect(page.locator('.task-title:has-text("Chemistry Lab")')).toBeVisible();

    // 3. Complete a task via tickbox
    const chemRow = page.locator('.task:has-text("Chemistry Lab")');
    const tickbox = chemRow.locator('button.tickbox');
    await expect(tickbox).toHaveAttribute('aria-pressed', 'false');
    await tickbox.click();
    await expect(tickbox).toHaveAttribute('aria-pressed', 'true');
    await expect(chemRow).toHaveClass(/done/);

    // 4. Test Filters
    // Done filter shows completed Chemistry Lab
    await page.click('button[role="radio"]:has-text("Done")');
    await expect(page.locator('.task-title:has-text("Chemistry Lab")')).toBeVisible();
    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeHidden();

    // All filter shows both
    await page.click('button[role="radio"]:has-text("All")');
    await expect(page.locator('.task-title:has-text("Chemistry Lab")')).toBeVisible();
    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeVisible();

    // 5. Delete and Undo
    const physicsRow = page.locator('.task:has-text("Physics Assignment")');
    await physicsRow.locator('button.ibtn[data-action="task-del"]').click();

    // Modal opens
    await expect(page.locator('.modal-box h2')).toHaveText('Delete task');
    await page.click('.modal-box button:has-text("Delete")');

    // Row is deleted
    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeHidden();

    // Undo via toast
    const deleteToast = page.locator('.toast:has-text("Task deleted")');
    await expect(deleteToast).toBeVisible();
    await deleteToast.locator('.toast-action-btn:has-text("Undo")').click();

    // Row is restored
    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeVisible();

    // 6. Persistence across page reload
    await page.reload();
    await expect(page.locator('.task-title:has-text("Physics Assignment")')).toBeVisible();
    await expect(page.locator('.task-title:has-text("Chemistry Lab")')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });
});

test.describe('Tasks View Mobile (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
  });

  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile swipe gestures, quick add, and no horizontal overflow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/#tasks');

    // No horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Quick add a task
    await page.fill('#qadd-in', 'Mobile Task Test');
    await page.press('#qadd-in', 'Enter');
    const taskRow = page.locator('.task:has-text("Mobile Task Test")');
    await expect(taskRow).toBeVisible();

    // Perform swipe right to complete
    const box = await taskRow.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 80, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 240, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
    }

    await expect(taskRow).toHaveClass(/done/);

    // Perform swipe left to soft-delete
    if (box) {
      await page.mouse.move(box.x + 180, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 50, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
    }

    // Modal or delete executed
    await page.waitForTimeout(300);
    // Confirm delete if modal opened or check toast
    const deleteModalBtn = page.locator('.modal-box button:has-text("Delete")');
    if (await deleteModalBtn.isVisible()) {
      await deleteModalBtn.click();
    }

    await expect(page.locator('.toast:has-text("Task deleted")')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });
});
