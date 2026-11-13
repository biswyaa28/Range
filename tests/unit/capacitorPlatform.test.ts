import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHaptics = {
  impact: vi.fn().mockResolvedValue(undefined),
  selectionStart: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
};

const mockFilesystem = {
  writeFile: vi
    .fn()
    .mockResolvedValue({ uri: 'file:///cache/personal-os-2026-11-08.json' }),
};

const mockShare = {
  share: vi.fn().mockResolvedValue({}),
};

const mockApp = {
  minimizeApp: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
};

const mockStatusBar = {
  setStyle: vi.fn().mockResolvedValue(undefined),
  setBackgroundColor: vi.fn().mockResolvedValue(undefined),
};

const mockSplashScreen = {
  hide: vi.fn().mockResolvedValue(undefined),
};

const mockKeyboard = {
  setResizeMode: vi.fn().mockResolvedValue(undefined),
};

const mockHealth = {
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  checkAuthorization: vi.fn().mockResolvedValue({
    readAuthorized: [],
    readDenied: ['steps', 'sleep', 'calories'],
    writeAuthorized: [],
    writeDenied: [],
  }),
  requestAuthorization: vi.fn().mockResolvedValue({
    readAuthorized: ['steps', 'sleep', 'calories'],
    readDenied: [],
    writeAuthorized: [],
    writeDenied: [],
  }),
  queryAggregated: vi.fn().mockResolvedValue({ samples: [] }),
  readSamples: vi.fn().mockResolvedValue({ samples: [] }),
  openHealthConnectSettings: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@capgo/capacitor-health', () => ({ Health: mockHealth }));

vi.mock('@capacitor/haptics', () => ({
  Haptics: mockHaptics,
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: mockFilesystem,
  Directory: { Cache: 'CACHE' },
}));

vi.mock('@capacitor/share', () => ({
  Share: mockShare,
}));

vi.mock('@capacitor/app', () => ({
  App: mockApp,
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: mockStatusBar,
  Style: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: mockSplashScreen,
}));

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: mockKeyboard,
  KeyboardResize: { Body: 'body' },
}));

describe('Capacitor platform layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Haptics mapping', () => {
    it('maps tap to light impact', async () => {
      const { CapacitorHaptics } = await import('@/platform/capacitor');
      const haptics = new CapacitorHaptics();

      haptics.tap();
      expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    });

    it('maps select to selection start', async () => {
      const { CapacitorHaptics } = await import('@/platform/capacitor');
      const haptics = new CapacitorHaptics();

      haptics.select();
      expect(mockHaptics.selectionStart).toHaveBeenCalled();
    });

    it('maps success, warning, error to notification type', async () => {
      const { CapacitorHaptics } = await import('@/platform/capacitor');
      const haptics = new CapacitorHaptics();

      haptics.success();
      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });

      haptics.warning();
      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'WARNING' });

      haptics.error();
      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'ERROR' });
    });

    it('maps impact to medium or heavy based on profile.haptics level', async () => {
      const { CapacitorHaptics } = await import('@/platform/capacitor');
      const { PersonalStore } = await import('@/store');

      const mockStore = new PersonalStore({
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      });

      const haptics = new CapacitorHaptics(mockStore);

      // Default medium level
      haptics.impact();
      expect(mockHaptics.impact).toHaveBeenLastCalledWith({ style: 'MEDIUM' });

      // Strong level -> Heavy impact
      mockStore.set((s) => {
        s.profile.haptics.level = 'strong';
      });
      haptics.impact();
      expect(mockHaptics.impact).toHaveBeenLastCalledWith({ style: 'HEAVY' });

      // Light level -> Medium impact
      mockStore.set((s) => {
        s.profile.haptics.level = 'light';
      });
      haptics.impact();
      expect(mockHaptics.impact).toHaveBeenLastCalledWith({ style: 'MEDIUM' });

      const callsBeforeDisable = mockHaptics.impact.mock.calls.length;
      // Disabled haptics -> no impact
      mockStore.set((s) => {
        s.profile.haptics.on = false;
      });
      haptics.impact();
      expect(mockHaptics.impact).toHaveBeenCalledTimes(callsBeforeDisable);
    });
  });

  describe('FileSaver', () => {
    it('writes base64 data to cache and shares file URI', async () => {
      const { CapacitorFileSaver } = await import('@/platform/capacitor');
      const saver = new CapacitorFileSaver();

      const blob = new Blob(['{"test":123}'], { type: 'application/json' });
      await saver.saveFile(blob, 'personal-os-2026-11-08.json');

      expect(mockFilesystem.writeFile).toHaveBeenCalledWith({
        path: 'personal-os-2026-11-08.json',
        data: expect.any(String),
        directory: 'CACHE',
      });

      expect(mockShare.share).toHaveBeenCalledWith({
        title: 'personal-os-2026-11-08.json',
        url: 'file:///cache/personal-os-2026-11-08.json',
        dialogTitle: 'Save Personal OS backup',
      });
    });
  });

  describe('Hardware back button logic', () => {
    it('closes modal or popover if active', async () => {
      const { handleHardwareBackButton } = await import('@/platform/capacitor');

      let closed = false;
      const handled = handleHardwareBackButton({
        closeModal: () => {
          closed = true;
          return true;
        },
      });

      expect(handled).toBe(true);
      expect(closed).toBe(true);
      expect(mockApp.minimizeApp).not.toHaveBeenCalled();
    });

    it('navigates history back when on non-root hash route', async () => {
      const { handleHardwareBackButton } = await import('@/platform/capacitor');

      window.location.hash = '#tasks';
      let backCalled = false;

      const handled = handleHardwareBackButton({
        closeModal: () => false,
        historyBack: () => {
          backCalled = true;
        },
      });

      expect(handled).toBe(true);
      expect(backCalled).toBe(true);
      expect(mockApp.minimizeApp).not.toHaveBeenCalled();
    });

    it('minimizes app when on root route and no modal open', async () => {
      const { handleHardwareBackButton } = await import('@/platform/capacitor');

      window.location.hash = '#home';
      let minimized = false;

      const handled = handleHardwareBackButton({
        closeModal: () => false,
        minimize: async () => {
          minimized = true;
        },
      });

      expect(handled).toBe(false);
      expect(minimized).toBe(true);
    });
  });

  describe('Platform detection', () => {
    it('returns android and native=true when Capacitor is detected', async () => {
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        value: {
          isNativePlatform: () => true,
          getPlatform: () => 'android',
        },
      });

      const platform = await import('@/platform');
      await platform.initializePlatform();

      expect(platform.isNative()).toBe(true);
      expect(platform.platformName).toBe('android');
      expect(await platform.health.isAvailable()).toBe(true);
    });
  });
});
