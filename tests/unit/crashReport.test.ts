import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '@/store';
import {
  buildCrashReport,
  copyDiagnostics,
  sendCrashReport,
  setCrashTransport,
  type CrashReport,
} from '@/lib/crashReport';

const error = new Error('Failed for a@b.com token=secret123456789012345678901234567890');

afterEach(() => {
  setCrashTransport(null);
  settingsStore.set({ privacy: { crashReports: false } });
});

describe('crash reports', () => {
  it('redacts personal data and keeps only the agreed fields', () => {
    const report = buildCrashReport(error);
    expect(Object.keys(report).sort()).toEqual(
      ['appVersion', 'message', 'name', 'platform', 'stack'].sort(),
    );
    expect(report.message).not.toContain('a@b.com');
    expect(report.stack).not.toContain('a@b.com');
  });

  it('does not send anything while the setting is off', async () => {
    const transport = vi.fn<(report: CrashReport) => Promise<void>>().mockResolvedValue();
    setCrashTransport(transport);
    await sendCrashReport(error);
    expect(transport).not.toHaveBeenCalled();
  });

  it('uses the pluggable transport after opt-in', async () => {
    const transport = vi.fn<(report: CrashReport) => Promise<void>>().mockResolvedValue();
    setCrashTransport(transport);
    settingsStore.set({ privacy: { crashReports: true } });
    await sendCrashReport(error);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].message).toContain('[email]');
  });

  it('copies redacted diagnostics as the local fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyDiagnostics(error)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"platform"'));
  });
});
