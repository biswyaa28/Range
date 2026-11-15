import { test, expect, type Page } from '@playwright/test';

const seedOnboarded = (onboarded: boolean) => async (page: Page) => {
  await page.addInitScript((done: boolean) => {
    const raw = window.localStorage.getItem('personalOS_v1');
    const data = raw ? JSON.parse(raw) : {};
    data.profile = { ...(data.profile || {}), onboarded: done };
    window.localStorage.setItem('personalOS_v1', JSON.stringify(data));
  }, onboarded);
};

async function expectFocusInside(page: Page) {
  await expect(
    page.locator('[role="dialog"]:visible').last().locator(':focus'),
    'focus should stay inside the open dialog',
  ).toHaveCount(1, { timeout: 2000 });
}

test.describe('route focus and titles', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(true)(page);
  });

  test('sets the document title and focuses the view heading on navigation', async ({ page }) => {
    await page.goto('/#home');
    await expect(page).toHaveTitle('Home · Personal OS');
    await expect(page.locator('main h1')).toBeVisible();

    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page).toHaveTitle('Plan · Personal OS');
    await expect(page.locator('main h1')).toBeFocused();
    await expect(page.locator('.sr-only[role="status"]').first()).toHaveText('Plan page');

    await page.getByRole('button', { name: /^Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveTitle('Settings · Personal OS');
    await expect(page.locator('main h1')).toBeFocused();
  });

  test('skip link is first, visible on focus, and moves focus into main', async ({ page }) => {
    await page.goto('/#home');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeVisible();
    const inMain = await page.evaluate(() => {
      const main = document.getElementById('main');
      return !!main && !!document.activeElement && main.contains(document.activeElement);
    });
    expect(inMain).toBe(true);
  });
});

test.describe('keyboard dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await seedOnboarded(true)(page);
    await page.goto('/#home');
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('command palette supports arrows and Escape restores focus', async ({ page }) => {
    const search = page.locator('.sbtn');
    await search.focus();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(150);
    await expectFocusInside(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectFocusInside(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.sbtn')).toBeFocused();
  });

  test('cheat sheet traps focus and Escape restores the opener', async ({ page }) => {
    const search = page.locator('.sbtn');
    await search.focus();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(150);
    await expectFocusInside(page);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      await expectFocusInside(page);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.sbtn')).toBeFocused();
  });

  test('AI chat traps focus and returns it on close', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Open AI chat' });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(150);
    await expectFocusInside(page);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      await expectFocusInside(page);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('focus mode traps focus and Escape restores the opener', async ({ page }) => {
    await page.goto('/#focus');
    const opener = page.getByRole('button', { name: 'Enter focus mode' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Focus mode' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(150);
    await expectFocusInside(page);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await expectFocusInside(page);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('onboarding traps focus', async ({ page }) => {
    await seedOnboarded(false)(page);
    await page.reload();
    const dialog = page.getByRole('dialog', { name: 'Personalize Personal OS' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(150);
    await expectFocusInside(page);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await expectFocusInside(page);
    }
  });

  test('every focusable step shows a visible focus indicator', async ({ page }) => {
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const visible = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const style = getComputedStyle(el);
        const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const hasShadow = style.boxShadow !== 'none';
        return hasOutline || hasShadow;
      });
      expect(visible).toBe(true);
    }
  });
});

test.describe('mobile more sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('reaches Insights and Settings with one tap from More', async ({ page }) => {
    await seedOnboarded(true)(page);
    await page.goto('/#home');
    const more = page.getByRole('button', { name: 'More' });
    await expect(more).toBeVisible();
    await more.click();
    const sheet = page.getByRole('dialog', { name: 'More' });
    await expect(sheet).toBeVisible();
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await expect(page).toHaveTitle('Insights · Personal OS');
    await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveTitle('Settings · Personal OS');
  });
});
