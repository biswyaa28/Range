import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ACTION_TOOLS,
  ActionError,
  actionSystemPrompt,
  applyProposal,
  parseActionToolCalls,
  type ActionContext,
  type ActionProposal,
} from '@/actions';
import { useMediaQuery } from '@/hooks';
import { providerMessages } from '@/domain/chat';
import type { ChatMessage } from '@/domain/chat';
import { Haptics } from '@/engines/haptics';
import {
  friendlyErrorMessage,
  isAbort,
  LLMError,
  PROVIDER_META,
  providerFor,
  READ_TOOLS,
  executeReadTool,
  streamChat,
  type LLMMessage,
  type LLMToolCall,
} from '@/engines/llm';
import { platformName } from '@/platform';
import {
  aiKeyStore,
  chatStore,
  settingsStore,
  store,
  useAiKey,
  useChat,
  useSettings,
} from '@/store';
import { Icon } from '@/ui/Icon';
import { VirtualRows } from '@/ui/VirtualRows';
import { useToast } from '@/ui/Toast';
import { closeChat, isChatOpen, subscribeChat } from './chatBus';
import './ChatPanel.css';

export interface ChatPanelProps {
  onOpenSettings: () => void;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <article
    className={`chat-message chat-message--${message.role}${
      message.status === 'error' ? ' chat-message--error' : ''
    }`}
    data-chat-message={message.role}
    data-status={message.status}
  >
    <div className="chat-bubble">
      {message.content ? (
        <p className="chat-text">{message.content}</p>
      ) : message.status === 'streaming' ? (
        <p className="chat-text chat-thinking" aria-label="Assistant is thinking">
          <span />
          <span />
          <span />
        </p>
      ) : null}
      {message.status === 'streaming' && message.content ? (
        <span className="chat-cursor" aria-hidden="true" />
      ) : null}
      {message.error ? <p className="chat-message-error">{message.error}</p> : null}
    </div>
    <span className="chat-time">{timeLabel(message.createdAt)}</span>
  </article>
);

interface ProposalCardProps {
  proposal: ActionProposal;
  error?: string;
  confirming: boolean;
  onApply: (proposal: ActionProposal) => void;
  onDismiss: (proposal: ActionProposal) => void;
}

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  error,
  confirming,
  onApply,
  onDismiss,
}) => (
  <article className="chat-proposal" data-proposal={proposal.name}>
    <div className="chat-proposal-head">
      <span className="chat-proposal-kicker">Proposed change</span>
      <h3 className="chat-proposal-title">{proposal.preview.title}</h3>
    </div>
    <p className="chat-proposal-summary">{proposal.preview.summary}</p>
    <dl className="chat-proposal-changes">
      {proposal.preview.changes.map((change, index) => (
        <div className="chat-proposal-row" key={`${change.label}-${index}`}>
          <dt>{change.label}</dt>
          <dd>
            <span className="chat-proposal-before">{change.before}</span>
            <span className="chat-proposal-arrow" aria-hidden="true">
              →
            </span>
            <span className="chat-proposal-after">{change.after}</span>
          </dd>
        </div>
      ))}
    </dl>
    {error ? (
      <p className="chat-proposal-error" role="alert">
        {error}
      </p>
    ) : null}
    {confirming ? <p className="chat-proposal-error">This is destructive. Tap again to confirm.</p> : null}
    <div className="chat-proposal-actions">
      <button
        type="button"
        className="chat-secondary-btn"
        data-action="proposal-dismiss"
        onClick={() => onDismiss(proposal)}
      >
        Dismiss
      </button>
      <button
        type="button"
        className="chat-proposal-apply"
        data-action="proposal-apply"
        onClick={() => onApply(proposal)}
        aria-label={`${confirming ? 'Confirm' : 'Apply'} ${proposal.preview.title}`}
      >
        {confirming ? 'Confirm' : 'Apply'}
      </button>
    </div>
  </article>
);

export const ChatPanel: React.FC<ChatPanelProps> = ({ onOpenSettings }) => {
  const toast = useToast();
  const open = useSyncExternalStore(subscribeChat, isChatOpen, isChatOpen);
  const settings = useSettings();
  const keyState = useAiKey();
  const state = useChat();
  const narrow = useMediaQuery('(max-width: 899px)');
  const sheet = platformName === 'android' || (platformName !== 'macos' && narrow);
  const layout = sheet ? 'sheet' : 'side';

  const provider = providerFor(settings.ai.provider);
  const meta = PROVIDER_META[settings.ai.provider];

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [retryText, setRetryText] = useState('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [proposalErrors, setProposalErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [notesReadThisTurn, setNotesReadThisTurn] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  const panelRef = useRef<HTMLElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolCallsRef = useRef<LLMToolCall[]>([]);
  const notesReadRef = useRef(false);

  const actionContext = useCallback(
    (): ActionContext => ({
      getState: () => store.get(),
      getSettings: () => settingsStore.get(),
      updateState: (mutator) => store.set(mutator),
      updateSettings: (mutator) => settingsStore.update(mutator),
    }),
    [],
  );

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.messages, proposals]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    Haptics.tap();
    document.body.classList.add('chat-open');
    const timer = window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea && !textarea.disabled) {
        textarea.focus();
        return;
      }
      // Without a provider the composer is disabled; keep focus in the dialog.
      panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    }, 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChat();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('chat-open');
      abortRef.current?.abort();
      const opener = openerRef.current;
      if (opener && opener.isConnected) {
        try {
          opener.focus({ preventScroll: true });
        } catch {
          // ignore
        }
      }
    };
  }, [open]);

  const handleTrap = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const send = useCallback(
    async (raw: string, reuseUser = false): Promise<void> => {
      const text = raw.trim();
      if (!text || busy) return;

      await aiKeyStore.load();
      const key = aiKeyStore.getKey().trim();
      if (!key) {
        setError('Add your Gemini API key in Settings to start chatting.');
        setShowKeyPrompt(true);
        Haptics.warning();
        return;
      }
      if (!provider.available) {
        setError(meta.note);
        Haptics.warning();
        return;
      }

      setError(null);
      setLimitReached(false);
      setShowKeyPrompt(false);
      setRetryText('');
      setInput('');
      if (!reuseUser) chatStore.add('user', text);

      const history = providerMessages(chatStore.get().messages);
      const messages: LLMMessage[] = [
        { role: 'system', content: actionSystemPrompt(actionContext()) },
        ...history,
      ];
      const assistant = chatStore.add('assistant', '', 'streaming');
      const controller = new AbortController();
      abortRef.current = controller;
      toolCallsRef.current = [];
      setSources([]);
      setNotesReadThisTurn(false);
      notesReadRef.current = false;
      setBusy(true);
      Haptics.tap();

      try {
        await streamChat(provider, key, messages, {
          signal: controller.signal,
          tools: [...ACTION_TOOLS, ...READ_TOOLS],
          onDelta: (delta) => chatStore.append(assistant.id, delta),
          onToolCall: async (call) => {
            toolCallsRef.current.push(call);
            const readToolNames = ['search_notes', 'get_note', 'get_stats', 'get_tasks', 'get_timetable'];
            if (readToolNames.includes(call.name)) {
              const status =
                call.name === 'search_notes' || call.name === 'get_note'
                  ? 'Reading your notes…'
                  : call.name === 'get_tasks'
                    ? 'Checking tasks…'
                    : call.name === 'get_timetable'
                      ? 'Checking your schedule…'
                      : 'Checking your stats…';
              setToolStatus(status);
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
              const result = executeReadTool(
                call.name as 'search_notes' | 'get_note' | 'get_stats' | 'get_tasks' | 'get_timetable',
                typeof call.args === 'object' && call.args !== null ? call.args as Record<string, unknown> : {},
                { state: store.get(), settings: settingsStore.get() },
              );
              setToolStatus(null);
              if (!result.accessDisabled && result.noteIds.length > 0) {
                setSources((current) => [...new Set([...current, ...result.noteIds])]);
                setNotesReadThisTurn(true);
                notesReadRef.current = true;
              }
              return { name: call.name, response: { status: result.accessDisabled ? 'access disabled' : 'ok', data: result.content } };
            }
            return { name: call.name, response: { status: 'proposed', note: 'awaiting user approval' } };
          },
        });

        const reply = chatStore.get().messages.find((message) => message.id === assistant.id);
        const batch = parseActionToolCalls(
          toolCallsRef.current.filter(
            (call) =>
              !['search_notes', 'get_note', 'get_stats', 'get_tasks', 'get_timetable'].includes(call.name),
          ),
          actionContext(),
        );
        toolCallsRef.current = [];

        chatStore.update(assistant.id, { status: 'complete' });
        if (batch.proposals.length > 0) {
          setProposals((current) => [...current, ...batch.proposals]);
          setProposalErrors((current) => {
            const next = { ...current };
            for (const proposal of batch.proposals) delete next[proposal.id];
            return next;
          });
          const currentContent = chatStore.get().messages.find((message) => message.id === assistant.id)?.content.trim();
          chatStore.update(assistant.id, {
            content: currentContent
              ? `${currentContent}\n\nReview the proposed changes below.`
              : 'Review the proposed changes below.',
          });
          if (notesReadRef.current) {
            chatStore.update(assistant.id, {
              content: `${chatStore.get().messages.find((message) => message.id === assistant.id)?.content ?? ''}\n\nNote: this proposal is based on note data you allowed AI to read.`,
            });
          }
        }
        if (batch.rejected.length > 0) {
          chatStore.update(assistant.id, { error: batch.rejected.join(' ') });
        } else if (!reply?.content.trim() && batch.proposals.length === 0) {
          chatStore.update(assistant.id, {
            content: "I couldn't turn that into an app change.",
          });
        }
        chatStore.flush();
        Haptics.success();
      } catch (caught) {
        toolCallsRef.current = [];
        if (isAbort(caught)) {
          chatStore.update(assistant.id, { status: 'stopped' });
          chatStore.flush();
        } else {
          const message = friendlyErrorMessage(caught);
          setLimitReached(caught instanceof LLMError && caught.code === 'rate-limit');
          chatStore.update(assistant.id, { status: 'error', error: message });
          chatStore.flush();
          setError(message);
          setRetryText(text);
          Haptics.error();
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [actionContext, busy, meta.note, provider],
  );

  const stop = (): void => {
    abortRef.current?.abort();
  };

  const retry = (): void => {
    if (!retryText) return;
    void send(retryText, true);
  };

  const apply = (proposal: ActionProposal): void => {
    if (proposal.risk === 'destructive' && confirming !== proposal.id) {
      setConfirming(proposal.id);
      return;
    }
    try {
      const undo = applyProposal(proposal, actionContext());
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      setConfirming(null);
      setProposalErrors((current) => {
        const next = { ...current };
        delete next[proposal.id];
        return next;
      });
      Haptics.success();
      toast.showToast(
        undo.label,
        'Undo',
        () => {
          try {
            undo.revert();
            Haptics.success();
            toast.showToast('Change undone');
          } catch {
            Haptics.error();
            toast.showToast('That change could not be undone.');
          }
        },
        8000,
      );
    } catch (caught) {
      const message =
        caught instanceof ActionError
          ? caught.message
          : 'That change could not be applied.';
      setProposalErrors((current) => ({ ...current, [proposal.id]: message }));
      Haptics.error();
    }
  };

  const dismiss = (proposal: ActionProposal): void => {
    setProposals((current) => current.filter((item) => item.id !== proposal.id));
    setProposalErrors((current) => {
      const next = { ...current };
      delete next[proposal.id];
      return next;
    });
    setConfirming((current) => (current === proposal.id ? null : current));
  };

  const applyAllLowRisk = (): void => {
    for (const proposal of [...proposals]) {
      if (proposal.risk === 'low') apply(proposal);
    }
  };

  const clear = (): void => {
    if (state.messages.length === 0 && proposals.length === 0) return;
    chatStore.clear();
    chatStore.flush();
    setProposals([]);
    setProposalErrors({});
    setError(null);
    setRetryText('');
    Haptics.warning();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  if (!open) return null;

  const keyMissing = keyState.loaded && !keyState.hasKey;

  return (
    <div
      className="chat-backdrop"
      data-layout={layout}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeChat();
      }}
    >
      <aside
        ref={panelRef}
        className={`chat-panel chat-panel--${layout}`}
        data-layout={layout}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-title"
        onKeyDown={handleTrap}
      >
        <div className="chat-head">
          <div className="chat-heading">
            <span className="chat-mark">
              <Icon name="chat" size={17} />
            </span>
            <div>
              <h2 className="chat-title" id="chat-title">
                AI chat
              </h2>
              <p className="chat-subtitle">
                {meta.label} · {meta.model}
                {provider.available ? '' : ' · coming soon'}
              </p>
            </div>
          </div>
          <div className="chat-head-actions">
            <button
              type="button"
              className="chat-icon-btn"
              data-action="clear-chat"
              onClick={clear}
              disabled={(state.messages.length === 0 && proposals.length === 0) || busy}
              aria-label="Clear chat history"
              title="Clear history"
            >
              <Icon name="trash" size={16} />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              data-action="close-chat"
              onClick={closeChat}
              aria-label="Close AI chat"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        </div>

        {(keyMissing || showKeyPrompt) && (
          <div className="chat-setup" data-chat-setup>
            <div>
              <strong>Connect Gemini</strong>
              <p>
                Paste a Google AI Studio key in Settings. It is stored in secure
                storage and never synced.
              </p>
            </div>
            <button
              type="button"
              className="chat-secondary-btn"
              data-action="chat-open-settings"
              onClick={onOpenSettings}
            >
              Open settings
            </button>
          </div>
        )}

        {error ? (
          <div className="chat-error" role="alert">
            {limitReached ? <strong>AI limit reached</strong> : null}
            <span>{error}</span>
            {retryText ? (
              <button
                type="button"
                className="chat-secondary-btn"
                data-action="chat-retry"
                onClick={retry}
                disabled={busy}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="chat-log" ref={logRef} role="log" aria-live="polite">
          {state.messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-mark">
                <Icon name="chat" size={22} />
              </span>
              <h3>Ask me anything</h3>
              <p>
                Plan a focus block, untangle a task list, or think through your week.
                Chats stay on this device.
              </p>
            </div>
          ) : (
            <VirtualRows
              items={state.messages}
              rowHeight={150}
              overscan={6}
              scrollRef={logRef}
              getKey={(message) => message.id}
              testId="chat-rows"
              renderRow={(message) => <MessageBubble message={message} />}
            />
          )}
          {proposals.length > 0 ? (
            <div className="chat-proposals" aria-label="Proposed changes">
              {notesReadThisTurn ? <p className="chat-proposal-error">This proposal used note data from this turn.</p> : null}
              {proposals.some((proposal) => proposal.risk === 'low') ? (
                <button type="button" className="chat-proposal-apply" data-action="proposal-apply-all" onClick={applyAllLowRisk}>
                  Apply all low-risk changes
                </button>
              ) : null}
              {toolStatus ? <p className="chat-tool-status" role="status">{toolStatus}</p> : null}
              {proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  error={proposalErrors[proposal.id]}
                  confirming={confirming === proposal.id}
                  onApply={apply}
                  onDismiss={dismiss}
                />
              ))}
            </div>
          ) : null}
          {sources.length > 0 ? (
            <div className="chat-sources" aria-label="Sources used">
              <span>Sources used</span>
              {sources.map((id) => <button type="button" key={id} onClick={() => window.dispatchEvent(new CustomEvent('personalos:open-note', { detail: id }))}>{id}</button>)}
            </div>
          ) : null}
        </div>

        <form className="chat-compose" onSubmit={submit}>
          <textarea
            ref={textareaRef}
            className="chat-input"
            aria-label="Message AI"
            placeholder={
              keyMissing
                ? 'Add your API key in Settings to chat'
                : provider.available
                  ? 'Ask anything…'
                  : `${meta.label} is coming soon`
            }
            rows={1}
            maxLength={8000}
            value={input}
            disabled={!provider.available || keyMissing}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="chat-send chat-send--stop"
              data-action="chat-stop"
              onClick={stop}
              aria-label="Stop reply"
            >
              <Icon name="stop" size={17} />
            </button>
          ) : (
            <button
              type="submit"
              className="chat-send"
              data-action="chat-send"
              disabled={!input.trim() || keyMissing || !provider.available}
              aria-label="Send message"
            >
              <Icon name="send" size={17} />
            </button>
          )}
        </form>

        <p className="chat-privacy">
          {keyState.error ?? 'API key in secure storage · transcript saved locally'}
        </p>
      </aside>
    </div>
  );
};
