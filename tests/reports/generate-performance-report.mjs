#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'tests/reports/lighthouse';
const output = {
  generatedAt: new Date().toISOString(),
  lighthouseDir: outDir,
  pages: [],
};

if (fs.existsSync(outDir)) {
  const files = fs
    .readdirSync(outDir)
    .filter((name) => name.endsWith('.report.json'));
  for (const file of files) {
    const full = path.join(outDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      output.pages.push({
        file,
        url: data.finalUrl,
        performance: data.categories?.performance?.score ?? null,
        accessibility: data.categories?.accessibility?.score ?? null,
        bestPractices: data.categories?.['best-practices']?.score ?? null,
        seo: data.categories?.seo?.score ?? null,
      });
    } catch {
      output.pages.push({ file, parseError: true });
    }
  }
}

fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/performance-report.json', JSON.stringify(output, null, 2));
console.log('[performance-report] wrote tests/reports/performance-report.json');
