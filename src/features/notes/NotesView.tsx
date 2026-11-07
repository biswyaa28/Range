import React from 'react';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { useStore } from '@/store';

export const NotesView: React.FC = () => {
  const notes = useStore((s) => s.notes);
  const noteList = Object.values(notes).filter((n) => !n.deleted);

  return (
    <div className="view-content">
      <div className="view-head">
        <h1>Notes</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
        <Card title="All notes">
          <p style={{ color: 'var(--text-2)', fontSize: '14px', margin: '4px 0 12px' }}>
            {noteList.length} note{noteList.length === 1 ? '' : 's'} recorded
          </p>
          <EmptyState
            icon="note"
            title="Notes coming next"
            description="Pinned notes, markdown preview and tagging will be ported in the notes milestone."
          />
        </Card>
      </div>
    </div>
  );
};

