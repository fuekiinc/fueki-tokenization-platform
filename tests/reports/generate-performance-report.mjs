#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'tests/reports/lighthouse';
const scoreTargets = {
  performance: 0.8,
  accessibility: 0.9,
  bestPractices: 0.9,
  seo: 0.8,
};
const webVitalTargets = {
  lcpMs: 3500,
  cls: 0.1,
  tbtMs: 200,
  ttfbMs: 800,
};

const output = {
  generatedAt: new Date().toISOString(),
  lighthouseDir: outDir,
  targets: {
    scores: scoreTargets,
    webVitals: webVitalTargets,
  },
  pages: [],
};

if (fs.existsSync(outDir)) {
  const files = fs
    .readdirSync(outDir)
    .filter((name) => name.endsWith('.report.json'));
  const collectedPages = [];
  const parseErrors = [];
  for (const file of files) {
    const full = path.join(outDir, file);
    try {
      const stat = fs.statSync(full);
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      const performance = data.categories?.performance?.score ?? null;
      const accessibility = data.categories?.accessibility?.score ?? null;
      const bestPractices = data.categories?.['best-practices']?.score ?? null;
      const seo = data.categories?.seo?.score ?? null;
      const lcpMs = data.audits?.['largest-contentful-paint']?.numericValue ?? null;
      const cls = data.audits?.['cumulative-layout-shift']?.numericValue ?? null;
      const tbtMs = data.audits?.['total-blocking-time']?.numericValue ?? null;
      const ttfbMs = data.audits?.['server-response-time']?.numericValue ?? null;

      const scoreChecks = {
        performance:
          typeof performance === 'number'
            ? performance >= scoreTargets.performance
            : false,
        accessibility:
          typeof accessibility === 'number'
            ? accessibility >= scoreTargets.accessibility
            : false,
        bestPractices:
          typeof bestPractices === 'number'
            ? bestPractices >= scoreTargets.bestPractices
            : false,
        seo:
          typeof seo === 'number'
            ? seo >= scoreTargets.seo
            : false,
      };

      const webVitalChecks = {
        lcpMs:
          typeof lcpMs === 'number'
            ? lcpMs <= webVitalTargets.lcpMs
            : false,
        cls:
          typeof cls === 'number'
            ? cls <= webVitalTargets.cls
            : false,
        tbtMs:
          typeof tbtMs === 'number'
            ? tbtMs <= webVitalTargets.tbtMs
            : false,
        ttfbMs:
          typeof ttfbMs === 'number'
            ? ttfbMs <= webVitalTargets.ttfbMs
            : false,
      };

      collectedPages.push({
        file,
        url: data.finalUrl,
        modifiedAt: stat.mtime.toISOString(),
        modifiedAtMs: stat.mtimeMs,
        performance,
        accessibility,
        bestPractices,
        seo,
        webVitals: {
          lcpMs,
          cls,
          tbtMs,
          ttfbMs,
        },
        checks: {
          scores: scoreChecks,
          webVitals: webVitalChecks,
        },
        pass:
          Object.values(scoreChecks).every(Boolean) &&
          Object.values(webVitalChecks).every(Boolean),
      });
    } catch {
      parseErrors.push({ file, parseError: true });
    }
  }

  const latestByUrl = new Map();
  for (const page of collectedPages) {
    const existing = latestByUrl.get(page.url);
    if (!existing || page.modifiedAtMs > existing.modifiedAtMs) {
      latestByUrl.set(page.url, page);
    }
  }

  output.pages = Array.from(latestByUrl.values())
    .map(({ modifiedAtMs, ...rest }) => rest)
    .sort((a, b) => a.url.localeCompare(b.url));
  output.parseErrors = parseErrors;
  output.discardedHistoricalRuns = collectedPages.length - output.pages.length;
}

const validPages = output.pages.filter((page) => page.parseError !== true);
output.summary = {
  totalPages: output.pages.length + (output.parseErrors?.length ?? 0),
  selectedLatestPages: output.pages.length,
  parsedPages: validPages.length,
  passingPages: validPages.filter((page) => page.pass === true).length,
  failingPages: validPages.filter((page) => page.pass === false).length,
  parseErrors: output.parseErrors?.length ?? 0,
  discardedHistoricalRuns: output.discardedHistoricalRuns ?? 0,
  overallPass:
    validPages.length > 0 &&
    validPages.every((page) => page.pass === true),
};

fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/performance-report.json', JSON.stringify(output, null, 2));
console.log('[performance-report] wrote tests/reports/performance-report.json');
