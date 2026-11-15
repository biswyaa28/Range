import { readFileSync, writeFileSync } from 'node:fs';

/** Build the Tauri updater manifest for a GitHub Release. */
const [bundleDir, version, repository, tag, output] = process.argv.slice(2);
if (!bundleDir || !version || !repository || !tag || !output) {
  throw new Error('usage: make-latest-json.mjs <bundleDir> <version> <owner/repo> <tag> <output>');
}

const signature = readFileSync(`${bundleDir}/Personal-OS.app.tar.gz.sig`, 'utf8').trim();
const manifest = {
  version,
  notes: 'See the release notes on GitHub.',
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: {
    'darwin-aarch64': {
      signature,
      url: `https://github.com/${repository}/releases/download/${tag}/Personal-OS.app.tar.gz`,
    },
  },
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
