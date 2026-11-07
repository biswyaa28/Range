import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const InsightsView: React.FC = () => {
  const dayStats = useStore((s) => s.dayStats);
  const recordedDays = Object.keys(dayStats).length;

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Insights</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="Activity & statistics">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {recordedDays} day{recordedDays === 1 ? '' : 's'} of history recorded
          </p>
          <EmptyState
            icon="chart"
            title="Insights coming next"
            description="Weekly completion heatmaps, streak calculation, and productivity charts will be added here."
          />
        </Card>
      </div>
    </div>
  );
};

