import type { Page } from '@playwright/test';

/**
 * Marks first-run onboarding complete before the app boots so suites that
 * predate the wizard start on their real target screen. Safe across reloads:
 * the profile flag is merged into whatever save already exists.
 */
export async function seedOnboarded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'personalOS_v1';
    const seededFlag = '__e2e_onboarded_seeded';
    if (window.sessionStorage.getItem(seededFlag) === '1') return;
    let data: Record<string, unknown> = {};

    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      }
    } catch {
      data = {};
    }

    const current = data.profile;
    const profile =
      current && typeof current === 'object' && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    data.profile = { ...profile, onboarded: true };
    window.localStorage.setItem(key, JSON.stringify(data));
    window.sessionStorage.setItem(seededFlag, '1');
  });
}
