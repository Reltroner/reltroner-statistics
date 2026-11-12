#!/usr/bin/env node
/** Write fixture exports (every non-PDF format, single and consolidated) to a directory for cross-language validation. */
import fs from 'node:fs';
import path from 'node:path';
import { buildReportDocument } from '../src/export/model.ts';
import { renderFormat } from '../src/export/bundle.ts';
import { EXPORT_FORMATS } from '../src/export/plan.ts';
import { exportFixture } from '../tests/fixtures/export-fixture.ts';

const out = process.argv[2];
if (!out) throw new Error('Usage: export-fixture.ts <output-dir>');
fs.mkdirSync(out, { recursive: true });
const { context, findings } = await exportFixture();
const docs = { single: buildReportDocument(context, [findings[0]!], 'single'), consolidated: buildReportDocument(context, findings, 'consolidated') };
for (const [name, doc] of Object.entries(docs)) {
  for (const format of EXPORT_FORMATS) {
    if (format === 'pdf') continue;
    fs.writeFileSync(path.join(out, `${name}.${format}`), renderFormat(doc, format));
  }
}
process.stdout.write(`${JSON.stringify({ written: fs.readdirSync(out).sort() })}\n`);
