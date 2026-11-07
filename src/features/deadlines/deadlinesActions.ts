import { store } from '@/store';
import { softDeleteRecord, touchRecord } from '@/store/stamp';
import type { AppState, Deadline } from '@/domain/types';

export const selectDeadlines = (s: AppState): Deadline[] => s.deadlines;

export function approveDeadline(id: string): void {
  store.set((s: AppState) => {
    const dl = s.deadlines.find((item) => item.id === id);
    if (dl) {
      dl.status = 'approved';
      touchRecord(dl);
    }
  });
}

export function dismissDeadline(id: string): void {
  store.set((s: AppState) => {
    softDeleteRecord(s.deadlines, id);
  });
}
