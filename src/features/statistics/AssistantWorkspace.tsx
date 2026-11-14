import { useRef, useState, type FormEvent } from 'react';
import { answerQuestion, type AgentAnswer, type AgentIndex } from '../../domain/assistant.ts';

const suggestions = [
  'Berapa populasi Phantomkind di Beluftner?',
  'Bandingkan Depeisit di Reltronland dan Depcutland',
  'Spatial 3D composition Reltronland: land footprint and habitats',
  'What is the SDI of Reltronland?',
  'What do the sources say about Henchoway?',
];

export default function AssistantWorkspace() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [synthesis, setSynthesis] = useState(false);
  const [prose, setProse] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const index = useRef<AgentIndex | null>(null);

  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || question.trim().length < 3) return;
    setBusy(true);
    setProse(null);
    setStatus('Reading the public pinned evidence index…');
    try {
      if (!index.current) {
        const response = await fetch('/data/assistant-index.json', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Evidence index unavailable');
        const parsed = await response.json() as AgentIndex;
        if (parsed.schema_version !== 'reltroner-agent-index.v1') throw new Error('Unexpected index contract');
        index.current = parsed;
      }
      const grounded = answerQuestion(index.current, question);
      setAnswer(grounded);
      setStatus('Deterministic evidence answer ready. No external AI call was made.');
      if (synthesis) {
        setStatus('Evidence answer ready. Requesting optional server-side synthesis…');
        const response = await fetch('/api/assistant', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question.trim() }),
        });
        const result = await response.json().catch(() => ({ error: 'INVALID_RESPONSE' }));
        if (response.ok && typeof result.answer === 'string') {
          setProse(result.answer);
          setStatus(result.mode === 'OPTIONAL_LLM_SYNTHESIS'
            ? 'Optional AI synthesis received. Verified numbers and sources remain in the deterministic result below.'
            : 'Evidence-only response. No external model inference.');
        } else {
          setStatus('Optional AI synthesis not activated or unavailable (' + (result.error ?? response.status) + '). The deterministic answer remains available below.');
        }
      }
    } catch (error) {
      setAnswer(null);
      setStatus('The public evidence index could not be loaded: ' + (error instanceof Error ? error.message : 'unknown error'));
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-6">
    <form onSubmit={ask} className="rs-card space-y-5 p-5 sm:p-7" aria-label="Ask the Statistics Intelligence Assistant">
      <div>
        <label htmlFor="assistant-question" className="block text-base font-semibold text-ink">Ask a question about Asthortera, statistics or source evidence</label>
        <textarea id="assistant-question" className="mt-3 block min-h-28 w-full rounded-xl border border-line bg-surface-2 p-3 text-ink"
          placeholder="Example: Compare the primary ancestry of Reltronland and Depcutland…" rows={4} maxLength={500}
          value={question} onChange={(e) => setQuestion(e.target.value)} />
        <p className="mt-2 text-xs text-ink-3">{question.length}/500 characters · Queries default to read-only local deterministic evaluation</p>
      </div>
      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Answer mode</legend>
        <label className="flex items-start gap-3 text-sm text-ink-2">
          <input type="checkbox" checked={synthesis} onChange={(e) => setSynthesis(e.target.checked)} className="mt-1" />
          <span><strong className="text-ink">Request optional generative synthesis</strong> — Explicit opt-in sends your question to a configured external AI provider through a protected Cloudflare endpoint. The service is disabled until the owner enables server secrets, a model, and rate limiting. Do not enter unpublished/private creative ideas.</span>
        </label>
      </fieldset>
      <button type="submit" className="rs-button rs-button-primary !min-h-11" disabled={busy || question.trim().length < 3}>{busy ? 'Checking evidence…' : 'Answer from evidence →'}</button>
      {status && <p role="status" className="text-sm text-ink-2">{status}</p>}
    </form>
    <div className="rs-card p-5">
      <h2 className="rs-h3">Try a source-grounded question</h2>
      <ul className="mt-3 flex flex-wrap gap-2">{suggestions.map((s) =>
        <li key={s}><button type="button" className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs" onClick={() => { setQuestion(s); setAnswer(null); setProse(null); setStatus(''); }}>{s}</button></li>,
      )}</ul>
    </div>
    {answer && <section aria-labelledby="answer-h" className="rs-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="answer-h" className="rs-h2">{answer.heading}</h2>
        <span className="rs-chip">{answer.status}</span>
      </div>
      {prose && <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
        <h3 className="font-semibold text-ink">Optional AI explanation</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">{prose}</p>
        <p className="mt-2 text-xs text-ink-3">Explanatory prose only. Always validate against the deterministic evidence and citations below.</p>
      </div>}
      <div className="mt-5 space-y-3">
        {answer.paragraphs.map((p, i) => <p key={i} className="text-sm leading-7 text-ink-2">{p}</p>)}
      </div>
      {answer.citations.length > 0 && <>
        <h3 className="rs-h3 mt-6">Pinned source evidence</h3>
        <ul className="mt-3 space-y-2 text-sm">{answer.citations.map((c, i) =>
          <li key={i} className="min-w-0 break-words"><a href={c.url} target="_blank" rel="noopener noreferrer">{c.title} <span className="rs-sr">(opens in a new tab)</span></a> <span className="text-ink-3">· {c.detail}</span></li>,
        )}</ul>
      </>}
      {answer.limitations.length > 0 && <>
        <h3 className="rs-h3 mt-6">What the evidence does not establish</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">{answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </>}
      <h3 className="rs-h3 mt-6">Continue exploring</h3>
      <ul className="mt-3 flex flex-wrap gap-2">{answer.suggested_routes.map((r) => <li key={r}><a className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs no-underline" href={r}>{r}</a></li>)}</ul>
    </section>}
  </div>;
}
