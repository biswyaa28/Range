import { useSyncExternalStore } from 'react';
import { integrationStore } from '@/store/integrationStore';

export function useIntegrations() {
  return useSyncExternalStore(
    integrationStore.subscribe,
    integrationStore.get,
    integrationStore.get,
  );
}
