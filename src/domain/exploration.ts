/**
 * RS-CREATIVE-QUALITY-003 exploration candidates.
 *
 * A candidate pairs two source-grounded points of DIFFERENT kinds (a stated conflict, a stated
 * constraint, a stated motive, a contested account, a declared unknown, a measured difference …)
 * that share an entity, and lays out what the source grounds and what it does not: every step of
 * the mechanism chain is VERIFIED, DECLARED, ASSUMED or UNKNOWN. The pairing itself is always a
 * hypothesis. Nothing here promotes an assumption, asserts a cause or writes canon.
 *
 * The points come from the published artifacts (verified or declared relationships, audit
 * findings, Year 0 values). Name co-occurrence and thematic links are never used. The wording of
 * tensions, alternatives and tests is produced by fixed rules per kind of point, so it generalizes
 * to any entity; no topic, title or answer is written into this module.
 *
 * Pure and dependency-free: same input, same output.
 */

export const EXPLORATION_METHOD = 'pairwise-composition-of-source-grounded-points';
export const EXPLORATION_METHOD_VERSION = '1.0.0';
/** The existing label for machine-suggested ideas (see creative-intelligence/ai-adapter.ts). */
export const EXPLORATION_STATUS = 'HYPOTHETICAL_UNRATIFIED';

export const MECHANISMS = [
  'STATED_CAUSE', 'OPEN_CONFLICT', 'INSTITUTIONAL_CONSTRAINT', 'ACTOR_MOTIVE', 'SHARED_ORIGIN', 'CHRONOLOGY',
  'CONTESTED_ACCOUNT', 'DELIBERATE_AMBIGUITY', 'DECLARED_UNKNOWN', 'REVIEW_BOUNDARY', 'PROPOSAL_DIVERGENCE', 'QUANTITATIVE_ASYMMETRY',
] as const;
export type Mechanism = (typeof MECHANISMS)[number];
export type StepStatus = 'VERIFIED' | 'DECLARED' | 'ASSUMED' | 'UNKNOWN';

export interface ExplorationAnchor {
  /** Id that trace_evidence resolves in the same build. */
  evidence_id: string;
  evidence_class: 'SOURCE_VALUE' | 'SOURCE_QUOTATION' | 'RELATION_STATEMENT';
  /** Status exactly as the artifact states it. */
  epistemic_status: string;
  repository: string;
  source_commit: string;
  path: string;
  line: number | null;
  pointer: string | null;
  quote: string | null;
}
export interface ExplorationPoint {
  /** Stable key: the artifact id(s) the point is read from. */
  key: string;
  mechanism: Mechanism;
  /** How the point itself is supported. UNKNOWN marks an absence the source declares or leaves. */
  support: Exclude<StepStatus, 'ASSUMED'>;
  /** True when the point rests on the remodeling workspace (a proposal). */
  proposed: boolean;
  entities: string[];
  /** A neutral restatement built from artifact fields. */
  statement: string;
  anchors: ExplorationAnchor[];
  /**
   * Entities the other point must also be about. A comparison between two nations is only paired
   * with a point about both of them; without this, one shared name would be enough.
   */
  requires?: string[];
}

interface Lens { label: string; development: string; trade_off: string; fails_if: string; would_change: string }
/** One fixed wording per kind of point. Generic by construction: nothing here names an entity. */
export const LENSES: Readonly<Record<Mechanism, Lens>> = Object.freeze({
  STATED_CAUSE: { label: 'Stated cause', development: 'Develop from the cause the source states, and ask what else that cause would have to produce.', trade_off: 'Stays closest to canon; adds the least that is new.', fails_if: 'the cited passage states sequence or association rather than cause', would_change: 'A production passage that limits or qualifies the stated cause.' },
  OPEN_CONFLICT: { label: 'Stated conflict', development: 'Develop through the opposing party: what each side does next because the conflict exists. The conflict is stated; who is responsible for any later event is not.', trade_off: 'Clear stakes; risks reading a stated conflict as proof of who caused what.', fails_if: 'the source states that the conflict ended, was managed, or never reached the entities in this pairing', would_change: 'A production passage that dates, ends or narrows the conflict.' },
  INSTITUTIONAL_CONSTRAINT: { label: 'Stated rule or model', development: 'Develop through the rule: what it permits, what it forbids, and who must act inside it.', trade_off: 'Outcomes stay consistent with the stated rule; drama must come from working within it.', fails_if: 'the source states an exception to the rule, or a later rule replaces it', would_change: 'A production passage that amends, suspends or supersedes the rule.' },
  ACTOR_MOTIVE: { label: 'Stated motive', development: 'Develop through the actor: what the stated motive makes it want, fear or refuse in this situation.', trade_off: 'Gives the actor agency; a stated motive does not decide which choice it makes.', fails_if: 'the motive is stated for a different period or situation than the one explored', would_change: 'A production passage that scopes the motive to a period, or states a competing motive.' },
  SHARED_ORIGIN: { label: 'Stated common origin', development: 'Develop through inheritance: what the entities carry from the common origin and where they diverged.', trade_off: 'Explains resemblance and rivalry together; an origin is not a present-day cause.', fails_if: 'the source derives only one of the entities from that origin', would_change: 'A production passage that separates the origins or dates the divergence.' },
  CHRONOLOGY: { label: 'Order in time', development: 'Develop through sequence: what already existed when the later event occurred. Order is not cause.', trade_off: 'Hard to contradict; says nothing about why.', fails_if: 'the dated records are revised, or the events are not connected by any source statement', would_change: 'A production passage that states a link between the events, or a corrected date.' },
  CONTESTED_ACCOUNT: { label: 'Contested account', development: 'Develop through the tellers: who gives which account, what each omits, and who needs which version. Do not authenticate one account.', trade_off: 'Preserves the ambiguity the source keeps; the reader gets no verdict.', fails_if: 'a production passage authenticates one account as fact', would_change: 'A production passage that settles which account is true, which only the creator can author.' },
  DELIBERATE_AMBIGUITY: { label: 'Deliberate ambiguity', development: 'Develop around the gap: write what characters believe about it without closing it.', trade_off: 'Keeps a mystery the source may intend; later writing must not close it by accident.', fails_if: 'the source resolves the ambiguity elsewhere', would_change: 'A production passage that resolves or explicitly protects the ambiguity.' },
  DECLARED_UNKNOWN: { label: 'Declared unknown', development: 'Develop only what does not depend on the missing value, or mark any value explicitly as a proposal.', trade_off: 'Nothing is invented; the story cannot lean on a figure that does not exist.', fails_if: 'the source assigns the value after all', would_change: 'A production value or passage that assigns what is now unknown.' },
  REVIEW_BOUNDARY: { label: 'Stated boundary', development: 'Develop a case that tests the boundary without crossing it: who stands on which side, and who decides.', trade_off: 'Makes an abstract distinction concrete; a careless case can blur the boundary it tests.', fails_if: 'the source applies the boundary only to a different subject', would_change: 'A production passage that moves or sharpens the boundary.' },
  PROPOSAL_DIVERGENCE: { label: 'Production and remodeling differ', development: 'Develop both readings side by side, each labeled, and ask what the proposal would change downstream.', trade_off: 'Shows the cost of adopting the proposal; a proposal is not canon.', fails_if: 'the two sources no longer differ at the pinned commits', would_change: 'A creator decision in the production source to adopt, alter or decline the proposal.' },
  QUANTITATIVE_ASYMMETRY: { label: 'Measured difference', development: 'Develop through scale: what the measured difference makes easier or harder for each side. The figures state a difference, not an effect.', trade_off: 'Anchored in source values; any effect of the difference is an assumption.', fails_if: 'the values are not comparable (different unit, period or definition)', would_change: 'A production passage that states what the difference means, or a revised value.' },
});

export interface ExplorationStep { step: number; role: 'PRECONDITION' | 'BRIDGE' | 'ACTOR_CHOICE' | 'CONSEQUENCE'; claim: string; evidence_status: StepStatus; evidence_ids: string[] }
export interface ExplorationCandidate {
  candidate_id: string;
  status: typeof EXPLORATION_STATUS;
  mechanisms: [Mechanism, Mechanism];
  entities: Array<{ id: string; name: string }>;
  shared_entities: string[];
  tension: string;
  anchors: ExplorationAnchor[];
  anchor_check: { status: 'TWO_OR_MORE_INDEPENDENT' | 'MISSING_ANCHOR'; independent_locations: number; distinct_documents: number; note: string };
  mechanism_steps: ExplorationStep[];
  /** Materially different ways to develop the tension: each rests on a different kind of point with its own evidence. */
  alternatives: Array<{ id: string; mechanism: Mechanism; development: string; trade_off: string; basis: string; evidence_status: StepStatus; evidence_ids: string[] }>;
  disconfirmation_tests: Array<{ target: string; fails_if: string; would_change_assessment: string; check_with: { operation: string; arguments: Record<string, unknown> } }>;
  expected_impacts: Array<{ dimension: 'CROSS_DOMAIN_DEPENDENCY' | 'INSTITUTIONAL' | 'CONSISTENCY_CONSTRAINT' | 'UNKNOWN'; note: string; refs: string[] }>;
  next_step: { decision: string; research: Array<{ operation: string; arguments: Record<string, unknown> }> };
  novelty_diagnostic: {
    max_card_overlap: number;
    restates_existing_card: boolean;
    overlap_refs: Array<{ id: string; entity_overlap: number; anchor_overlap: number }>;
    max_sibling_overlap: number;
    not_an_objective_creativity_score: true;
  };
}
export interface ExplorationCard { id: string; entities: readonly string[]; anchor_keys: readonly string[] }
export interface ExplorationContext {
  /** Entity ids of the question, most relevant first. null: every point is in scope. Empty: the question matched nothing, so nothing is. */
  focus: readonly string[] | null;
  include_proposed: boolean;
  limit: number;
  cards: readonly ExplorationCard[];
  nameOf(id: string): string;
  kindOf(id: string): string | null;
  /** Entities one verified relationship away. */
  verifiedNeighbors(id: string): readonly string[];
  /** Unverified co-occurrence links counted for the entity. Never used as evidence. */
  candidateLinks(id: string): number;
  /** Audit findings that affect the entity. */
  findingsAbout(id: string): readonly string[];
  /** An existing decision tree a creator can walk for a new idea, when one is published. */
  ideation_tree_id: string | null;
}
export interface ExplorationResult {
  method: string;
  method_version: string;
  status: typeof EXPLORATION_STATUS;
  points_in_scope: number;
  considered: number;
  returned: number;
  omitted: number;
  withheld: { proposed_points_excluded: number; near_duplicates_suppressed: number };
  /** Set when the evidence cannot sustain a candidate. Nothing is fabricated to fill the list. */
  insufficient: string | null;
  /** How to read a candidate. Stated once here instead of in every candidate. */
  guide: { citations: string; step_statuses: Record<StepStatus, string>; creator_options: string[]; novelty_method: string; limits: string[] };
  /** Every candidate, best first; `returned` of them are in `candidates`. */
  ranked_ids: string[];
  candidates: ExplorationCandidate[];
  /** The single points found, when they could not be paired. Leads, not ideas. */
  unpaired_points: Array<{ mechanism: Mechanism; label: string; statement: string; evidence_status: StepStatus; anchors: ExplorationAnchor[] }>;
}

/** One point leads at most this many candidates before others get their turn. */
export const MAX_POINT_USES = 2;
const anchorKey = (a: { path: string; line: number | null; pointer: string | null }) => `${a.path}:${a.line ?? a.pointer ?? ''}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round = (v: number) => Math.round(v * 1000) / 1000;
const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; const u = a.size + b.size - n; return u ? n / u : 0; };
const share = (a: ReadonlySet<string>, b: ReadonlySet<string>) => { if (!a.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
/** FNV-1a, two seeds: a stable 12-hex id without a runtime crypto dependency. */
function stableId(text: string): string {
  const h = (seed: number) => { let x = seed >>> 0; for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16).padStart(8, '0'); };
  return `EXP-${(h(2166136261) + h(40503)).slice(0, 12).toUpperCase()}`;
}
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function composeExplorations(points: readonly ExplorationPoint[], ctx: ExplorationContext): ExplorationResult {
  const order = ctx.focus ?? [];
  const focus = new Set(order);
  const inScope = points.filter((p) => ctx.focus === null || p.entities.some((e) => focus.has(e))).sort((a, b) => cmp(a.key, b.key));
  const usable = inScope.filter((p) => ctx.include_proposed || !p.proposed);
  const cardSets = ctx.cards.map((c) => ({ id: c.id, entities: new Set(c.entities), anchors: new Set(c.anchor_keys) }));

  interface Draft { a: ExplorationPoint; b: ExplorationPoint; shared: string[]; entities: string[]; anchors: ExplorationAnchor[]; keys: Set<string>; id: string; relevance: number; overlap: number; restates: boolean; refs: ExplorationCandidate['novelty_diagnostic']['overlap_refs']; independent: number; group: string }
  const drafts: Draft[] = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i]!; const b = usable[j]!;
      if (a.mechanism === b.mechanism) continue;
      const shared = a.entities.filter((e) => b.entities.includes(e)).sort(cmp);
      if (!shared.length) continue;
      if ((a.requires ?? []).some((e) => !b.entities.includes(e)) || (b.requires ?? []).some((e) => !a.entities.includes(e))) continue;
      const entities = [...new Set([...a.entities, ...b.entities])].sort(cmp);
      const seen = new Set<string>();
      const anchors = [...a.anchors, ...b.anchors].filter((x) => (seen.has(x.evidence_id) ? false : (seen.add(x.evidence_id), true)));
      const keys = new Set(anchors.map(anchorKey));
      const refs = cardSets.map((c) => ({ id: c.id, entity_overlap: round(jaccard(new Set(entities), c.entities)), anchor_overlap: round(share(keys, c.anchors)) }))
        .filter((r) => r.entity_overlap > 0 || r.anchor_overlap > 0).sort((x, y) => (y.anchor_overlap + y.entity_overlap) - (x.anchor_overlap + x.entity_overlap) || cmp(x.id, y.id));
      drafts.push({
        a, b, shared, entities, anchors, keys, id: stableId(`${a.key}|${b.key}`),
        // Entities of the question weigh by their rank: the first counts 1, the second 1/2, and so on.
        relevance: round(entities.reduce((n, e) => { const i = order.indexOf(e); return i < 0 ? n : n + 1 / (1 + i); }, 0)),
        overlap: refs.length ? round(Math.max(...refs.map((r) => (r.anchor_overlap + r.entity_overlap) / 2))) : 0,
        restates: keys.size > 0 && refs.some((r) => r.anchor_overlap === 1),
        refs: refs.slice(0, 3), independent: keys.size,
        group: `${[a.mechanism, b.mechanism].sort().join('+')}|${shared.join(',')}`,
      });
    }
  }
  // Best first: on the question, independently anchored, not a restatement of a card, fully verified, then by id.
  const verified = (d: Draft) => Number(d.a.support === 'VERIFIED') + Number(d.b.support === 'VERIFIED');
  drafts.sort((x, y) => y.relevance - x.relevance || Number(y.independent >= 2) - Number(x.independent >= 2) || Number(x.restates) - Number(y.restates) || x.overlap - y.overlap || verified(y) - verified(x) || cmp(x.id, y.id));

  // One candidate per kind-pair on the same shared entities; kinds not yet shown go first.
  const groups = new Set<string>();
  const distinct = drafts.filter((d) => (groups.has(d.group) ? false : (groups.add(d.group), true)));
  // Order for variety, keeping rank inside each pass: first candidates that show a new kind of point and
  // do not lean on a point already used MAX_POINT_USES times, then the other unsaturated ones, then the rest.
  // A candidate that only restates an existing card is never moved up for variety: it comes last.
  const shown = new Set<Mechanism>();
  const uses = new Map<string, number>();
  const ranked: Draft[] = [];
  const unsaturated = (d: Draft) => (uses.get(d.a.key) ?? 0) < MAX_POINT_USES && (uses.get(d.b.key) ?? 0) < MAX_POINT_USES;
  let pool = distinct;
  for (const rule of [(d: Draft) => !d.restates && unsaturated(d) && (!shown.has(d.a.mechanism) || !shown.has(d.b.mechanism)), (d: Draft) => !d.restates && unsaturated(d), (d: Draft) => !d.restates, () => true]) {
    const left: Draft[] = [];
    for (const d of pool) {
      if (!rule(d)) { left.push(d); continue; }
      ranked.push(d);
      for (const p of [d.a, d.b]) { shown.add(p.mechanism); uses.set(p.key, (uses.get(p.key) ?? 0) + 1); }
    }
    pool = left;
  }
  const picked = ranked.slice(0, Math.max(0, ctx.limit));

  const build = (d: Draft): ExplorationCandidate => {
    const { a, b } = d;
    const ids = (p: ExplorationPoint) => p.anchors.map((x) => x.evidence_id);
    const sharedNames = list(d.shared.map((e) => ctx.nameOf(e)));
    const motive = a.mechanism === 'ACTOR_MOTIVE' ? a : b.mechanism === 'ACTOR_MOTIVE' ? b : usable.find((p) => p.mechanism === 'ACTOR_MOTIVE' && p.entities.some((e) => d.entities.includes(e)));
    const others = usable.filter((p) => p !== a && p !== b && p.mechanism !== a.mechanism && p.mechanism !== b.mechanism && p.entities.some((e) => d.shared.includes(e)));
    const lenses = [a, b, ...others.slice(0, 1)];
    // Every evidence id a candidate names is among its anchors: the two points first, then any further point it cites.
    const seen = new Set(d.anchors.map((x) => x.evidence_id));
    const cited = [...d.anchors, ...[...lenses.slice(2), ...(motive ? [motive] : [])].flatMap((p) => p.anchors).filter((x) => (seen.has(x.evidence_id) ? false : (seen.add(x.evidence_id), true)))];
    const siblings = picked.filter((x) => x !== d);
    const docs = new Set(d.anchors.map((x) => x.path));
    const institutional = [...new Set(d.entities.flatMap((e) => [e, ...ctx.verifiedNeighbors(e)]))].filter((e) => ['institution', 'organization', 'government', 'treaty', 'law'].includes(ctx.kindOf(e) ?? '')).sort(cmp);
    const neighbors = [...new Set(d.entities.flatMap((e) => ctx.verifiedNeighbors(e)))].filter((e) => !d.entities.includes(e)).sort(cmp);
    const findings = [...new Set(d.entities.flatMap((e) => ctx.findingsAbout(e)))].filter((f) => !d.anchors.some((x) => x.evidence_id.startsWith(`${f}#`))).sort(cmp);
    const links = d.entities.reduce((n, e) => n + ctx.candidateLinks(e), 0);
    const missing = [a, b].filter((p) => !p.anchors.length);
    return {
      candidate_id: d.id,
      status: EXPLORATION_STATUS,
      mechanisms: [a.mechanism, b.mechanism],
      entities: d.entities.map((e) => ({ id: e, name: ctx.nameOf(e) })),
      shared_entities: d.shared,
      tension: `${sharedNames}: how does the ${LENSES[a.mechanism].label.toLowerCase()} (step 1) bear on the ${LENSES[b.mechanism].label.toLowerCase()} (step 2)? The source grounds each point and does not connect them. That interaction is the open question.`,
      anchors: cited,
      anchor_check: {
        status: d.independent >= 2 && !missing.length ? 'TWO_OR_MORE_INDEPENDENT' : 'MISSING_ANCHOR',
        independent_locations: d.independent, distinct_documents: docs.size,
        note: missing.length ? `No source location can be cited for: ${missing.map((p) => LENSES[p.mechanism].label.toLowerCase()).join('; ')}. An absence has no passage to quote.` : d.independent >= 2 ? 'The two points rest on separate source locations, each checked against its pinned blob when the artifact was built.' : 'Both points rest on one source location.',
      },
      mechanism_steps: [
        { step: 1, role: 'PRECONDITION', claim: a.statement, evidence_status: a.support, evidence_ids: ids(a) },
        { step: 2, role: 'PRECONDITION', claim: b.statement, evidence_status: b.support, evidence_ids: ids(b) },
        { step: 3, role: 'BRIDGE', claim: `Both points involve ${sharedNames}. That they act on each other is not stated by the source; it is the hypothesis to test.`, evidence_status: 'ASSUMED', evidence_ids: [] },
        motive
          ? { step: 4, role: 'ACTOR_CHOICE', claim: `A motive is stated (${motive.statement}) Which choice it leads to in this situation is not stated.`, evidence_status: 'ASSUMED', evidence_ids: ids(motive) }
          : { step: 4, role: 'ACTOR_CHOICE', claim: 'No cited passage states who decides or why. The actor and the choice are the creator’s to author.', evidence_status: 'UNKNOWN', evidence_ids: [] },
        { step: 5, role: 'CONSEQUENCE', claim: 'No cited passage states a consequence of this interaction. Any consequence is a hypothesis until the creator authors it.', evidence_status: 'UNKNOWN', evidence_ids: [] },
      ],
      alternatives: lenses.map((p) => ({ id: `ALT-${p.mechanism}`, mechanism: p.mechanism, development: LENSES[p.mechanism].development, trade_off: LENSES[p.mechanism].trade_off, basis: p === a ? 'Step 1.' : p === b ? 'Step 2.' : p.statement, evidence_status: p.support, evidence_ids: ids(p) })),
      disconfirmation_tests: [
        ...[a, b].map((p) => ({
          target: LENSES[p.mechanism].label, fails_if: `This reading fails if ${LENSES[p.mechanism].fails_if}.`, would_change_assessment: LENSES[p.mechanism].would_change,
          check_with: ids(p).length ? { operation: 'trace_evidence', arguments: { ids: ids(p).slice(0, 5) } } : { operation: 'query_statistics', arguments: { entity: ctx.nameOf(p.entities[0]!) } },
        })),
        { target: 'The pairing', fails_if: 'The pairing is unsupported if no source passage places both points in the same case, and refuted if one states they are unrelated.', would_change_assessment: 'A production passage that connects the two points, or one that separates them.', check_with: { operation: 'analyze_narrative_impact', arguments: { node: d.shared[0]!, mode: 'neighbors' } } },
      ],
      expected_impacts: [
        ...(neighbors.length ? [{ dimension: 'CROSS_DOMAIN_DEPENDENCY' as const, note: `${neighbors.length} further entities are one verified relationship away. Writing this interaction touches what the source already states about them.`, refs: neighbors.slice(0, 8) }] : []),
        ...(institutional.length ? [{ dimension: 'INSTITUTIONAL' as const, note: 'Institutions, organizations, treaties or laws whose stated role would be implicated. No institutional or reputational consequence is stated by the source.', refs: institutional.slice(0, 8) }] : []),
        ...(findings.length ? [{ dimension: 'CONSISTENCY_CONSTRAINT' as const, note: 'Audit findings about these entities that any development has to respect.', refs: findings.slice(0, 8) }] : []),
        { dimension: 'UNKNOWN', note: `${links} unverified co-occurrence links exist for these entities. None is used here; each is a lead to check, not a relationship.`, refs: [] },
      ],
      next_step: {
        decision: `Decide whether these two points belong to one case for ${sharedNames}. Declining is a valid outcome and changes nothing.`,
        research: [
          { operation: 'get_entity_context', arguments: { id: d.shared[0]! } },
          ...(ctx.ideation_tree_id ? [{ operation: 'evaluate_decision_tree', arguments: { tree_id: ctx.ideation_tree_id } }] : []),
        ],
      },
      novelty_diagnostic: {
        max_card_overlap: d.overlap, restates_existing_card: d.restates, overlap_refs: d.refs,
        max_sibling_overlap: siblings.length ? round(Math.max(...siblings.map((s) => jaccard(d.keys, s.keys)))) : 0,
        not_an_objective_creativity_score: true,
      },
    };
  };

  return {
    method: EXPLORATION_METHOD, method_version: EXPLORATION_METHOD_VERSION, status: EXPLORATION_STATUS,
    points_in_scope: usable.length, considered: drafts.length, returned: picked.length, omitted: ranked.length - picked.length,
    withheld: { proposed_points_excluded: inScope.length - usable.length, near_duplicates_suppressed: drafts.length - distinct.length },
    insufficient: drafts.length ? null : usable.length
      ? 'The source-grounded points found for this question do not share an entity with a point of a different kind, so no pairing is supported. No candidate is fabricated.'
      : 'No verified or declared relationship, audit finding or comparable source value was found for this question. No candidate is fabricated.',
    guide: {
      citations: 'Evidence ids inside a candidate refer to that candidate’s anchors, which carry the full pinned citation. Each id also resolves through trace_evidence.',
      step_statuses: {
        VERIFIED: 'Stated by the pinned production source at the cited location.',
        DECLARED: 'Declared in the remodeling workspace: a proposal, not production canon.',
        ASSUMED: 'Not stated by any cited passage. Introduced by the composition as a hypothesis to test.',
        UNKNOWN: 'The source assigns no value or states nothing. Unknown, not false and not zero.',
      },
      creator_options: ['Keep the points separate. Nothing changes.', 'Explore the pairing as a labeled hypothesis outside canon.', 'Author a connecting passage in the production source. Only the creator can do this.'],
      novelty_method: 'Overlap with each existing opportunity card: the Jaccard overlap of entity ids, and the share of the candidate’s source locations the card already cites; max_card_overlap is the highest mean of the two. restates_existing_card is true when one card already cites every location. Sibling overlap is the Jaccard overlap of source locations with the other returned candidates. A low overlap says the material is not on a card; it does not say the idea is good.',
      limits: [
        'Not canon and not ratified. Only the creator changes canon, in the source repositories.',
        'Not a forecast and not a finding of cause. A verified relationship is not a verified cause.',
        'The tension, alternatives and tests are worded by fixed rules from the cited points. They assert nothing beyond those points.',
      ],
    },
    ranked_ids: ranked.map((d) => d.id),
    candidates: picked.map(build),
    unpaired_points: drafts.length ? [] : usable.slice(0, 5).map((p) => ({ mechanism: p.mechanism, label: LENSES[p.mechanism].label, statement: p.statement, evidence_status: p.support, anchors: p.anchors.slice(0, 3) })),
  };
}

// ---------------------------------------------------------------- points from the published artifacts
export interface PointRelation { id: string; type: string; source_id: string; target_id: string; verification: string; causal_class: string; rationale: string; source: { repository: string; commit_sha: string; path: string; line: number | null; quote: string } }
export interface PointFinding { id: string; category: string; classification: string; title: string; affected_entities: readonly string[]; synthetic?: boolean; passages: ReadonlyArray<{ side: string; repository: string; commit_sha: string; path: string; line: number | null; quote: string }> }
export interface PointFact { entity_id: string; entity: string; indicator: string; label: string; value: number; display?: string; unit: string; status: string; source: { repository: string; commit_sha: string; path: string; pointer: string | null } }

const RELATION_KINDS: Readonly<Record<string, { mechanism: Mechanism; verb: string }>> = Object.freeze({
  CAUSES: { mechanism: 'STATED_CAUSE', verb: 'is stated to cause' },
  CONFLICTS_WITH: { mechanism: 'OPEN_CONFLICT', verb: 'is in a stated conflict with' },
  CONSTRAINED_BY: { mechanism: 'INSTITUTIONAL_CONSTRAINT', verb: 'is constrained by' },
  DEFINES: { mechanism: 'INSTITUTIONAL_CONSTRAINT', verb: 'defines' },
  MOTIVATED_BY: { mechanism: 'ACTOR_MOTIVE', verb: 'is motivated by' },
  DERIVED_FROM: { mechanism: 'SHARED_ORIGIN', verb: 'derives from' },
  PRECEDES: { mechanism: 'CHRONOLOGY', verb: 'precedes' },
  FOLLOWS: { mechanism: 'CHRONOLOGY', verb: 'follows' },
  PROPOSES_CHANGE_TO: { mechanism: 'PROPOSAL_DIVERGENCE', verb: 'proposes a change to' },
});
const clip = (s: string, max = 240) => (s.length > max ? `${s.slice(0, max)}…` : s);
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** Relationships the source states or the remodeling workspace declares. Co-occurrence and thematic links are left out. */
export function pointsFromRelations(relations: readonly PointRelation[], nameOf: (id: string) => string): ExplorationPoint[] {
  const out = new Map<string, ExplorationPoint>();
  const anchor = (r: PointRelation): ExplorationAnchor => ({ evidence_id: r.id, evidence_class: 'RELATION_STATEMENT', epistemic_status: r.verification, repository: r.source.repository, source_commit: r.source.commit_sha, path: r.source.path, line: r.source.line, pointer: null, quote: r.source.quote ? clip(r.source.quote) : null });
  const participants = (event: string) => relations.filter((r) => r.type === 'PARTICIPATES_IN' && r.verification === 'VERIFIED_SOURCE_GROUNDED' && r.target_id === event);
  for (const r of [...relations].sort((a, b) => cmp(a.id, b.id))) {
    const kind = RELATION_KINDS[r.type];
    if (!kind || r.causal_class === 'CO_OCCURRENCE_ONLY' || r.causal_class === 'THEMATIC_ONLY') continue;
    if (r.type === 'CAUSES' && r.causal_class !== 'VERIFIED_CAUSAL') continue;
    if (r.verification !== 'VERIFIED_SOURCE_GROUNDED' && r.verification !== 'DECLARED_PROVENANCE') continue;
    const [first, second] = r.type === 'FOLLOWS' ? [r.target_id, r.source_id] : [r.source_id, r.target_id];
    // One point per kind and entity pair: a second passage for the same statement is a second anchor.
    const symmetric = kind.mechanism === 'OPEN_CONFLICT';
    const key = `${kind.mechanism}|${(symmetric ? [first, second].sort() : [first, second]).join('|')}`;
    const existing = out.get(key);
    if (existing) { if (!existing.anchors.some((a) => a.evidence_id === r.id) && r.type !== 'FOLLOWS') existing.anchors.push(anchor(r)); continue; }
    const declared = r.verification === 'DECLARED_PROVENANCE';
    const chain = kind.mechanism === 'CHRONOLOGY' ? [...participants(first), ...participants(second)] : [];
    const parties = (event: string) => { const p = participants(event).map((x) => x.source_id); return p.length ? p : [event]; };
    const verb = r.type === 'FOLLOWS' ? 'precedes' : kind.verb;
    out.set(key, {
      key, mechanism: kind.mechanism, support: declared ? 'DECLARED' : 'VERIFIED', proposed: declared,
      entities: [...new Set([first, second, ...chain.map((p) => p.source_id)])],
      statement: `${nameOf(first)} ${verb} ${nameOf(second)}. ${sentence(r.rationale)}${chain.length ? ` Participants on record: ${list([...new Set(chain.map((p) => nameOf(p.source_id)))])}.` : ''}`,
      anchors: [anchor(r), ...chain.map(anchor)],
      ...(kind.mechanism === 'CHRONOLOGY' ? { requires: [...new Set([...parties(first), ...parties(second)])] } : {}),
    });
  }
  return [...out.values()];
}

const FINDING_KINDS: Readonly<Record<string, Mechanism>> = Object.freeze({ UNRELIABLE_NARRATOR_POSSIBILITY: 'CONTESTED_ACCOUNT', INTENTIONAL_AMBIGUITY: 'DELIBERATE_AMBIGUITY', INSUFFICIENT_EVIDENCE: 'DECLARED_UNKNOWN', CREATIVE_REVIEW_CANDIDATE: 'REVIEW_BOUNDARY' });
const ORDER_CATEGORIES = new Set(['IMPOSSIBLE_EVENT_ORDERING', 'CHRONOLOGICAL_CONTRADICTION']);
/** A finding about more entities than this is a corpus-wide note, not a point about anything in particular. */
export const MAX_POINT_ENTITIES = 6;

/** Open points the audit classifies. Potential or verified inconsistencies are defects to review, not story mechanisms, and are left out. */
export function pointsFromFindings(findings: readonly PointFinding[]): ExplorationPoint[] {
  const out: ExplorationPoint[] = [];
  for (const f of [...findings].sort((a, b) => cmp(a.id, b.id))) {
    const base = FINDING_KINDS[f.classification];
    if (!base || f.synthetic || !f.passages.length || !f.affected_entities.length || f.affected_entities.length > MAX_POINT_ENTITIES) continue;
    const proposed = f.passages.some((p) => p.side === 'remodeling');
    const mechanism: Mechanism = f.classification !== 'CREATIVE_REVIEW_CANDIDATE' ? base : proposed ? 'PROPOSAL_DIVERGENCE' : ORDER_CATEGORIES.has(f.category) ? 'CHRONOLOGY' : 'REVIEW_BOUNDARY';
    out.push({
      key: f.id, mechanism, support: proposed ? 'DECLARED' : mechanism === 'DECLARED_UNKNOWN' ? 'UNKNOWN' : 'VERIFIED', proposed,
      entities: [...f.affected_entities],
      statement: `${sentence(f.title)} (audit classification: ${f.classification})`,
      anchors: f.passages.map((p, i) => ({ evidence_id: `${f.id}#${i + 1}`, evidence_class: 'SOURCE_QUOTATION' as const, epistemic_status: f.classification, repository: p.repository, source_commit: p.commit_sha, path: p.path, line: p.line, pointer: null, quote: p.quote ? clip(p.quote) : null })),
    });
  }
  return out;
}

/** Indicators compared between nations. The same short list the compact research pack shows. */
export const KEY_INDICATORS = ['population', 'sdi', 'gdp_usd', 'gdp_per_capita', 'land_area'] as const;
/** A difference below this factor is not called an asymmetry. A fixed, documented threshold. */
export const ASYMMETRY_FACTOR = 2;
const MAX_COMPARED_NATIONS = 4;

/**
 * Measured differences between nations of the question, and key values the source does not assign.
 * `nations` maps a narrative entity id to its statistical entity id, in relevance order.
 */
export function pointsFromStatistics(facts: readonly PointFact[], nations: ReadonlyArray<{ id: string; stat_id: string; name: string }>, indicators: ReadonlyArray<{ id: string; label: string }>): ExplorationPoint[] {
  const out: ExplorationPoint[] = [];
  const scope = nations.slice(0, MAX_COMPARED_NATIONS);
  const value = (stat: string, indicator: string) => facts.find((f) => f.entity_id === stat && f.indicator === indicator);
  const anchor = (f: PointFact): ExplorationAnchor => ({ evidence_id: `fact:${f.entity_id}:${f.indicator}`, evidence_class: 'SOURCE_VALUE', epistemic_status: f.status, repository: f.source.repository, source_commit: f.source.commit_sha, path: f.source.path, line: null, pointer: f.source.pointer, quote: null });
  for (let i = 0; i < scope.length; i++) {
    for (let j = i + 1; j < scope.length; j++) {
      const a = scope[i]!; const b = scope[j]!;
      let best: { fa: PointFact; fb: PointFact; factor: number } | null = null;
      for (const k of KEY_INDICATORS) {
        const fa = value(a.stat_id, k); const fb = value(b.stat_id, k);
        if (!fa || !fb || fa.value <= 0 || fb.value <= 0 || fa.unit !== fb.unit) continue;
        const factor = Math.max(fa.value, fb.value) / Math.min(fa.value, fb.value);
        if (factor >= ASYMMETRY_FACTOR && (!best || factor > best.factor)) best = { fa, fb, factor };
      }
      if (best) {
        const { fa, fb, factor } = best;
        out.push({
          key: `QTY|${a.stat_id}|${b.stat_id}|${fa.indicator}`, mechanism: 'QUANTITATIVE_ASYMMETRY', support: 'VERIFIED', proposed: false, entities: [a.id, b.id], requires: [a.id, b.id],
          statement: `${fa.label} (${fa.unit}): ${a.name} ${fa.display ?? fa.value} and ${b.name} ${fb.display ?? fb.value} at Year 0 in production main, a factor of ${Math.round(factor * 100) / 100}. The figures state a difference, not an effect.`,
          anchors: [anchor(fa), anchor(fb)],
        });
      }
    }
  }
  // A gap is an indicator the source assigns to at least one other entity of the same kind, and not to this one.
  const kindOf = (id: string) => id.split(':')[0];
  for (const n of scope) {
    const gaps = indicators.filter((k) => !value(n.stat_id, k.id) && facts.some((f) => f.indicator === k.id && f.entity_id !== n.stat_id && kindOf(f.entity_id) === kindOf(n.stat_id)));
    if (!gaps.length) continue;
    out.push({
      key: `GAP|${n.stat_id}`, mechanism: 'DECLARED_UNKNOWN', support: 'UNKNOWN', proposed: false, entities: [n.id],
      statement: `The source assigns no value to ${gaps.length} of ${indicators.length} indexed indicators for ${n.name} at Year 0${gaps.length ? `, among them ${list(gaps.slice(0, 4).map((k) => k.label))}` : ''}. They are unknown, not zero.`,
      anchors: [],
    });
  }
  return out;
}
