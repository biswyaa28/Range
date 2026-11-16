import { test, expect, type Page } from '@playwright/test';
import { seedOnboarded } from './support';

const snapshot = {
  settings: {
    gmail: true,
    classroom: true,
    aiRead: true,
    senderFilters: [],
    labelFilters: [],
    classroomNotifications: false,
    includeInBackup: false,
  },
  auth: {
    state: 'connected',
    scopes: ['gmail.readonly', 'classroom.courses.readonly'],
    expiresAt: '2026-11-20T00:00:00.000Z',
    lastError: null,
  },
  gmail: {
    fetchedAt: '2026-11-16T09:00:00.000Z',
    messages: [
      {
        id: 'm1',
        threadId: 't1',
        sender: 'ITM University <exam@itm.edu>',
        senderEmail: 'exam@itm.edu',
        subject: 'DBMS assignment due Friday',
        snippet: 'Submit the assignment by Friday at 5 pm',
        receivedAt: '2026-11-16T08:00:00.000Z',
        bodyText: 'SECRET BODY MUST NOT LEAVE DEVICE',
      },
    ],
    digest: [
      {
        id: 'gmail:m1',
        messageId: 'm1',
        sender: 'ITM University <exam@itm.edu>',
        subject: 'DBMS assignment due Friday',
        receivedAt: '2026-11-16T08:00:00.000Z',
        dueDate: '2026-11-20',
        dueTime: '17:00',
        kind: 'assignment',
        snippet: 'Submit the assignment by Friday at 5 pm',
        forwarded: false,
      },
    ],
  },
  classroom: {
    fetchedAt: '2026-11-16T09:00:00.000Z',
    courses: [{ id: 'c1', name: 'Operating Systems', section: '', alternateLink: '' }],
    work: [
      {
        id: 'w1',
        courseId: 'c1',
        courseName: 'Operating Systems',
        title: 'OS Midterm Exam',
        description: '',
        alternateLink: 'https://classroom.google.com/c/c1/a/w1',
        dueAt: '2026-11-18T04:30:00.000Z',
        dueDate: '2026-11-18',
        dueTimeKnown: true,
        state: 'assigned',
        exam: true,
        kind: 'exam',
      },
    ],
    announcements: [
      {
        id: 'a1',
        courseId: 'c1',
        courseName: 'Operating Systems',
        text: 'Lab moved to Thursday.',
        alternateLink: 'https://classroom.google.com/c/c1',
        createdAt: '2026-11-15T09:00:00.000Z',
      },
    ],
  },
};

async function seedIntegration(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('personalOS_integrations_v1', JSON.stringify(value));
    window.localStorage.setItem('personalOS_integrations_mock', '1');
  }, snapshot);
}

test.describe('Google integrations (mocked)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await seedOnboarded(page);
    await seedIntegration(page);
    await page.route('https://www.googleapis.com/**', (route) => route.abort());
  });

  test('shows cached Gmail and Classroom, adds a deadline, and keeps bodies out of AI preview', async ({
    page,
  }) => {
    await page.goto('/#inbox');
    await expect(page.locator('.view-head h1')).toHaveText('Inbox');
    await expect(page.locator('[data-kind="exam"]')).toContainText('OS Midterm Exam');
    await expect(page.locator('[data-kind="assignment"]')).toContainText('DBMS assignment');
    await expect(page.getByText('Lab moved to Thursday.')).toBeVisible();

    await page.click('[data-action="inbox-add"]');
    await expect(page.getByText('Added to deadlines')).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const saved = JSON.parse(window.localStorage.getItem('personalOS_v1') ?? '{}');
          return (saved.deadlines ?? []).some((item: { title: string }) =>
            item.title.includes('DBMS'),
          );
        }),
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Preview AI summary' }).click();
    const preview = await page.locator('[data-testid="ai-payload-preview"]').textContent();
    expect(preview).toContain('DBMS assignment');
    expect(preview).not.toContain('SECRET BODY');
  });

  test('is reachable from Home and the mobile More sheet', async ({ page }) => {
    await page.goto('/#home');
    await expect(page.locator('.card[data-card="inbox"]')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#home');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Inbox', exact: true }).click();
    await expect(page).toHaveURL(/#inbox/);
    await expect(page.locator('.view-head h1')).toHaveText('Inbox');
  });
});
