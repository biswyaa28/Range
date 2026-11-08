import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['home', 'plan', 'tasks', 'notes', 'focus', 'insights', 'settings'] as const;
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
          // Stop all CSS transitions so axe sees final computed colors,
          // not mid-transition values (custom properties can be animated).
          await page.addStyleTag({
            content: `* { transition: none !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }`,
          });
          await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            theme,
          );

          const results = await new AxeBuilder({ page }).analyze();
          const serious = results.violations.filter((violation) =>
            violation.impact === 'serious' || violation.impact === 'critical',
          );
          expect(
            serious,
            serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
          ).toEqual([]);
        });
      }
    });
  }
}
