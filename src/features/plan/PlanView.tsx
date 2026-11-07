import React, { useState } from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Segmented } from '@/ui/Segmented';
import { useStore } from '@/store';
import { DeadlinesView } from '@/features/deadlines/DeadlinesView';

export const PlanView: React.FC = () => {
  const [subTab, setSubTab] = useState<'calendar' | 'deadlines'>('calendar');

  const blocks = useStore((s) => s.blocks);
  const deadlines = useStore((s) => s.deadlines);

  const blockCount = Object.values(blocks).filter((b) => !b.deleted).length;
  const deadlineCount = Object.values(deadlines).filter((d) => !d.deleted).length;

  return (
    <div className="view-content">
      <div style={{ marginBottom: '14px' }}>
        <Segmented
          value={subTab}
          onChange={(val) => setSubTab(val as 'calendar' | 'deadlines')}
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'deadlines', label: 'Deadlines' },
          ]}
        />
      </div>

      {subTab === 'deadlines' ? (
        <DeadlinesView />
      ) : (
        <>
          <div className="view-head">
            <h1>Plan</h1>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
            <Card title="Timetable & calendar">
              <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
                {blockCount} total block{blockCount === 1 ? '' : 's'} · {deadlineCount} deadline{deadlineCount === 1 ? '' : 's'}
              </p>
              <EmptyState
                icon="grid"
                title="Calendar coming next"
                description="The timetable calendar day, week, and month grids will be ported soon. Use the Deadlines tab to manage upcoming assignments, exams, and announcements."
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
