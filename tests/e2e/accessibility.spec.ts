import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['home', 'plan', 'tasks', 'notes', 'focus', 'insights', 'settings'] as const;

// Verified false positives only: axe's region rule flags decorative
// off-screen containers that are aria-hidden. Keep this list commented and
// empty unless a real false positive is proven.
const ALLOWED_RULE_IDS: string[] = [];

function blockingViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations.filter(
    (violation) =>
      (violation.impact === 'moderate' ||
        violation.impact === 'serious' ||
        violation.impact === 'critical') &&
      !ALLOWED_RULE_IDS.includes(violation.id),
  );
}

async function expectAxeClean(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = blockingViolations(results);
  expect(
    blocking,
    blocking
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help} [${violation.nodes
            .map((node) => node.target.join(' '))
            .join(', ')}]`,
      )
      .join('\n'),
  ).toEqual([]);
}
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
const themes = ['light', 'dark'] as const;

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`Accessibility ${viewport.name} ${theme}`, () => {
      test.use({ viewport });

      for (const route of routes) {
        test(`${route} has no serious or critical axe violations`, async ({
          page,
        }) => {
          // Seed theme before the app loads so there is no theme transition
          // when axe runs. Reuses the same localStorage key the Store persists.
          await page.addInitScript(
            (theme: string) => {
              const key = 'personalOS_v1';
              const seededFlag = '__e2e_onboarded_seeded';
              if (window.sessionStorage.getItem(seededFlag) === '1') return;
              let data: Record<string, unknown> = {};
              try {
                const raw = window.localStorage.getItem(key);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (
                    parsed &&
                    typeof parsed === 'object' &&
                    !Array.isArray(parsed)
                  ) {
                    data = parsed as Record<string, unknown>;
                  }
                }
              } catch {
                data = {};
              }
              data.profile = { ...(data.profile || {}), onboarded: true };
              data.settings = { ...(data.settings || {}), theme };
              window.localStorage.setItem(key, JSON.stringify(data));
              window.sessionStorage.setItem(seededFlag, '1');
            },
            theme,
          );
          await page.goto(`/#${route}`);
          // Let the lazy route render its heading before axe runs.
          await expect(page.locator('main h1').first()).toBeVisible();
          // Stop all CSS transitions so axe sees final computed colors,
          // not mid-transition values (custom properties can be animated).
          await page.addStyleTag({
            content: `* { transition: none !important; animation: none !important; }`,
          });
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme,
          );

          await expectAxeClean(page);
        });
      }
    });
  }
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`Open dialogs ${viewport.name} ${theme}`, () => {
      test.use({ viewport });

      test('palette, cheat sheet, chat, focus mode and onboarding have no moderate axe violations', async ({
        page,
      }) => {
        await page.addInitScript((t: string) => {
          const key = 'personalOS_v1';
          const raw = window.localStorage.getItem(key);
          const data = raw ? JSON.parse(raw) : {};
          data.profile = { ...(data.profile || {}), onboarded: true };
          data.settings = { ...(data.settings || {}), theme: t };
          window.localStorage.setItem(key, JSON.stringify(data));
        }, theme);
        await page.goto('/#home');
        await expect(page.locator('main h1').first()).toBeVisible();
        await page.addStyleTag({
          content: `* { transition: none !important; animation: none !important; }`,
        });

        await page.keyboard.press('Control+k');
        const palette = page.getByRole('dialog');
        await expect(palette).toBeVisible();
        await expectAxeClean(page);
        await page.keyboard.press('Escape');
        await expect(palette).toBeHidden();

        await page.keyboard.press('?');
        const cheat = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
        await expect(cheat).toBeVisible();
        await expectAxeClean(page);
        await page.keyboard.press('Escape');
        await expect(cheat).toBeHidden();

        await page.getByRole('button', { name: 'Open AI chat' }).click();
        const chat = page.getByRole('dialog');
        await expect(chat).toBeVisible();
        await page.waitForTimeout(150);
        await expectAxeClean(page);
        await page.keyboard.press('Escape');
        await expect(chat).toBeHidden();

        await page.goto('/#focus');
        await expect(page.locator('main h1').first()).toBeVisible();
        await page.addStyleTag({
          content: `* { transition: none !important; animation: none !important; }`,
        });
        await page.getByRole('button', { name: 'Enter focus mode' }).click();
        const focus = page.getByRole('dialog', { name: 'Focus mode' });
        await expect(focus).toBeVisible();
        await expectAxeClean(page);
        await page.keyboard.press('Escape');
        await expect(focus).toBeHidden();

        await page.getByRole('radio', { name: 'Prompter', exact: true }).click();
        await page.getByRole('button', { name: 'Open reading mode' }).click();
        const prompter = page.getByRole('dialog', { name: 'Prompter reading mode' });
        await expect(prompter).toBeVisible();
        await expectAxeClean(page);
        await page.keyboard.press('Escape');
        await expect(prompter).toBeHidden();

        if (viewport.name === 'mobile') {
          await page.goto('/#home');
          await expect(page.locator('main h1').first()).toBeVisible();
          await page.getByRole('button', { name: 'More' }).click();
          const more = page.getByRole('dialog', { name: 'More' });
          await expect(more).toBeVisible();
          await expectAxeClean(page);
          await page.getByRole('button', { name: 'Settings', exact: true }).click();
        } else {
          await page.getByRole('button', { name: /^Account menu/ }).click();
          await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
        }
        await expect(page.locator('main h1').first()).toBeVisible();
        await page.addStyleTag({
          content: `* { transition: none !important; animation: none !important; }`,
        });
        await page.getByRole('button', { name: 'Personalize', exact: true }).first().click();
        const onboarding = page.getByRole('dialog', { name: 'Personalize Personal OS' });
        await expect(onboarding).toBeVisible();
        await expectAxeClean(page);
      });
    });
  }
}
