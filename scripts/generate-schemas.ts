#!/usr/bin/env node
/** Generate versioned JSON Schemas (draft 2020-12) from the Zod contracts. `--check` fails on drift. */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { JSON_SCHEMA_EXPORTS } from '../src/contracts/schemas.ts';
import { ROOT } from './lib/context.ts';

const dir = path.join(ROOT, 'analytics', 'schemas');
const check = process.argv.includes('--check');
let drift = 0;
fs.mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(JSON_SCHEMA_EXPORTS)) {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io: 'output' });
  const text = `${JSON.stringify({ $id: `https://reltroner-statistics.invalid/schemas/${name}`, ...json }, null, 2)}\n`;
  const file = path.join(dir, name);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  if (check) { process.stderr.write(`Schema drift: ${name}\n`); drift++; continue; }
  fs.writeFileSync(file, text);
  process.stdout.write(`wrote analytics/schemas/${name}\n`);
}
if (drift) process.exit(1);
