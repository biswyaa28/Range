import React, { useState } from 'react';
import { buildAiPayload, type GmailMessage } from '@/domain/integrations';
import { providerFor } from '@/engines/llm';
import { streamChat } from '@/engines/llm';
import { useAiKey, useSettings } from '@/store';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';

export interface AiDigestSummaryProps {
  messages: GmailMessage[];
  onOpenSettings: () => void;
}

export const AiDigestSummary: React.FC<AiDigestSummaryProps> = ({
  messages,
  onOpenSettings,
}) => {
  const settings = useSettings();
  const keyState = useAiKey();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const payload = buildAiPayload(messages);

  const run = async (): Promise<void> => {
    if (!keyState.hasKey) {
      setError('Add an AI key in Settings first.');
      return;
    }
    setBusy(true);
    setError('');
    setSummary('');
    try {
      const prompt = [
        'Summarize these university emails into a short action list.',
        'Use only the sender, subject and snippet below. Do not invent dates.',
        JSON.stringify(payload, null, 2),
      ].join('\n\n');
      await streamChat(
        providerFor(settings.ai.provider),
        keyState.key,
        [{ role: 'user', content: prompt }],
        { onDelta: (delta) => setSummary((current) => current + delta) },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate a summary.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        className="inbox-ai-button"
        onClick={() => {
          setOpen(true);
          setSummary('');
          setError('');
        }}
      >
        Preview AI summary
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="AI email summary">
        <div className="ai-digest">
          <p>
            Exactly this data will be sent: {payload.length} sender, subject and snippet
            records. Full email bodies are never included.
          </p>
          <pre className="ai-digest-payload" data-testid="ai-payload-preview">
            {JSON.stringify(payload, null, 2)}
          </pre>
          {!keyState.hasKey ? (
            <p className="hint">
              No AI key yet.{' '}
              <Button variant="secondary" onClick={onOpenSettings}>
                Open AI settings
              </Button>
            </p>
          ) : null}
          {summary ? <div className="ai-digest-result">{summary}</div> : null}
          {error ? <p role="alert">{error}</p> : null}
          <div className="settings-inline-actions">
            <Button onClick={() => void run()} disabled={busy || payload.length === 0}>
              {busy ? 'Summarizing…' : 'Send to AI'}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
