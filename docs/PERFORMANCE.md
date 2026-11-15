# Performance baseline

Measured 2026-11-15 on macOS (Apple silicon), Chromium via Playwright, Vite dev
server for interaction timing and a production build for bundle size.

## 5,000-task profile

Seed the test profile with `npm run seed:stress -- 5000` (writes
`.tmp/stress-profile.json`). The Playwright check `tests/e2e/perf.spec.ts` loads
the same 5,000-task save, opens `#tasks`, and scrolls to the final row.

| Metric | Result |
| --- | --- |
| Initial task render (navigation to first row) | 264 ms |
| First contentful paint (Performance API) | 208 ms |
| DOM interactive (navigation timing, TTI proxy) | 47 ms |
| Task rows in the DOM after load | 19 |
| Task rows in the DOM at the bottom | 19 |
| Committed task rows at 5,000 items | 5,000 (windowed) |

The target was under 1.5 s for the initial render and fewer than 200 rows in the
DOM; both hold with a wide margin. `useVirtualList` only windows lists at 100
rows or more, so ordinary lists keep native find-in-page and tab order.

## Production bundle

`npm run build` output for the same commit:

| Asset group | Raw | Gzip |
| --- | --- | --- |
| JavaScript chunks | 1.49 MB | 420 KB |
| CSS | 31 KB | 30 KB |
| `dist/` total | 1.5 MB | — |

The largest single chunk is the Firebase SDK (`index.esm`, 560 kB raw / 165 kB
gzip) and is loaded only for cloud sync. Route views are lazy-loaded; the
initial app chunk is 387 kB raw / 118 kB gzip.

## Reproducing

```bash
npm run seed:stress -- 5000
npx playwright test tests/e2e/perf.spec.ts --reporter=line
npm run build
```

The browser-side numbers come from `performance.getEntriesByType('paint')`
(FCP) and `performance.getEntriesByType('navigation')[0].domInteractive`
(TTI proxy; navigation timing has no official TTI field). The initial-render
number is wall-clock from `page.goto` to the first task row.
