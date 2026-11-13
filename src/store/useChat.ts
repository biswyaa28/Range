import { useSyncExternalStore } from 'react';
import type { ChatState } from '@/domain/chat';
import { chatStore, type ChatStore } from './chatStore';

export function useChat(store: ChatStore = chatStore): ChatState {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => store.get(),
    () => store.get(),
  );
}
