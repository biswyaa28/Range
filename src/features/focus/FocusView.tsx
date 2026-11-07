import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const FocusView: React.FC = () => {
  const profile = useStore((s) => s.profile);

  return (
    <div className="view-content">
      <div className="view-head">
        <h1 id="focus-start" tabIndex={-1}>
          Focus
        </h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="Pomodoro & ambient sounds">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            Daily study goal: {profile.studyHours ?? 4} hours · Style: {profile.focusStyle ?? 'pomodoro'}
          </p>
          <EmptyState
            icon="timer"
            title="Focus coming next"
            description="The full Pomodoro timer, ambient sound synthesizer, and prompter are coming soon."
          />
        </Card>
      </div>
    </div>
  );
};
