import React from 'react';
import { buildSmartGreeting } from '@/domain/homeGreeting';
import { useHome } from './HomeContext';

export const SmartGreeting: React.FC = () => {
  const { data, actions } = useHome();
  const copy = buildSmartGreeting({
    name: data.profileName,
    greeting: data.greeting,
    hour: Number(data.now.slice(0, 2)),
    nowMinutes: data.nowMinutes,
    nextBlock: data.nextBlock,
    deadlinesTomorrow: data.deadlinesTomorrow,
    tasksLeft: data.tasksLeft,
    weeklyGoal: data.weeklyGoal,
  });

  return (
    <div className="smart">
      <h1>
        {copy.salutation}, {copy.name}
      </h1>
      <p className="live">{copy.sentence}</p>
      {copy.tip && <p className="tip">{copy.tip}</p>}
      <div className="qa">
        <button type="button" onClick={actions.startFocus}>
          Start focus
        </button>
        <button type="button" onClick={actions.addTask}>
          Add task
        </button>
      </div>
    </div>
  );
};
