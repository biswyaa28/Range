import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const TasksView: React.FC = () => {
  const tasks = useStore((s) => s.tasks);
  const taskList = Object.values(tasks).filter((t) => !t.deleted);
  const pendingCount = taskList.filter((t) => !t.done).length;

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Tasks</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="To-do list">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {pendingCount} incomplete task{pendingCount === 1 ? '' : 's'} ({taskList.length} total)
          </p>
          <EmptyState
            icon="todo"
            title="Tasks coming next"
            description="Task groups, sorting, inline quick-add and completion tracking are up next."
          />
        </Card>
      </div>
    </div>
  );
};

