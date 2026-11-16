import { safeExternalUrl } from '@/domain/markdown';
import { platformName } from './index';

/**
 * Opens a validated http(s)/mailto link outside the app on desktop, and in
 * the system browser on Android. Returns false when the URL is not allowed.
 */
export async function openExternal(raw: string): Promise<boolean> {
  const url = safeExternalUrl(raw);
  if (!url) return false;

  if (platformName === 'macos' || platformName === 'windows' || platformName === 'linux') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:opener|open_url', { url });
      return true;
    } catch {
      return false;
    }
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
