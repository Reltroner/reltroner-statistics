import type { APIRoute } from 'astro';
import { getAudit, getStats } from '../../lib/data.ts';
import { ROUTES } from '../../lib/site.ts';
import { INDICATORS } from '../../domain/indicators.ts';

export const GET: APIRoute = () => {
  const stats = getStats();
  const present = new Set(stats.observations.map((o) => o.indicator_id));
  const entries = [
    ...ROUTES.map((r) => ({ title: r.title, href: r.path, kind: 'Page', summary: r.summary })),
    ...INDICATORS.filter((i) => present.has(i.id)).map((i) => ({ title: i.label, href: `/statistics/indicators/${i.id}`, kind: 'Indicator', summary: `${i.group} · ${i.unit}` })),
    ...stats.entities.filter((e) => e.kind === 'country').map((e) => ({ title: e.name, href: `/countries#${e.id.replace(':', '-')}`, kind: 'Country', summary: e.cohort === 'PROFILED_14' ? 'Profiled nation' : 'Development nation' })),
    ...getAudit().findings.filter((f) => f.priority !== 'P3').map((f) => ({ title: f.title, href: `/drift/${f.id}`, kind: 'Finding', summary: `${f.id} · ${f.classification} · ${f.file_path}` })),
    ...[
      ['Epistemic statuses', 'statuses'], ['Drift classification', 'classification'], ['Source authority', 'authority'],
      ['Determinism', 'determinism'], ['Statistical methods', 'methods'], ['Sufficiency rules', 'sufficiency'],
    ].map(([title, anchor]) => ({ title, href: `/methodology#${anchor}`, kind: 'Method', summary: 'Methodology' })),
  ];
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
