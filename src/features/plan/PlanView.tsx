import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const PlanView: React.FC = () => {
  const blocks = useStore((s) => s.blocks);
  const deadlines = useStore((s) => s.deadlines);

  const blockCount = Object.values(blocks).filter((b) => !b.deleted).length;
  const deadlineCount = Object.values(deadlines).filter((d) => !d.deleted).length;

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Plan</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="Timetable & deadlines">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {blockCount} total block{blockCount === 1 ? '' : 's'} · {deadlineCount} deadline{deadlineCount === 1 ? '' : 's'}
          </p>
          <EmptyState
            icon="grid"
            title="Plan coming next"
            description="The timetable calendar and deadlines board will be ported soon."
          />
        </Card>
      </div>
    </div>
  );
};

