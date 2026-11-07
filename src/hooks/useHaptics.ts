import { haptics as platformHaptics } from '@/platform';
import type { HapticsAdapter } from '@/platform/types';
import { useStore } from '@/store/useStore';

export function useHaptics(): HapticsAdapter {
  const hapticsConfig = useStore((s) => s.profile.haptics);

  return {
    tap(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.tap(target);
    },
    select(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.select(target);
    },
    success(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.success(target);
    },
    warning(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.warning(target);
    },
    error(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.error(target);
    },
    impact(target?: HTMLElement | null): void {
      if (!hapticsConfig.on) return;
      platformHaptics.impact(target);
    },
  };
}

