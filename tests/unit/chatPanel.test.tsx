import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { closeChat, openChat } from '@/features/chat/chatBus';
import { aiKeyStore, chatStore, settingsStore } from '@/store';
import { ToastProvider } from '@/ui/Toast';

function sseResponse(payloads: unknown[]): Response {
  const body = payloads
    .map((payload) => `data: ${JSON.stringify(payload)}\n\n`)
    .join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function textPayload(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function renderPanel(onOpenSettings = vi.fn()): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <ChatPanel onOpenSettings={onOpenSettings} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  settingsStore.reset();
  chatStore.clear();
  chatStore.flush();
  closeChat();
  await aiKeyStore.clear();
});

afterEach(() => {
  cleanup();
  closeChat();
  chatStore.clear();
  chatStore.flush();
  vi.unstubAllGlobals();
});

describe('ChatPanel', () => {
  it('sends a message, streams the reply, and keeps the transcript locally', async () => {
    await aiKeyStore.setKey('AIza-test-key');
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([textPayload('Focus on '), textPayload('one thing.')]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onOpenSettings = vi.fn();

    renderPanel(onOpenSettings);
    act(() => openChat());

    const textarea = screen.getByLabelText('Message AI') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.disabled).toBe(false));
    fireEvent.change(textarea, { target: { value: 'Plan my week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByText('Focus on one thing.')).not.toBeNull());

    expect(chatStore.get().messages).toMatchObject([
      { role: 'user', content: 'Plan my week', status: 'complete' },
      { role: 'assistant', content: 'Focus on one thing.', status: 'complete' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request[1].body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.contents[body.contents.length - 1]?.parts[0]?.text).toBe('Plan my week');
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('shows the key setup prompt when no key is stored', async () => {
    const onOpenSettings = vi.fn();
    renderPanel(onOpenSettings);
    act(() => openChat());

    await waitFor(() => expect(screen.getByText('Connect Gemini')).not.toBeNull());
    expect((screen.getByLabelText('Message AI') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText(/secure storage and never synced/i)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('shows a friendly auth error and retries without duplicating the user turn', async () => {
    await aiKeyStore.setKey('AIza-bad-key');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'API key not valid' } }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(sseResponse([textPayload('Second time works.')]));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();
    act(() => openChat());

    const textarea = screen.getByLabelText('Message AI') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.disabled).toBe(false));
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain("wasn't accepted"),
    );
    expect(chatStore.get().messages[1]).toMatchObject({
      role: 'assistant',
      status: 'error',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Second time works.')).not.toBeNull());

    expect(
      chatStore.get().messages.filter((message) => message.role === 'user'),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a diff card and applies a tool proposal only after confirmation', async () => {
    await aiKeyStore.setKey('AIza-test-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        sseResponse([
        {
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'set_theme', args: { theme: 'dark' } } }],
              },
            },
          ],
        },
        ]),
      )
      .mockResolvedValueOnce(sseResponse([{ candidates: [{ content: { parts: [{ text: 'Done' }] } }] }]));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();
    act(() => openChat());

    const textarea = screen.getByLabelText('Message AI') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.disabled).toBe(false));
    fireEvent.change(textarea, { target: { value: 'Make it dark' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByText('Switch theme')).not.toBeNull());
    expect(settingsStore.get().theme).toBe('system');
    expect(screen.getByText(/Review the proposed changes below\./)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Switch theme' }));
    await waitFor(() => expect(settingsStore.get().theme).toBe('dark'));
    expect(screen.queryByText('Switch theme')).toBeNull();

    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undo);
    await waitFor(() => expect(settingsStore.get().theme).toBe('system'));
  });
});
