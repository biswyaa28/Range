export type UpdateProgress = {
  status: 'checking' | 'downloading' | 'installing';
  percent: number | null;
};

/**
 * macOS-only update check. The updater plugin is imported lazily so web and
 * Android bundles never ship it. Returns the new version, or null when the
 * running build is current. Restart applies a downloaded update.
 */
export async function checkForUpdates(
  onProgress: (progress: UpdateProgress) => void,
): Promise<string | null> {
  onProgress({ status: 'checking', percent: null });
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;

  let total = 0;
  let downloaded = 0;
  onProgress({ status: 'downloading', percent: 0 });
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      onProgress({ status: 'downloading', percent: 0 });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress({
        status: 'downloading',
        percent: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
      });
    } else {
      onProgress({ status: 'installing', percent: 100 });
    }
  });
  return update.version;
}
