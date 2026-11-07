import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const HomeView: React.FC = () => {
  const blocks = useStore((s) => s.blocks);
  const tasks = useStore((s) => s.tasks);

  const activeBlocks = Object.values(blocks).filter((b) => !b.deleted).length;
  const activeTasks = Object.values(tasks).filter((t) => !t.deleted && !t.done).length;

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Today</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="Overview">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {activeBlocks} scheduled block{activeBlocks === 1 ? '' : 's'} · {activeTasks} pending task{activeTasks === 1 ? '' : 's'}
          </p>
          <EmptyState
            icon="today"
            title="Home coming next"
            description="The bento-grid dashboard will be ported in the next phase."
          />
        </Card>
      </div>
    </div>
  );
};

