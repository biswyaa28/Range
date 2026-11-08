import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedOnboarded } from './support';

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
        test(`${route} has no serious or critical axe violations`, async ({ page }) => {
          await seedOnboarded(page);
          await page.goto('/#settings');
          await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
          await page.goto(`/#${route}`);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.waitForTimeout(600);

          const results = await new AxeBuilder({ page }).analyze();
          const serious = results.violations.filter((violation) =>
            violation.impact === 'serious' || violation.impact === 'critical',
          );
          expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
        });
      }
    });
  }
}
