import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type SelectorState = {
  personality?: { id?: string };
  brain?: { id?: string };
  worker?: { id?: string };
  node?: { id?: string };
};

const SELECTORS = ['personality', 'brain', 'worker', 'node'] as const;

/** Shows the provider-neutral execution combination when the local selector API is available. */
export default function EcosystemResolutionBadge() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [state, setState] = useState<SelectorState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!conversationId || conversationId === 'new') {
      setState(null);
      return;
    }
    const controller = new AbortController();
    fetch(
      `http://127.0.0.1:4318/v1/ecosystem/selectors?conversation_id=${encodeURIComponent(conversationId)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((next) => {
        setState(next);
        if (next) setDraft(Object.fromEntries(SELECTORS.map((selector) => [selector, next[selector]?.id ?? ''])));
      })
      .catch(() => setState(null));
    return () => controller.abort();
  }, [conversationId]);

  if (!state) return null;
  const values = [state.personality?.id, state.brain?.id, state.worker?.id, state.node?.id];
  if (values.some((value) => !value)) return null;
  const update = async (selector: (typeof SELECTORS)[number]) => {
    const id = draft[selector]?.trim();
    if (!id || !conversationId || !state) return;
    const identity = { id, source_version: state[selector]?.source_version ?? 'local-edit', ...(selector === 'node' ? { eligibility_evidence: state.node?.eligibility_evidence ?? 'manual-local-edit' } : {}) };
    const response = await fetch('http://127.0.0.1:4318/v1/ecosystem/selectors', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, selector, identity }),
    });
    if (response.ok) setState(await response.json());
  };

  return (
    <details className="hidden max-w-[min(42vw,32rem)] rounded-md border border-border-light bg-surface-secondary px-2 py-1 text-xs font-normal text-text-secondary md:block">
      <summary className="cursor-pointer truncate" title={`Personality: ${values[0]} · Brain: ${values[1]} · Worker: ${values[2]} · Node: ${values[3]}`}>
        Resolved: {values.join(' · ')}
      </summary>
      <div className="mt-2 grid gap-1 p-1" aria-label="Independent ecosystem selectors">
        {SELECTORS.map((selector) => (
          <label className="flex items-center gap-1" key={selector}>
            <span className="w-20 capitalize">{selector}</span>
            <input className="min-w-0 flex-1 rounded border border-border-light bg-surface-primary px-1" value={draft[selector] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [selector]: event.target.value }))} />
            <button type="button" className="rounded border border-border-light px-1" onClick={() => void update(selector)}>Save</button>
          </label>
        ))}
      </div>
    </details>
  );
}
