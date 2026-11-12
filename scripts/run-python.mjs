#!/usr/bin/env node
/**
 * Run a Python module in isolated mode (-I: no PYTHON* env vars, no user site, no cwd on sys.path)
 * with only analytics/python added to sys.path. Interpreter: workspace .venv when present,
 * otherwise RELTRONER_PYTHON, otherwise python3/python on PATH.
 *
 *   node scripts/run-python.mjs -m reltroner_analytics --input ...
 *   node scripts/run-python.mjs -m pytest analytics/python/tests -q
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'analytics', 'python');
const local = [path.join(root, '.venv', 'Scripts', 'python.exe'), path.join(root, '.venv', 'bin', 'python')].find((p) => fs.existsSync(p));
const interpreter = process.env.RELTRONER_PYTHON || local || (process.platform === 'win32' ? 'python' : 'python3');

const args = process.argv.slice(2);
if (args[0] !== '-m' || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(args[1] ?? '')) {
  process.stderr.write('Usage: run-python.mjs -m <module> [args...]\n');
  process.exit(2);
}
const mod = args[1];
const boot = [
  'import runpy, sys',
  `sys.path.insert(0, ${JSON.stringify(pkgDir)})`,
  `runpy.run_module(${JSON.stringify(mod)}, run_name='__main__', alter_sys=True)`,
].join('; ');
const env = { ...process.env, PYTHONHASHSEED: '0', MPLBACKEND: 'Agg', SOURCE_DATE_EPOCH: '0' };
const result = spawnSync(interpreter, ['-I', '-B', '-c', boot, ...args.slice(2)], { cwd: root, env, stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`Python interpreter unavailable (${interpreter}): ${result.error.message}\n`);
  process.exit(127);
}
process.exit(result.status ?? 1);
