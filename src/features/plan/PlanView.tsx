import React, { useEffect, useState } from 'react';
import { Segmented } from '@/ui/Segmented';
import { DeadlinesView } from '@/features/deadlines/DeadlinesView';
import { CalendarView } from './CalendarView';

type PlanTab = 'calendar' | 'deadlines';

function tabFromHash(): PlanTab {
  if (typeof window === 'undefined') return 'calendar';
  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return hash === 'deadlines' ? 'deadlines' : 'calendar';
}

export const PlanView: React.FC = () => {
  const [subTab, setSubTab] = useState<PlanTab>(tabFromHash);

  // Keep the hash and breadcrumb in step with the visible tab.
  const selectTab = (next: PlanTab): void => {
    setSubTab(next);
    const target = next === 'deadlines' ? '#deadlines' : '#plan';
    if (window.location.hash !== target) window.location.hash = target;
  };

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
      if (hash === 'deadlines') setSubTab('deadlines');
      else if (hash === 'plan' || hash === 'timetable' || !hash) setSubTab('calendar');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="view-content">
      <div style={{ marginBottom: '14px' }}>
        <Segmented<PlanTab>
          value={subTab}
          onChange={selectTab}
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'deadlines', label: 'Deadlines' },
          ]}
          aria-label="Plan view"
        />
      </div>

      {subTab === 'deadlines' ? <DeadlinesView /> : <CalendarView />}
    </div>
  );
};
