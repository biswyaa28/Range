import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  checkAuthorization: vi.fn(),
  requestAuthorization: vi.fn(),
  queryAggregated: vi.fn(),
  readSamples: vi.fn(),
  openHealthConnectSettings: vi.fn(),
}));

vi.mock('@capgo/capacitor-health', () => ({ Health: mocks }));

import { HealthConnectProvider } from '@/platform/healthConnect';

const DATE = '2020-01-15';
const ALL = ['steps', 'sleep', 'calories'];

function status(readAuthorized: string[], readDenied: string[]) {
  return {
    readAuthorized,
    readDenied,
    writeAuthorized: [],
    writeDenied: [],
  };
}

function localISO(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function sleepSample(startDate: string, endDate: string) {
  return {
    dataType: 'sleep',
    value: (Date.parse(endDate) - Date.parse(startDate)) / 60000,
    unit: 'minute',
    startDate,
    endDate,
  };
}

describe('HealthConnectProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAvailable.mockResolvedValue({ available: true });
    mocks.checkAuthorization.mockResolvedValue(status([], ALL));
    mocks.requestAuthorization.mockResolvedValue(status(ALL, []));
    mocks.queryAggregated.mockResolvedValue({ samples: [] });
    mocks.readSamples.mockResolvedValue({ samples: [] });
    mocks.openHealthConnectSettings.mockResolvedValue(undefined);
  });

  it('reports plugin availability', async () => {
    const provider = new HealthConnectProvider();

    expect(await provider.isAvailable()).toBe(true);

    mocks.isAvailable.mockResolvedValue({ available: false, reason: 'missing' });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('returns unavailable without prompting when Health Connect is missing', async () => {
    mocks.isAvailable.mockResolvedValue({ available: false });
    const provider = new HealthConnectProvider();

    expect(await provider.requestAccess()).toBe('unavailable');
    expect(mocks.checkAuthorization).not.toHaveBeenCalled();
    expect(mocks.requestAuthorization).not.toHaveBeenCalled();
  });

  it('uses existing read access without opening the permission sheet', async () => {
    mocks.checkAuthorization.mockResolvedValue(status(ALL, []));
    const provider = new HealthConnectProvider();

    expect(await provider.requestAccess()).toBe('granted');
    expect(mocks.requestAuthorization).not.toHaveBeenCalled();
  });

  it('requests only the three read scopes', async () => {
    const provider = new HealthConnectProvider();

    expect(await provider.requestAccess()).toBe('granted');
    expect(mocks.requestAuthorization).toHaveBeenCalledWith({ read: ALL });
    expect(mocks.requestAuthorization.mock.calls[0]?.[0]).not.toHaveProperty('write');
  });

  it('reports denied when the requested scopes are not granted', async () => {
    mocks.requestAuthorization.mockResolvedValue(status(['steps'], ['sleep', 'calories']));
    const provider = new HealthConnectProvider();

    expect(await provider.requestAccess()).toBe('denied');
  });

  it('reads steps, active calories, and merged sleep duration', async () => {
    mocks.queryAggregated.mockImplementation(({ dataType }: { dataType: string }) =>
      Promise.resolve({
        samples: [{ value: dataType === 'steps' ? 7200 : 420 }],
      }),
    );
    mocks.readSamples.mockResolvedValue({
      samples: [
        sleepSample(localISO(2020, 1, 14, 22), localISO(2020, 1, 15, 2)),
        sleepSample(localISO(2020, 1, 14, 23), localISO(2020, 1, 15, 3)),
      ],
    });

    const summary = await new HealthConnectProvider().getSummary(DATE);

    expect(summary?.steps).toBe(7200);
    expect(summary?.activeCalories).toBe(420);
    expect(summary?.sleepHours).toBe(5);
    expect(summary?.updatedAt).toEqual(expect.any(String));
    expect(mocks.queryAggregated).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'day', aggregation: 'sum' }),
    );
    expect(mocks.queryAggregated).toHaveBeenCalledWith(
      expect.objectContaining({ dataType: 'steps' }),
    );
    expect(mocks.queryAggregated).toHaveBeenCalledWith(
      expect.objectContaining({ dataType: 'calories' }),
    );
  });

  it('returns null when every metric is empty', async () => {
    const summary = await new HealthConnectProvider().getSummary(DATE);

    expect(summary).toBeNull();
  });

  it('keeps partial data when one read fails', async () => {
    mocks.queryAggregated.mockImplementation(({ dataType }: { dataType: string }) => {
      if (dataType === 'steps') return Promise.resolve({ samples: [{ value: 100 }] });
      return Promise.reject(new Error('permission denied'));
    });
    mocks.readSamples.mockRejectedValue(new Error('permission denied'));

    const summary = await new HealthConnectProvider().getSummary(DATE);

    expect(summary?.steps).toBe(100);
    expect(summary?.activeCalories).toBeUndefined();
    expect(summary?.sleepHours).toBeUndefined();
  });

  it('clips sleep sessions to the last-night window', async () => {
    mocks.readSamples.mockResolvedValue({
      samples: [sleepSample(localISO(2020, 1, 15, 11), localISO(2020, 1, 15, 15))],
    });

    const summary = await new HealthConnectProvider().getSummary(DATE);

    expect(summary?.sleepHours).toBe(1);
  });

  it('opens the Health Connect settings screen', async () => {
    await new HealthConnectProvider().openSettings();

    expect(mocks.openHealthConnectSettings).toHaveBeenCalled();
  });
});
