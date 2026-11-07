import { describe, it, expect } from 'vitest';
import { checkSwipeCommit } from '@/hooks/useSwipe';

describe('useSwipe commit logic', () => {
  it('does not commit below distance and velocity thresholds', () => {
    const res = checkSwipeCommit(30, 0.1, 64);
    expect(res.committed).toBe(false);
  });

  it('commits right when dx exceeds threshold', () => {
    const res = checkSwipeCommit(65, 0.1, 64);
    expect(res.committed).toBe(true);
    expect(res.direction).toBe('right');
  });

  it('commits left when -dx exceeds threshold', () => {
    const res = checkSwipeCommit(-70, -0.1, 64);
    expect(res.committed).toBe(true);
    expect(res.direction).toBe('left');
  });

  it('commits right with low dx if velocity is high (flick right)', () => {
    const res = checkSwipeCommit(20, 0.6, 64);
    expect(res.committed).toBe(true);
    expect(res.direction).toBe('right');
  });

  it('commits left with low -dx if negative velocity is high (flick left)', () => {
    const res = checkSwipeCommit(-20, -0.6, 64);
    expect(res.committed).toBe(true);
    expect(res.direction).toBe('left');
  });

  it('does not commit if dx is high enough for flick but velocity is insufficient', () => {
    const res = checkSwipeCommit(15, 0.4, 64);
    expect(res.committed).toBe(false);
  });
});
