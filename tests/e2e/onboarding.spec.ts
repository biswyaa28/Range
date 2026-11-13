import { test, expect, type Page } from '@playwright/test';

async function next(page: Page): Promise<void> {
  await page.click('[data-nav="next"]');
}

async function choose(page: Page, key: string, value: string): Promise<void> {
  await page.click(`[data-k="${key}"][data-v="${value}"]`);
}

async function savedSettings(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('personalOS_settings_v1');
    if (!raw) return null;
    try {
      return JSON.parse(raw).data ?? null;
    } catch {
      return null;
    }
  });
}

const viewports = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile (390px)', width: 390, height: 844 },
];

for (const viewport of viewports) {
  test.describe(`First-run onboarding ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('completes all 9 steps, saves Settings, and reopens pre-selected', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      await page.goto('/');

      const wizard = page.getByRole('dialog', { name: 'Personalize Personal OS' });
      await expect(wizard).toBeVisible();
      await expect(page.locator('.onb-count')).toHaveText('1 / 9');
      await expect(page.getByRole('button', { name: 'Skip setup' })).toBeVisible();

      // 1. Name + role
      await page.fill('#onb-name', 'Ada');
      await choose(page, 'role', 'work');
      await next(page);
      await expect(page.locator('.onb-count')).toHaveText('2 / 9');

      // 2. Goals
      await choose(page, 'goal', 'assignments');
      await choose(page, 'goal', 'exams');
      await next(page);

      // 3. Rhythm
      await page.fill('#onb-wake', '08:00');
      await page.fill('#onb-sleep', '22:00');
      await page.fill('#onb-peak-start', '09:30');
      await page.fill('#onb-peak-end', '12:30');
      await next(page);

      // 4. Timetable
      await choose(page, 'timetable', 'later');
      await next(page);

      // 5. Theme + accent, previewed live
      await choose(page, 'theme', 'dark');
      await choose(page, 'accent', 'blue');
      await expect(page.locator('.onb-preview-dot')).toBeVisible();
      await next(page);

      // 6. Home widgets
      await expect(
        page.locator('[data-k="widget"][data-v="weekly"]'),
      ).toHaveAttribute('aria-pressed', 'true');
      await choose(page, 'widget', 'weekly');
      await next(page);

      // 7. Focus defaults
      await choose(page, 'focusStyle', 'deep');
      await choose(page, 'noise', 'pink');
      await next(page);

      // 8. Optional AI
      await page.fill('#onb-ai-key', 'AIza-e2e-key-123456');
      await page.getByRole('switch', { name: 'Let AI read your notes' }).click();
      await next(page);

      // 9. Summary + finish
      await expect(page.locator('.onb-count')).toHaveText('9 / 9');
      await expect(wizard).toContainText('Ada');
      await expect(wizard).toContainText('50 / 10 min');
      await page.getByRole('button', { name: 'Finish setup' }).click();
      await expect(wizard).toBeHidden();

      await page.waitForFunction(() => {
        const raw = window.localStorage.getItem('personalOS_settings_v1');
        if (!raw) return false;
        try {
          return JSON.parse(raw).data?.onboarding?.completed === true;
        } catch {
          return false;
        }
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);

      await expect(page.locator('.smart h1')).toContainText('Ada');

      const settings = (await savedSettings(page)) as Record<string, unknown>;
      expect(settings['identity']).toEqual({
        name: 'Ada',
        role: 'work',
        goals: ['assignments', 'exams'],
      });
      expect(settings['rhythm']).toEqual({
        wake: '08:00',
        sleep: '22:00',
        peakStart: '09:30',
        peakEnd: '12:30',
      });
      expect(settings['onboarding']).toMatchObject({ completed: true, timetable: 'later' });
      expect(settings['theme']).toBe('dark');
      expect(settings['accentColor']).toBe('blue');
      expect(settings['focus']).toEqual({
        style: 'deep',
        noise: 'pink',
        workMinutes: 50,
        breakMinutes: 10,
      });
      expect(settings['ai']).toEqual({
        enabled: true,
        provider: 'gemini',
        canReadNotes: true,
      });
      expect(settings['ai']).not.toHaveProperty('apiKey');
      const plaintext = await page.evaluate(() =>
        JSON.stringify({
          settings: window.localStorage.getItem('personalOS_settings_v1'),
          legacy: window.localStorage.getItem('personalOS_v1'),
        }),
      );
      expect(plaintext).not.toContain('AIza-e2e-key-123456');
      expect(settings['homeWidgets']).toMatchObject({
        visible: { progress: true, weekly: false },
      });

      const legacy = await page.evaluate(() => {
        const raw = window.localStorage.getItem('personalOS_v1');
        return raw ? JSON.parse(raw) : null;
      });
      expect(legacy.profile.name).toBe('Ada');
      expect(legacy.profile.role).toBe('Working professional');
      expect(legacy.profile.wake).toBe('08:00');
      expect(legacy.profile.sleep).toBe('22:00');
      expect(legacy.profile.bestTime).toBe('Morning');
      expect(legacy.profile.focusStyle).toBe('deep');
      expect(legacy.profile.noise).toBe('pink');
      expect(legacy.profile.accent).toBe('blue');
      expect(legacy.profile.onboarded).toBe(true);
      expect(legacy.settings.pomodoro).toEqual({ work: 50, break: 10 });
      expect(legacy.layout.hidden).toContain('weekly');
      expect(legacy.layout.hidden).not.toContain('progress');
      expect(legacy.tasks).toHaveLength(0);

      // Reload: onboarding stays finished.
      await page.reload();
      await expect(wizard).toBeHidden();

      // Personalize from Settings reopens with every answer selected.
      await page.goto('/#settings');
      await page.click('[data-action="personalize"]');
      await expect(wizard).toBeVisible();
      await expect(page.locator('#onb-name')).toHaveValue('Ada');
      await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
      await expect(page.locator('[data-k="role"][data-v="work"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await next(page);
      await expect(page.locator('[data-k="goal"][data-v="exams"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await next(page);
      await expect(page.locator('#onb-wake')).toHaveValue('08:00');
      await expect(page.locator('#onb-peak-start')).toHaveValue('09:30');
      await next(page);
      await expect(page.locator('[data-k="timetable"][data-v="later"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await next(page);
      await expect(page.locator('[data-k="theme"][data-v="dark"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(page.locator('[data-k="accent"][data-v="blue"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await next(page);
      await expect(page.locator('[data-k="widget"][data-v="weekly"]')).toHaveAttribute(
        'aria-pressed',
        'false',
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

test.describe('First-run onboarding skip', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('skip setup closes the wizard without writing Settings', async ({ page }) => {
    await page.goto('/');
    const wizard = page.getByRole('dialog', { name: 'Personalize Personal OS' });
    await expect(wizard).toBeVisible();

    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(wizard).toBeHidden();

    await page.reload();
    await expect(wizard).toBeHidden();

    const settings = await savedSettings(page);
    expect(settings).not.toBeNull();
    expect(settings?.['onboarding']).toMatchObject({
      completed: false,
      timetable: null,
    });
    expect(settings?.['identity']).toMatchObject({ name: '' });
    const legacy = await page.evaluate(() => {
      const raw = window.localStorage.getItem('personalOS_v1');
      return raw ? JSON.parse(raw) : null;
    });
    expect(legacy.profile.onboarded).toBe(true);
  });
});
