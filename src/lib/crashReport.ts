import { settingsStore } from '@/store';
import { platformName } from '@/platform';
import { redact } from './errorReporter';

const MAX_FIELD = 4_000;

export interface CrashReport {
  name: string;
  message: string;
  stack: string;
  appVersion: string;
  platform: string;
}

type CrashTransport = (report: CrashReport) => Promise<void>;

let transport: CrashTransport | null = null;

/** Replace the transport in tests or with a hosted collector. */
export function setCrashTransport(next: CrashTransport | null): void {
  transport = next;
}

function appVersion(): string {
  try {
    return __APP_VERSION__;
  } catch {
    return 'unknown';
  }
}

export function buildCrashReport(reason: unknown): CrashReport {
  const error = reason instanceof Error ? reason : null;
  return {
    name: redact(error?.name || 'Error').slice(0, 200),
    message: redact(error?.message || String(reason)).slice(0, MAX_FIELD),
    stack: redact(error?.stack || '').slice(0, MAX_FIELD),
    appVersion: appVersion(),
    platform: platformName,
  };
}

export function diagnosticsText(reason?: unknown): string {
  return JSON.stringify(reason === undefined ? buildCrashReport(null) : buildCrashReport(reason), null, 2);
}

async function postReport(report: CrashReport): Promise<void> {
  const endpoint = String(import.meta.env.VITE_CRASH_REPORT_ENDPOINT ?? '').trim();
  if (!endpoint) return;
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  });
}

/**
 * Sends only when the user opted in: error name/message/stack, app version and
 * platform. No notes, titles, emails, keys or free-form text.
 */
export async function sendCrashReport(reason: unknown): Promise<void> {
  try {
    if (!settingsStore.get().privacy.crashReports) return;
    const report = buildCrashReport(reason);
    if (transport) {
      await transport(report);
      return;
    }
    await postReport(report);
  } catch {
    // Crash reporting must never throw or loop.
  }
}

/** Local fallback: copy the same redacted diagnostics the user can inspect. */
export async function copyDiagnostics(reason?: unknown): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(diagnosticsText(reason));
    return true;
  } catch {
    return false;
  }
}
