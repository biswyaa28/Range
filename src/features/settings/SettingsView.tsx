import React from 'react';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/Toast';
import { useStore, store } from '@/store';
import { ACCENTS } from '@/domain/color';
import { defaultState, type AppState } from '@/domain/types';
import { buildDemoData } from '@/domain/demo';
import { recomputeDayStats } from '@/domain/stats';
import { todayISO, defaultClock } from '@/domain/dates';
import { Haptics } from '@/engines/haptics';

export const SettingsView: React.FC = () => {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const toast = useToast();

  const handleThemeChange = (val: string) => {
    store.set((s: AppState) => {
      s.settings.theme = val as 'auto' | 'light' | 'dark';
    });
  };

  const handleAccentChange = (accentId: string) => {
    store.set((s: AppState) => {
      s.profile.accent = accentId;
    });
  };

  const handleLoadDemo = () => {
    const demo = buildDemoData(defaultClock, undefined, settings.theme);
    store.importAll(demo);
    store.set((s: AppState) => {
      recomputeDayStats(s.dayStats, s.blocks, todayISO());
    });
    Haptics.success();
    toast.showToast('Demo data loaded — explore away');
  };

  const handleRemoveDemo = () => {
    const fresh = defaultState();
    fresh.settings.theme = settings.theme;
    fresh.clearedAt = defaultClock.nowISO();
    store.importAll(fresh);
    Haptics.warning();
    toast.showToast('Demo data removed');
  };

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Settings</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="Appearance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                Theme
              </label>
              <Segmented
                value={settings.theme}
                onChange={handleThemeChange}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                Accent color
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ACCENTS.map((acc) => {
                  const isSelected = profile.accent === acc.id;
                  const bg = acc.hex || (settings.theme === 'dark' ? '#F5F5F7' : '#1D1D1F');
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      data-accent={acc.id}
                      onClick={() => handleAccentChange(acc.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: bg,
                        border: isSelected ? '2px solid var(--text)' : '2px solid transparent',
                        outlineOffset: '2px',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.15s ease',
                        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                      }}
                      title={acc.label}
                      aria-label={acc.label}
                      aria-pressed={isSelected}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Demo data">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {settings.seeded
              ? 'Demo sample data is currently loaded.'
              : 'Populate sample timetable blocks, tasks, notes, and deadlines.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={handleLoadDemo} data-action="demo-load">
              Load demo data
            </Button>
            {settings.seeded && (
              <Button variant="secondary" onClick={handleRemoveDemo} data-action="demo-remove">
                Remove demo data
              </Button>
            )}
          </div>
        </Card>

        <Card title="Profile">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            Name: <b>{profile.name || 'Personal OS User'}</b>
          </p>
          <Button variant="secondary" onClick={() => {}}>
            Edit profile
          </Button>
        </Card>
      </div>
    </div>
  );
};
