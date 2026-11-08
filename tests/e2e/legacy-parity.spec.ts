import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { seedOnboarded } from './support';

test.describe('Legacy export parity', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('imports every legacy collection and round-trips it through export', async ({ page }) => {
    await seedOnboarded(page);
    await page.goto('/#settings');

    await page.setInputFiles(
      '#imp-file',
      'tests/fixtures/legacy_export.json',
    );
    await expect(page.getByRole('dialog', { name: 'Import backup' })).toBeVisible();
    await page.getByRole('button', { name: 'Import backup' }).click();

    await page.goto('/#tasks');
    await expect(page.getByText('Email TA', { exact: true })).toBeVisible();

    await page.goto('/#plan');
    await expect(page.getByText('Discrete Math', { exact: true })).toBeVisible();
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('personalOS_v1') ?? '{}'));
    expect(imported.blocks[0].doneDates).toEqual([]);

    await page.goto('/#notes');
    await expect(page.getByText('Ideas', { exact: true })).toBeVisible();
    await expect(page.getByText('Ship small, ship daily.', { exact: true })).toBeVisible();

    await page.goto('/#deadlines');
    await expect(page.getByText('Final Essay', { exact: true })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.goto('/#settings');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();

    const exported = JSON.parse(readFileSync(path as string, 'utf8')) as Record<string, unknown>;

    for (const key of ['tasks', 'blocks', 'notes', 'deadlines'] as const) {
      expect(exported[key]).toEqual(imported[key]);
    }
  });
});
