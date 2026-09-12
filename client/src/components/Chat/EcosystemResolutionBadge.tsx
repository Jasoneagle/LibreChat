import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type SelectorState = {
  personality?: { id?: string };
  brain?: { id?: string };
  worker?: { id?: string };
  node?: { id?: string };
};

/** Shows the provider-neutral execution combination when the local selector API is available. */
export default function EcosystemResolutionBadge() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [state, setState] = useState<SelectorState | null>(null);

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
      .then((next) => setState(next))
      .catch(() => setState(null));
    return () => controller.abort();
  }, [conversationId]);

  if (!state) return null;
  const values = [state.personality?.id, state.brain?.id, state.worker?.id, state.node?.id];
  if (values.some((value) => !value)) return null;
  return (
    <div
      className="hidden max-w-[min(42vw,32rem)] truncate rounded-md border border-border-light bg-surface-secondary px-2 py-1 text-xs font-normal text-text-secondary md:block"
      title={`Personality: ${values[0]} · Brain: ${values[1]} · Worker: ${values[2]} · Node: ${values[3]}`}
      aria-label="Resolved ecosystem execution"
    >
      {values.join(' · ')}
    </div>
  );
}
