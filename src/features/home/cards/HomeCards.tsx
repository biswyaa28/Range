import React, { useRef, useState } from 'react';
import type { BentoCardSize, Task } from '@/domain/types';
import { diffDays, fmtMS, fmtShort, hmToMin, todayISO } from '@/domain/dates';
import { blockDoneOn, toggleBlockDoneOnDate } from '@/domain/recurrence';
import { formatCountdown, plural } from '@/domain/homeGreeting';
import { blockCategoryMeta } from '@/features/plan/blockCategories';
import { store, stampNewRecord, touchRecord } from '@/store';
import { Icon, type IconName } from '@/ui/Icon';
import { ProgressRing } from '@/ui/ProgressRing';
import { Sparkline } from '@/ui/Sparkline';
import { Haptics } from '@/engines/haptics';
import { useHome } from '../HomeContext';
import { isInFocusWindow, isInWakingHours } from '../homeData';
import { usePomodoro } from '@/hooks';
import { openFocusMode } from '@/features/focus/focusModeBus';

interface CardProps {
  size: BentoCardSize;
}

interface EmptyProps {
  icon: IconName;
  hint: string;
  label: string;
  onAction: () => void;
}

export const HomeEmpty: React.FC<EmptyProps> = ({ icon, hint, label, onAction }) => (
  <div className="es">
    <Icon name={icon} />
    <p>{hint}</p>
    <button type="button" onClick={onAction}>
      {label}
    </button>
  </div>
);

function toggleTaskDone(id: string): void {
  store.set((state) => {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.done = !task.done;
    touchRecord(task);
    const today = todayISO();
    const stats = state.dayStats[today];
    if (stats) {
      stats.tasksDone = Math.max(0, stats.tasksDone + (task.done ? 1 : -1));
      stats.updatedAt = new Date().toISOString();
    }
  });
  Haptics.select();
}

function toggleBlockDone(id: string): void {
  store.set((state) => {
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    toggleBlockDoneOnDate(block, todayISO());
    touchRecord(block);
  });
  Haptics.select();
}

function daysLeftLabel(due: string, today: string): string {
  const days = diffDays(due, today);
  if (days < 0) return `Overdue ${-days}d`;
  if (days === 0) return 'Due today';
  return `${plural(days, 'day')} left`;
}

function urgencyLevel(due: string, today: string): number {
  const days = diffDays(due, today);
  if (days <= 1) return 4;
  if (days <= 3) return 3;
  if (days <= 7) return 2;
  return 1;
}

const WEEK_PLACEHOLDERS = [0.35, 0.55, 0.4, 0.7, 0.5, 0.3, 0.45];

export const ProgressCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const focusHours = Math.round(data.focusMinutes / 6) / 10;

  return (
    <>
      <h3>Today’s progress</h3>
      {data.totalBlocks === 0 ? (
        <HomeEmpty
          icon="grid"
          hint="No blocks scheduled today."
          label="Add block"
          onAction={() => actions.navigate('plan')}
        />
      ) : (
        <>
          <div className="ringwrap">
            <ProgressRing
              value={data.progress / 100}
              size={148}
              strokeWidth={10}
              label={`${data.progress}% complete`}
            />
            <div className="ring-c">
              <span className="num">{data.progress}%</span>
              {size !== 'S' && <small>done</small>}
            </div>
          </div>
          {size !== 'S' && (
            <div className="sub">
              {data.doneBlocks} of {data.totalBlocks} blocks
            </div>
          )}
          {size === 'L' && (
            <div className="sub goal">
              {focusHours} of {data.studyHours} h focus goal
            </div>
          )}
        </>
      )}
    </>
  );
};

export const WeeklyCard: React.FC<CardProps> = () => {
  const { data, actions } = useHome();
  const goalRatio = Math.min(0.92, data.goal / data.weekMax);

  return (
    <>
      <h3>
        Weekly activity
        <span className="sp" />
        <span className="wk-sub">Blocks done</span>
      </h3>
      <div className={`bars${data.hasWeekData ? '' : ' nodata'}`}>
        {data.week.map((day, index) => {
          const ratio = data.hasWeekData
            ? Math.max(0, Math.min(1, day.value / data.weekMax))
            : WEEK_PLACEHOLDERS[index] ?? 0.4;
          const label = `${plural(day.value, 'block')} done`;
          return (
            <button
              key={day.iso}
              type="button"
              className={`bar${day.isToday ? ' today' : ''}`}
              data-tip={label}
              title={`${day.label}: ${label}`}
              aria-label={`${day.label}: ${label}`}
            >
              <i style={{ height: `calc((100% - 26px) * ${ratio.toFixed(3)})` }} />
              {day.label}
            </button>
          );
        })}
        <div
          className="goalline"
          style={{ bottom: `calc(26px + (100% - 26px) * ${goalRatio.toFixed(3)})` }}
        >
          <span>Goal ≈ {plural(data.goal, 'block')}</span>
        </div>
      </div>
      {!data.hasWeekData && (
        <HomeEmpty
          icon="chart"
          hint="Complete a block to see your week."
          label="Add block"
          onAction={() => actions.navigate('plan')}
        />
      )}
    </>
  );
};

export const FocusCard: React.FC<CardProps> = ({ size }) => {
  const { data } = useHome();
  const focus = usePomodoro();

  const button = (
    <button type="button" className="pbtn" id="hf-btn" onClick={focus.toggle}>
      <Icon name={focus.running ? 'pause' : 'play'} />
      {focus.running ? 'Pause' : 'Start'}
    </button>
  );

  const digits = fmtMS(focus.remainingMs);
  const fraction = focus.totalMs ? focus.remainingMs / focus.totalMs : 0;

  if (size === 'S') {
    return (
      <>
        <h3>Focus</h3>
        <div className="ft">
          <span className="num fdigits" id="hf-time">
            {digits}
          </span>
          {button}
        </div>
      </>
    );
  }

  return (
    <>
      <h3>Focus</h3>
      <div className="ft">
        <div className="ringwrap">
          <ProgressRing value={fraction} size={132} strokeWidth={10} label="Focus timer" />
          <div className="ring-c">
            <span className="num" id="hf-time">
              {digits}
            </span>
            <small id="hf-mode">{focus.mode === 'work' ? 'Focus' : 'Break'}</small>
          </div>
        </div>
        {button}
        <div className="sub" id="hf-sess">
          {plural(data.sessions, 'session')} today
        </div>
        {size === 'L' && (
          <button type="button" className="fmlink" onClick={openFocusMode}>
            <Icon name="bolt" />
            Enter focus mode
          </button>
        )}
      </div>
    </>
  );
};

const TaskRow: React.FC<{ task: Task }> = ({ task }) => (
  <div className={`trow${task.done ? ' done' : ''}`}>
    <button
      type="button"
      className="tick"
      data-action="task-toggle"
      data-id={task.id}
      aria-pressed={task.done}
      aria-label={`Mark done: ${task.title}`}
      onClick={() => toggleTaskDone(task.id)}
    >
      <Icon name="check" />
    </button>
    <span className="tt">{task.title}</span>
  </div>
);

export const TasksCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submitQuickAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const title = value.trim();
    if (!title) return;
    store.set((state) => {
      const newTask = stampNewRecord<Partial<Task>>(
        { title, due: null, priority: 'med', done: false, category: '' },
        state.deviceId,
        () => crypto.randomUUID(),
      );
      state.tasks.unshift(newTask as Task);
    });
    setValue('');
    Haptics.success();
    inputRef.current?.focus();
  };

  const head = (
    <h3>
      Today’s tasks
      <span className="sp" />
      <button
        type="button"
        className="addb"
        aria-label="Add a task"
        onClick={actions.addTask}
      >
        <Icon name="plus" />
      </button>
    </h3>
  );

  if (size === 'S') {
    const first = data.openTasks[0];
    return (
      <>
        {head}
        <div className="big">
          <span className="num">{data.openTasks.length}</span>
          <span>open{data.tasks.length ? ` of ${data.tasks.length}` : ''}</span>
        </div>
        {first ? (
          <TaskRow task={first} />
        ) : (
          <HomeEmpty
            icon="todo"
            hint="No open tasks."
            label="Add task"
            onAction={actions.addTask}
          />
        )}
      </>
    );
  }

  const list = data.tasks.slice(0, 5);

  return (
    <>
      {head}
      <div className="tlist">
        {list.length ? (
          list.map((task) => <TaskRow key={task.id} task={task} />)
        ) : (
          <HomeEmpty
            icon="todo"
            hint="No tasks yet."
            label="Add task"
            onAction={actions.addTask}
          />
        )}
      </div>
      {(size === 'L' || size === 'XL') && (
        <form className="qadd" onSubmit={submitQuickAdd}>
          <input
            ref={inputRef}
            id="home-qadd-in"
            type="text"
            maxLength={140}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Quick add a task…"
            aria-label="Quick add a task"
            autoComplete="off"
          />
          <button type="submit" className="addb" aria-label="Add task">
            <Icon name="plus" />
          </button>
        </form>
      )}
    </>
  );
};

export const UpNextCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const block = data.nextBlock;

  const head = (
    <h3>
      Up next
      <span className="sp" />
      <button
        type="button"
        className="addb"
        aria-label="Add a block"
        onClick={() => actions.navigate('plan')}
      >
        <Icon name="plus" />
      </button>
    </h3>
  );

  if (!block) {
    return (
      <>
        {head}
        <div className="un-title">{data.blocks.length ? 'All caught up' : 'Nothing scheduled'}</div>
        <HomeEmpty
          icon="grid"
          hint={
            data.blocks.length
              ? 'No blocks left today.'
              : 'Add a block or import your timetable.'
          }
          label="Add block"
          onAction={() => actions.navigate('plan')}
        />
      </>
    );
  }

  const start = hmToMin(block.start);
  const end = hmToMin(block.end);
  const countdown =
    data.nowMinutes < start
      ? `in ${formatCountdown(start - data.nowMinutes)}`
      : `${formatCountdown(Math.max(0, end - data.nowMinutes))} left`;

  return (
    <>
      {head}
      <div className="un-title">{block.title}</div>
      <div className="un-time">
        {block.start} – {block.end}
      </div>
      <span className="num un-count" id="un-count">
        {countdown}
      </span>
      {size !== 'S' && (
        <button type="button" className="pbtn green" onClick={() => toggleBlockDone(block.id)}>
          <Icon name="check" />
          Mark done
        </button>
      )}
    </>
  );
};

export const DeadlinesCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const head = <h3>Deadlines</h3>;

  if (!data.liveDeadlines.length) {
    return (
      <>
        {head}
        <HomeEmpty
          icon="flag"
          hint="No upcoming deadlines."
          label="Add deadline"
          onAction={actions.openDeadlines}
        />
      </>
    );
  }

  if (size === 'S') {
    const deadline = data.liveDeadlines[0];
    if (!deadline) return head;
    const hot = diffDays(deadline.due, data.today) <= 3;
    return (
      <>
        {head}
        <div className={`dlrow${hot ? ' hot' : ''}`}>
          <div className="dlhead">
            <span>{deadline.title}</span>
            <em>{daysLeftLabel(deadline.due, data.today)}</em>
          </div>
        </div>
      </>
    );
  }

  const count = size === 'M' ? 3 : 5;

  return (
    <>
      {head}
      {data.liveDeadlines.slice(0, count).map((deadline) => {
        const days = diffDays(deadline.due, data.today);
        const level = urgencyLevel(deadline.due, data.today);
        return (
          <div key={deadline.id} className={`dlrow${days <= 3 ? ' hot' : ''}`}>
            <div className="dlhead">
              <span>{deadline.title}</span>
              <em>{daysLeftLabel(deadline.due, data.today)}</em>
            </div>
            {(size === 'L' || size === 'XL') && (
              <div
                className="segs"
                role="img"
                aria-label={daysLeftLabel(deadline.due, data.today).toLowerCase()}
              >
                {[1, 2, 3, 4].map((index) => (
                  <i key={index} className={index <= level ? 'on' : ''} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export const StreakCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const head = <h3>Streak</h3>;

  if (!data.hasWeekData && data.streak === 0) {
    return (
      <>
        {head}
        <HomeEmpty
          icon="bolt"
          hint="Complete a block to start a streak."
          label="Add block"
          onAction={() => actions.navigate('plan')}
        />
      </>
    );
  }

  const big = (
    <div className="big">
      <span className="num">{data.streak}</span>
      <span>
        day{data.streak === 1 ? '' : 's'} · last 14 days
      </span>
    </div>
  );

  return (
    <>
      {head}
      {big}
      {size === 'M' && (
        <div aria-label="Completion, last 14 days">
          <Sparkline data={data.spark} width={260} height={42} className="spark" strokeWidth={2.5} />
        </div>
      )}
      {(size === 'L' || size === 'XL') && (
        <div className="sbars">
          {data.spark.map((value, index) => {
            const iso = data.spark.length - 1 === index ? data.today : '';
            const percent = Math.round(value * 100);
            return (
              <div
                key={`${index}-${percent}`}
                className={`sbar${index === data.spark.length - 1 ? ' t' : ''}`}
                data-tip={`${percent}% complete`}
                title={`${percent}% complete`}
                role="img"
                aria-label={`${iso ? fmtShort(iso) : `Day ${index + 1}`}: ${percent}% complete`}
              >
                <i style={{ '--h': String(percent) } as React.CSSProperties} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

interface TileProps {
  icon: IconName;
  label: string;
  onClick: () => void;
}

const QuickTile: React.FC<TileProps> = ({ icon, label, onClick }) => (
  <button type="button" className="tile" onClick={onClick}>
    <Icon name={icon} />
    <span>{label}</span>
  </button>
);

export const QuickCard: React.FC<CardProps> = ({ size }) => {
  const { actions } = useHome();
  const baseTiles: TileProps[] = [
    { icon: 'note', label: 'Notes', onClick: () => actions.navigate('notes') },
    { icon: 'prompter', label: 'Prompter', onClick: () => actions.navigate('focus') },
    { icon: 'speaker', label: 'Sounds', onClick: () => actions.navigate('focus') },
    { icon: 'upload', label: 'Import timetable', onClick: () => actions.navigate('plan') },
  ];
  const moreTiles: TileProps[] = [
    { icon: 'chart', label: 'Insights', onClick: () => actions.navigate('insights') },
    { icon: 'flag', label: 'Deadlines', onClick: actions.openDeadlines },
    { icon: 'todo', label: 'Add task', onClick: actions.addTask },
    { icon: 'timer', label: 'Focus timer', onClick: () => actions.navigate('focus') },
  ];
  const tiles = size === 'XL' ? [...baseTiles, ...moreTiles] : baseTiles;

  return (
    <>
      <h3>Quick access</h3>
      <div className={`tiles${size === 'S' || size === 'M' ? ' t2' : ''}`}>
        {tiles.map((tile) => (
          <QuickTile key={tile.label} {...tile} />
        ))}
      </div>
    </>
  );
};

export const HealthCard: React.FC<CardProps> = ({ size }) => {
  const head = (
    <h3>
      Health
      <span className="sp" />
      <span className="chip">Sample</span>
    </h3>
  );

  if (size === 'S') {
    return (
      <>
        {head}
        <div className="hl">
          <div className="hrow">
            Steps<b className="num">7.2k</b>
          </div>
        </div>
      </>
    );
  }

  if (size === 'M') {
    return (
      <>
        {head}
        <div className="hpair">
          <div className="hl">
            <div className="hrow">
              Steps<b className="num">7.2k</b>
            </div>
          </div>
          <div className="hl">
            <div className="hrow">
              Sleep<b className="num">7h 0m</b>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="hl">
        <div className="hrow">
          Steps<b className="num">7.2k</b>
        </div>
        <Sparkline data={[4.2, 6.1, 5.3, 7.8, 6.9, 8.4, 7.2]} width={260} height={52} className="spark" />
      </div>
      <div className="hl">
        <div className="hrow">
          Sleep<b className="num">7h 0m</b>
        </div>
        <Sparkline data={[6.5, 7.1, 6.8, 7.4, 6.2, 7.6, 7.0]} width={260} height={52} className="spark" />
      </div>
    </>
  );
};

export const CalendarCard: React.FC<CardProps> = ({ size }) => {
  const { data } = useHome();
  const head = (
    <h4>
      <span>{data.calendar.monthName}</span>
    </h4>
  );

  if (size === 'S') {
    return (
      <>
        {head}
        <div className="hrow">
          <b className="num" style={{ fontSize: 26 }}>
            {Number(data.today.slice(8, 10))}
          </b>
          <span className="hint">today</span>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {plural(data.calendar.monthDue, 'deadline')} this month
        </p>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="cgrid">
        {data.calendar.cells.map((cell) => {
          if (cell.kind === 'head') {
            return <b key={cell.key}>{cell.label}</b>;
          }
          const classes = [
            cell.kind === 'muted' ? 'm' : '',
            cell.isToday ? 't' : '',
            cell.hasDeadline ? 'd' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <span key={cell.key} className={classes} title={cell.iso}>
              {cell.label}
            </span>
          );
        })}
      </div>
      {(size === 'L' || size === 'XL') && data.calendar.nextDeadlines.length > 0 && (
        <div className="cal-list">
          {data.calendar.nextDeadlines.map((deadline) => (
            <div key={deadline.id} className="cl-row">
              <b>{deadline.title}</b>
              <em>{fmtShort(deadline.due)}</em>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export const TimelineCard: React.FC<CardProps> = ({ size }) => {
  const { data, actions } = useHome();
  const [showAll, setShowAll] = useState(false);

  const head = (
    <h3>
      Today’s timeline
      <span className="sp" />
      <button
        type="button"
        className="addb"
        aria-label="Add a block"
        onClick={() => actions.navigate('plan')}
      >
        <Icon name="plus" />
      </button>
    </h3>
  );

  if (size === 'S') {
    const block = data.nextBlock;
    return (
      <>
        {head}
        {block ? (
          <div className="nextmini">
            <span className="nt">{block.title}</span>
            <span className="nx">
              {block.start}–{block.end}
            </span>
          </div>
        ) : (
          <HomeEmpty
            icon="grid"
            hint={data.blocks.length ? 'No blocks left today.' : 'Nothing scheduled.'}
            label="Add block"
            onAction={() => actions.navigate('plan')}
          />
        )}
      </>
    );
  }

  const visible = showAll
    ? data.blocks
    : data.blocks.filter((block) => isInWakingHours(block.start, data.wakeWindow));
  const hiddenCount = data.blocks.length - visible.length;
  const showHoursButton = hiddenCount > 0 || showAll;

  if (!visible.length) {
    return (
      <>
        {head}
        <HomeEmpty
          icon="grid"
          hint={
            data.blocks.length
              ? 'No blocks in your waking hours.'
              : 'Nothing scheduled today.'
          }
          label="Add block"
          onAction={() => actions.navigate('plan')}
        />
      </>
    );
  }

  const nodes: React.ReactNode[] = visible.map((block) => {
    const done = blockDoneOn(block, data.today);
    const past = !done && block.end <= data.now;
    const focus = isInFocusWindow(block.start, data.focusWindow);
    const category = blockCategoryMeta(block.category).label;
    return (
      <button
        key={block.id}
        type="button"
        className={`tli${done ? ' done' : past ? ' past' : ''}${focus ? ' fw' : ''}`}
        data-action="blk-toggle"
        data-id={block.id}
        data-s={block.start}
        data-e={block.end}
        aria-pressed={done}
        onClick={() => toggleBlockDone(block.id)}
      >
        <time>{block.start}</time>
        <span>
          <span className="tn">{block.title}</span>
          <small>
            {block.start}–{block.end} · {category}
          </small>
        </span>
        <span className="ck">
          <Icon name="check" />
        </span>
      </button>
    );
  });

  const nowIndex = visible.findIndex((block) => block.start > data.now);
  const nowLine = (
    <div className="nowline" id="nowline" key="nowline">
      <span id="nowchip">{data.now}</span>
    </div>
  );
  if (nowIndex >= 0) nodes.splice(nowIndex, 0, nowLine);
  else nodes.push(nowLine);

  return (
    <>
      {head}
      {size !== 'M' && data.focusWindow && (
        <span className="fwl">Your focus window · {data.focusWindow.label}</span>
      )}
      {showHoursButton && (
        <button
          type="button"
          className="tlall"
          aria-pressed={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Hide off-hours' : `Show all hours (${hiddenCount} hidden)`}
        </button>
      )}
      <div className="tl" id="tl">
        {nodes}
      </div>
    </>
  );
};
