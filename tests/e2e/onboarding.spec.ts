import { test, expect, type Page } from '@playwright/test';

function tomorrowISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function next(page: Page): Promise<void> {
  await page.click('[data-nav="next"]');
}

async function choose(page: Page, key: string, value: string): Promise<void> {
  await page.click(`[data-k="${key}"][data-v="${value}"]`);
}

const viewports = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile (390px)', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test.describe(`First-run onboarding ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('completes all 12 steps, creates a real task, and reopens pre-selected', async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto('/');

      const wizard = page.getByRole('dialog', { name: 'Personalize Personal OS' });
      await expect(wizard).toBeVisible();
      await expect(page.locator('.onb-count')).toHaveText('1 / 12');
      await expect(page.getByRole('button', { name: 'Skip setup' })).toBeVisible();

      // 1. Name + greeting
      await page.fill('#onb-name', 'Ada');
      await choose(page, 'greeting', 'hey');
      await next(page);
      await expect(page.locator('.onb-count')).toHaveText('2 / 12');

      // 2. Role
      await choose(page, 'role', 'School student');
      await next(page);

      // 3. Year / level
      await page.selectOption('#onb-level', '2nd year');
      await next(page);

      // 4. Field
      await page.selectOption('#onb-field', 'Computer Science');
      await next(page);

      // 5. Rhythm
      await page.selectOption('#onb-wake', '08:00');
      await page.selectOption('#onb-sleep', '22:00');
      await choose(page, 'bestTime', 'Morning');
      await next(page);

      // 6. Study goal
      await page.selectOption('#onb-study-hours', '4');
      await choose(page, 'weeklyGoal', 'Exam prep');
      await next(page);

      // 7. Focus style + noise
      await choose(page, 'focusStyle', 'deep');
      await choose(page, 'noise', 'pink');
      await next(page);

      // 8. Timetable, skipped honestly
      await page.click('[data-act="next"]');

      // 9. Home preset
      await choose(page, 'preset', 'minimal');
      await next(page);

      // 10. Accent
      await choose(page, 'accent', 'blue');
      await next(page);

      // 11. First task
      await page.fill('#onb-task', 'Finish lab report');
      await page.selectOption('#onb-task-due', 'tomorrow');
      await page.getByRole('button', { name: 'High' }).click();
      await next(page);

      // 12. Summary + finish
      await expect(wizard).toContainText('Ada');
      await expect(wizard).toContainText('4 h');
      await expect(page.locator('.onb-count')).toHaveText('12 / 12');
      await page.getByRole('button', { name: 'Open my dashboard' }).click();
      await expect(wizard).toBeHidden();

      await page.waitForFunction(() => {
        const raw = window.localStorage.getItem('personalOS_v1');
        if (!raw) return false;
        try {
          return JSON.parse(raw).profile?.onboarded === true;
        } catch {
          return false;
        }
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);

      await expect(page.locator('.smart h1')).toContainText('Hey, Ada');
      await page.goto('/#tasks');
      await expect(page.locator('.task-title:has-text("Finish lab report")')).toBeVisible();

      const saved = await page.evaluate(() => {
        const raw = window.localStorage.getItem('personalOS_v1');
        return raw ? JSON.parse(raw) : null;
      });
      expect(saved.profile.name).toBe('Ada');
      expect(saved.profile.greeting).toBe('hey');
      expect(saved.profile.role).toBe('School student');
      expect(saved.profile.level).toBe('2nd year');
      expect(saved.profile.field).toBe('Computer Science');
      expect(saved.profile.wake).toBe('08:00');
      expect(saved.profile.sleep).toBe('22:00');
      expect(saved.profile.bestTime).toBe('Morning');
      expect(saved.profile.studyHours).toBe(4);
      expect(saved.profile.weeklyGoal).toBe('Exam prep');
      expect(saved.profile.focusStyle).toBe('deep');
      expect(saved.profile.noise).toBe('pink');
      expect(saved.profile.preset).toBe('minimal');
      expect(saved.profile.accent).toBe('blue');
      expect(saved.profile.onboarded).toBe(true);
      expect(saved.settings.pomodoro).toEqual({ work: 50, break: 10 });
      expect(saved.tasks).toHaveLength(1);
      expect(saved.tasks[0].title).toBe('Finish lab report');
      expect(saved.tasks[0].due).toBe(tomorrowISO());
      expect(saved.tasks[0].priority).toBe('high');
      expect(saved.layout.hidden).toContain('weekly');
      expect(saved.layout.hidden).not.toContain('progress');

      // Reload: onboarding stays finished.
      await page.reload();
      await expect(wizard).toBeHidden();
      await expect(page.locator('.crumb')).toContainText('Tasks');

      // Personalize from Settings reopens with every answer selected.
      await page.goto('/#settings');
      await page.click('[data-action="personalize"]');
      await expect(wizard).toBeVisible();
      await expect(page.locator('#onb-name')).toHaveValue('Ada');
      await expect(page.locator('[data-k="greeting"][data-v="hey"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
      await next(page);
      await expect(
        page.locator('[data-k="role"][data-v="School student"]'),
      ).toHaveAttribute('aria-checked', 'true');
      await next(page);
      await expect(page.locator('#onb-level')).toHaveValue('2nd year');
      await next(page);
      await expect(page.locator('#onb-field')).toHaveValue('Computer Science');
      await next(page);
      await expect(page.locator('#onb-wake')).toHaveValue('08:00');
      await expect(page.locator('#onb-sleep')).toHaveValue('22:00');
      await expect(page.locator('[data-k="bestTime"][data-v="Morning"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await next(page);
      await expect(page.locator('#onb-study-hours')).toHaveValue('4');
      await expect(page.locator('[data-k="weeklyGoal"][data-v="Exam prep"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await next(page);
      await expect(page.locator('[data-k="focusStyle"][data-v="deep"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(page.locator('[data-k="noise"][data-v="pink"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await page.getByRole('button', { name: 'Close' }).click();
      await expect(wizard).toBeHidden();
      await expect(page.locator('.view-head h1')).toHaveText('Settings');

      expect(consoleErrors).toHaveLength(0);
    });
  });
}
