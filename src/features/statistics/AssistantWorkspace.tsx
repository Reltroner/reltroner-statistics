import { useRef, useState } from 'react';
import { STATUS_EXPLANATIONS, answerQuestion, type AgentAnswer, type AgentIndex, type EvidenceStatus } from '../../domain/assistant.ts';

const SUGGESTIONS = [
  'Berapa Phantomkind di Beluftner?',
  'Bandingkan ancestry Reltronland dan Depcutland.',
  'Berapa populasi Reltronland?',
  'Spatial 3D composition Reltronland.',
  'What is the SDI of Reltronland?',
  'What does the verified evidence say about Henchoway?',
];

const TONE: Readonly<Record<EvidenceStatus, string>> = {
  CANON_OBSERVED: 'canon', CANON_DERIVED: 'canon', MODEL_ESTIMATE: 'model', PROPOSED: 'proposed', INSUFFICIENT_DATA: 'unknown', SOURCE_MATCH: 'scenario', CANDIDATE: 'archived',
};

export default function AssistantWorkspace({ synthesisAvailable = false }: { synthesisAvailable?: boolean }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [synthesis, setSynthesis] = useState(false);
  const [prose, setProse] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const index = useRef<AgentIndex | null>(null);

  async function run(text: string) {
    if (busy || text.trim().length < 3) return;
    setBusy(true);
    setProse(null);
    setStatus('Reading the published evidence index…');
    try {
      if (!index.current) {
        const response = await fetch('/data/assistant-index.json', { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`evidence index unavailable (HTTP ${response.status})`);
        const parsed = (await response.json()) as AgentIndex;
        if (parsed.schema_version !== 'reltroner-agent-index.v2') throw new Error('unexpected index contract');
        index.current = parsed;
      }
      const grounded = answerQuestion(index.current, text);
      setAnswer(grounded);
      setStatus('Answer computed in your browser from the published evidence index. No external AI service was called.');
      if (synthesis && synthesisAvailable) {
        setStatus('Evidence answer ready. Requesting the optional server-side explanation…');
        const response = await fetch('/api/assistant', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text.trim() }) });
        const result = (await response.json().catch(() => ({ error: 'INVALID_RESPONSE' }))) as { answer?: string; mode?: string; error?: string };
        if (response.ok && typeof result.answer === 'string') {
          setProse(result.answer);
          setStatus(result.mode === 'OPTIONAL_LLM_SYNTHESIS' ? 'Optional explanation received. The verified values and sources remain in the evidence answer below.' : 'Evidence-only response; no model was used.');
        } else {
          setStatus(`The optional explanation is not available (${result.error ?? response.status}). The evidence answer below is complete without it.`);
        }
      }
    } catch (error) {
      setAnswer(null);
      setStatus(`The evidence index could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: { preventDefault(): void }) => { e.preventDefault(); void run(question); };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rs-card space-y-5 p-5 sm:p-7" aria-label="Ask the Statistics Intelligence Assistant">
        <div>
          <label htmlFor="assistant-question" className="block text-base font-semibold text-ink">Ask about Asthortera, its statistics or the source evidence</label>
          <textarea id="assistant-question" className="rs-input mt-3 block min-h-28 w-full" rows={4} maxLength={500}
            placeholder="Example: Compare the primary ancestry of Reltronland and Depcutland." value={question} onChange={(e) => setQuestion(e.target.value)} />
          <p className="mt-2 text-xs text-ink-3">{question.length}/500 characters · answered in your browser from published, pinned evidence</p>
        </div>
        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Optional explanation</legend>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" className="mt-1" checked={synthesis} disabled={!synthesisAvailable} onChange={(e) => setSynthesis(e.target.checked)} />
            <span>
              <strong className="text-ink">Request a generated explanation</strong>{' '}
              {synthesisAvailable
                ? '— sends your question to an external AI provider through a protected endpoint. Do not enter unpublished creative ideas.'
                : '— not available on this site: generative synthesis is switched off until the owner configures a provider, server-side secrets and rate limits. Every answer below is deterministic.'}
            </span>
          </label>
        </fieldset>
        <button type="submit" className="rs-button rs-button-primary !min-h-11" disabled={busy || question.trim().length < 3}>{busy ? 'Checking evidence…' : 'Answer from evidence'}</button>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-2">{status}</p>
      </form>

      <section className="rs-card p-5" aria-labelledby="assistant-try-h">
        <h2 id="assistant-try-h" className="rs-h3">Try a question</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s} className="min-w-0 max-w-full">
              <button type="button" className="rs-button rs-button-ghost !min-h-10 max-w-full !px-3 text-left !text-xs !whitespace-normal" onClick={() => { setQuestion(s); void run(s); }}>{s}</button>
            </li>
          ))}
        </ul>
      </section>

      {answer && (
        <section aria-labelledby="answer-h" className="rs-card p-5 sm:p-7" data-answer-intent={answer.intent} data-answer-status={answer.status}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="answer-h" className="rs-h2 min-w-0">{answer.heading}</h2>
            <span className="rs-badge" data-tone={answer.status === 'MIXED' ? 'unknown' : TONE[answer.status]}>{answer.status === 'MIXED' ? 'Mixed sources' : answer.status}</span>
          </div>
          {prose && (
            <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
              <h3 className="font-semibold text-ink">Generated explanation</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">{prose}</p>
              <p className="mt-2 text-xs text-ink-3">Explanatory prose only. The statements and sources below are the evidence.</p>
            </div>
          )}
          <ol className="mt-5 space-y-3" aria-label="Evidence statements">
            {answer.statements.map((s, i) => (
              <li key={i} className="rounded-xl border border-line p-3" data-statement-status={s.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rs-badge" data-tone={TONE[s.status]} title={STATUS_EXPLANATIONS[s.status]}>{s.status}</span>
                  {s.cite !== null && <a className="text-xs" href={`#assistant-cite-${s.cite + 1}`}>Source {s.cite + 1}</a>}
                </div>
                <p className="mt-2 break-words text-sm leading-7 text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
          {answer.citations.length > 0 && (
            <>
              <h3 className="rs-h3 mt-6">Pinned sources</h3>
              <ol className="mt-3 space-y-2 text-sm">
                {answer.citations.map((c, i) => (
                  <li key={i} id={`assistant-cite-${i + 1}`} className="min-w-0 break-words">
                    <span className="font-mono text-xs text-ink-3">{i + 1}.</span>{' '}
                    <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}<span className="rs-sr"> (opens in a new tab)</span></a>{' '}
                    <span className="break-all font-mono text-xs text-ink-3">{c.detail}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {answer.limitations.length > 0 && (
            <>
              <h3 className="rs-h3 mt-6">What the evidence does not establish</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">{answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </>
          )}
          <h3 className="rs-h3 mt-6">Continue exploring</h3>
          <ul className="mt-3 flex flex-wrap gap-2">{answer.suggested_routes.map((r) => <li key={r}><a className="rs-button rs-button-ghost !min-h-10 !px-3 !text-xs no-underline" href={r}>{r}</a></li>)}</ul>
        </section>
      )}

      <details className="rs-card p-5">
        <summary className="cursor-pointer font-semibold text-ink">What the status labels mean</summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
          {(Object.keys(STATUS_EXPLANATIONS) as EvidenceStatus[]).map((k) => (
            <div key={k} className="contents"><dt><span className="rs-badge" data-tone={TONE[k]}>{k}</span></dt><dd className="m-0 text-ink-2">{STATUS_EXPLANATIONS[k]}</dd></div>
          ))}
        </dl>
      </details>
    </div>
  );
}
