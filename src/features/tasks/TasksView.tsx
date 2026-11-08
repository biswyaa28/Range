import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Task, TaskPriority } from '@/domain/types';
import { todayISO, diffDays, fmtShort } from '@/domain/dates';
import { parseQuickAdd } from '@/domain/quickAdd';
import { useStore, store, stampNewRecord, softDeleteRecord, softUndeleteRecord, touchRecord } from '@/store';
import { Segmented } from '@/ui/Segmented';
import { Modal } from '@/ui/Modal';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { useSwipe } from '@/hooks/useSwipe';
import './TasksView.css';

export type TodoFilter = 'all' | 'today' | 'overdue' | 'done';

export const CATEGORIES = [
  { id: 'class', label: 'Class' },
  { id: 'study', label: 'Study' },
  { id: 'work', label: 'Work' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'meal', label: 'Meal' },
  { id: 'personal', label: 'Personal' },
  { id: 'other', label: 'Other' },
] as const;

function cap1(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
}

function catInfo(c?: string): { id: string; label: string } {
  const f = CATEGORIES.find((x) => x.id === c);
  return f || { id: c || 'other', label: cap1(String(c || 'other')) };
}

function prioInfo(p: TaskPriority): { label: string } {
  if (p === 'high') return { label: 'High' };
  if (p === 'med') return { label: 'Med' };
  return { label: 'Low' };
}

interface TaskItemProps {
  task: Task;
  popped: boolean;
  onToggle: (id: string, el?: HTMLElement) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, popped, onToggle, onDelete, onEdit }) => {
  const tickboxRef = useRef<HTMLButtonElement | null>(null);

  const { ref: swipeRef, transform, swiping, offset, handlers } = useSwipe<HTMLDivElement>({
    onCommitRight: () => {
      onToggle(task.id, tickboxRef.current ?? undefined);
    },
    onCommitLeft: () => {
      onDelete(task.id);
    },
  });

  const dueChip = useMemo(() => {
    if (!task.due) return null;
    const T = todayISO();
    const d = diffDays(task.due, T);
    let label: string;
    let cls = '';
    if (task.done) {
      label = fmtShort(task.due);
    } else if (d < 0) {
      label = `Overdue ${-d}d`;
      cls = ' red';
    } else if (d === 0) {
      label = 'Today';
      cls = ' solid';
    } else if (d === 1) {
      label = 'Tomorrow';
    } else {
      label = `${d}d · ${fmtShort(task.due)}`;
    }
    return <span className={`chip${cls}`}>{label}</span>;
  }, [task.due, task.done]);

  const p = prioInfo(task.priority);
  const swipeRight = offset >= 0;
  const swipeOpacity = Math.min(1, Math.abs(offset) / 64).toFixed(2);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggle(task.id, tickboxRef.current ?? undefined);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(task.id);
    }
  };

  return (
    <div
      ref={swipeRef}
      className={`task${task.done ? ' done' : ''}${popped ? ' pop' : ''}${swiping ? ' swiping' : ''}`}
      style={{ transform }}
      tabIndex={0}
      role="listitem"
      aria-label={`Task: ${task.title}`}
      onKeyDown={handleKeyDown}
      data-id={task.id}
      {...handlers}
    >
      <span
        className={`swipe-rv ${swipeRight ? 'right' : 'left'}`}
        style={{ opacity: swiping ? swipeOpacity : 0 }}
        aria-hidden="true"
      >
        <span className="sv-r">
          <Icon name="check" />
        </span>
        <span className="sv-l">
          <Icon name="trash" />
        </span>
      </span>

      <button
        ref={tickboxRef}
        type="button"
        className="tickbox"
        data-action="task-toggle"
        data-id={task.id}
        aria-pressed={task.done}
        aria-label={`Toggle: ${task.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id, e.currentTarget);
        }}
      >
        <Icon name="check" />
      </button>

      <div
        className="task-main"
        onClick={() => onEdit(task)}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={-1}
        aria-label={`Edit task: ${task.title}`}
      >
        <div className="task-title">{task.title}</div>
        <div className="task-tags">
          {dueChip}
          {task.category ? <span className="chip">{catInfo(task.category).label}</span> : null}
          <span className={`chip${task.priority === 'high' ? ' red' : ''}`}>{p.label}</span>
        </div>
      </div>

      <button
        type="button"
        className="ibtn"
        data-action="task-del"
        data-id={task.id}
        aria-label={`Delete: ${task.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
};

export const TasksView: React.FC = () => {
  const tasks = useStore((s) => s.tasks);
  const toast = useToast();

  const [filter, setFilter] = useState<TodoFilter>('all');
  const [justToggledId, setJustToggledId] = useState<string | null>(null);

  // Add Task form state
  const [formTitle, setFormTitle] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('med');
  const [formCategory, setFormCategory] = useState('');

  // Quick-add state
  const [quickInput, setQuickInput] = useState('');

  // Edit / Delete Modal state
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Command-palette result: open the matching task editor after navigation.
  useEffect(() => {
    const onEditTask = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      const task = store.get().tasks.find((item) => item.id === id && !item.deleted);
      if (task) setEditingTask({ ...task });
    };
    window.addEventListener('personalos:edit-task', onEditTask);
    return () => window.removeEventListener('personalos:edit-task', onEditTask);
  }, []);
  const [deleteCandidate, setDeleteCandidate] = useState<Task | null>(null);

  // Scrollline progress handler
  useEffect(() => {
    const onScroll = () => {
      const scrollLine = document.getElementById('scrollline');
      if (!scrollLine) return;

      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 40) {
        scrollLine.classList.add('on');
        const pct = Math.min(1, Math.max(0.004, window.scrollY / max));
        scrollLine.style.transform = `scaleX(${pct.toFixed(4)})`;
      } else {
        scrollLine.classList.remove('on');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      const scrollLine = document.getElementById('scrollline');
      if (scrollLine) {
        scrollLine.classList.remove('on');
        scrollLine.style.transform = 'scaleX(0)';
      }
    };
  }, []);

  // Filter tasks
  const liveTasks = useMemo(() => {
    return tasks.filter((t) => !t.deleted);
  }, [tasks]);

  const counts = useMemo(() => {
    const T = todayISO();
    return {
      all: liveTasks.length,
      today: liveTasks.filter((t) => !t.done && t.due === T).length,
      overdue: liveTasks.filter((t) => !t.done && !!t.due && t.due < T).length,
      done: liveTasks.filter((t) => !!t.done).length,
    };
  }, [liveTasks]);

  const filteredTasks = useMemo(() => {
    const T = todayISO();
    const order: Record<TaskPriority, number> = { high: 2, med: 1, low: 0 };

    return liveTasks
      .filter((t) => {
        if (filter === 'done') return !!t.done;
        if (filter === 'today') return !t.done && t.due === T;
        if (filter === 'overdue') return !t.done && !!t.due && t.due < T;
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
        if (order[a.priority] !== order[b.priority]) return order[b.priority] - order[a.priority];
        const ad = a.due || '9999';
        const bd = b.due || '9999';
        if (ad !== bd) return ad < bd ? -1 : 1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
  }, [liveTasks, filter]);

  const quickPreview = useMemo(() => {
    if (!quickInput.trim()) return null;
    const parsed = parseQuickAdd(quickInput);
    if (parsed.kind === 'task') {
      return parsed;
    }
    return null;
  }, [quickInput]);

  const handleToggle = useCallback(
    (id: string, el?: HTMLElement) => {
      let isDone = false;
      store.set((state) => {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        t.done = !t.done;
        isDone = t.done;
        touchRecord(t);

        const today = todayISO();
        if (!state.dayStats[today]) {
          state.dayStats[today] = {
            date: today,
            blocksDone: 0,
            blocksTotal: 0,
            tasksDone: 0,
            focusMinutes: 0,
            updatedAt: new Date().toISOString(),
          };
        }
        const s = state.dayStats[today]!;
        s.tasksDone = Math.max(0, s.tasksDone + (t.done ? 1 : -1));
      });

      if (isDone) {
        setJustToggledId(id);
        setTimeout(() => setJustToggledId(null), 550);
        Haptics.success(el);
      } else {
        Haptics.tap(el);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (id: string) => {
      let deletedTask: Task | null = null;
      store.set((state) => {
        deletedTask = softDeleteRecord(state.tasks, id);
      });

      Haptics.warning();
      toast.showToast('Task deleted', 'Undo', () => {
        if (!deletedTask) return;
        store.set((state) => {
          const t = state.tasks.find((x) => x.id === id);
          if (t) {
            softUndeleteRecord(t);
          }
        });
        Haptics.select();
      });
    },
    [toast],
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) {
      toast.showToast('Give the task a title first');
      Haptics.error();
      return;
    }

    store.set((state) => {
      const newTask = stampNewRecord<Partial<Task>>(
        {
          title,
          due: formDue || null,
          priority: formPriority,
          done: false,
          category: formCategory || '',
        },
        state.deviceId,
        () => crypto.randomUUID(),
      );
      state.tasks.unshift(newTask as Task);
    });

    setFormTitle('');
    setFormDue('');
    setFormPriority('med');
    setFormCategory('');
    Haptics.success();
    toast.showToast('Task added');
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPreview || !quickPreview.title) {
      return;
    }

    store.set((state) => {
      const newTask = stampNewRecord<Partial<Task>>(
        {
          title: quickPreview.title,
          due: quickPreview.due,
          priority: quickPreview.priority,
          done: false,
          category: quickPreview.category || '',
        },
        state.deviceId,
        () => crypto.randomUUID(),
      );
      state.tasks.unshift(newTask as Task);
    });

    setQuickInput('');
    Haptics.success();
    toast.showToast('Task added');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) {
      toast.showToast('Give the task a title first');
      return;
    }

    store.set((state) => {
      const t = state.tasks.find((x) => x.id === editingTask.id);
      if (t) {
        t.title = editingTask.title.trim();
        t.due = editingTask.due || null;
        t.priority = editingTask.priority;
        t.category = editingTask.category || '';
        touchRecord(t);
      }
    });

    setEditingTask(null);
    Haptics.success();
    toast.showToast('Task updated');
  };

  return (
    <div className="view-content tasks-view">
      <div className="view-head">
        <h1>To-Do</h1>
        <div className="rule" />
      </div>

      {/* Quick Add with Live Preview */}
      <form className="qadd tasks-quick-add" onSubmit={handleQuickAddSubmit}>
        <input
          id="qadd-in"
          type="text"
          maxLength={140}
          placeholder="Quick add a task (e.g. Finish report tomorrow high prio)…"
          aria-label="Quick add a task"
          autoComplete="off"
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
        />
        <button type="submit" className="addb" aria-label="Add task">
          <Icon name="plus" />
        </button>
      </form>

      {quickPreview && (
        <div className="tasks-quick-preview" aria-live="polite">
          <span>Preview:</span>
          <span className="chip solid">{quickPreview.title}</span>
          {quickPreview.due && <span className="chip">{fmtShort(quickPreview.due)}</span>}
          <span className={`chip${quickPreview.priority === 'high' ? ' red' : ''}`}>
            {prioInfo(quickPreview.priority).label}
          </span>
        </div>
      )}

      {/* Standard Add Task Form */}
      <form className="panel todo-form" id="todo-form" onSubmit={handleFormSubmit}>
        <div className="field">
          <label htmlFor="todo-title">Task</label>
          <input
            id="todo-title"
            maxLength={140}
            placeholder="What needs doing?"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="todo-due">Due</label>
          <select
            id="todo-due"
            value={formDue}
            onChange={(e) => setFormDue(e.target.value)}
            aria-label="Due date"
          >
            <option value="">No date</option>
            <option value={todayISO()}>Today</option>
            <option value={todayISO() ? fmtShort(todayISO()) && new Date(Date.now() + 86400000).toISOString().split('T')[0] : ''}>
              Tomorrow
            </option>
            <option value={new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}>
              Next week
            </option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="todo-prio">Priority</label>
          <div className="tasks-prio-chips" id="todo-prio" role="group" aria-label="Priority">
            {(['low', 'med', 'high'] as TaskPriority[]).map((pVal) => (
              <button
                key={pVal}
                type="button"
                className={`tasks-prio-chip${formPriority === pVal ? ' active' : ''}${formPriority === 'high' && pVal === 'high' ? ' red' : ''}`}
                onClick={() => setFormPriority(pVal)}
                aria-pressed={formPriority === pVal}
              >
                {cap1(pVal)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="todo-cat">Category</label>
          <select
            id="todo-cat"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn green">
          <Icon name="plus" /> ADD
        </button>
      </form>

      {/* Filter Tabs */}
      <div className="todo-filters">
        <Segmented<TodoFilter>
          value={filter}
          onChange={(newVal) => {
            setFilter(newVal);
            Haptics.select();
          }}
          options={[
            { value: 'all', label: `All · ${counts.all}` },
            { value: 'today', label: `Today · ${counts.today}` },
            { value: 'overdue', label: `Overdue · ${counts.overdue}` },
            { value: 'done', label: `Done · ${counts.done}` },
          ]}
          aria-label="Filter tasks"
        />
      </div>

      {/* Task List or Empty State */}
      <div className="task-list" role="list">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task, index) => (
            <div
              key={task.id}
              className="fx-in"
              style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
            >
              <TaskItem
                task={task}
                popped={justToggledId === task.id}
                onToggle={handleToggle}
                onDelete={(id) => {
                  const t = liveTasks.find((x) => x.id === id);
                  if (t) setDeleteCandidate(t);
                }}
                onEdit={(t) => setEditingTask({ ...t })}
              />
            </div>
          ))
        ) : (
          <div className="empty" role="listitem">
            <h3>No tasks here</h3>
            <p className="hint">
              {filter === 'all'
                ? 'Add your first task with the form above.'
                : `Nothing matches the “${filter}” filter.`}
            </p>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        type="submit"
        className="fab"
        form="todo-form"
        aria-label="Add task"
      >
        <Icon name="plus" />
      </button>

      {/* Edit Task Modal */}
      <Modal
        open={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="Edit task"
      >
        {editingTask && (
          <form onSubmit={handleSaveEdit} className="task-edit-form">
            <div className="field">
              <label htmlFor="edit-task-title">Title</label>
              <input
                id="edit-task-title"
                value={editingTask.title}
                maxLength={140}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="edit-task-due">Due</label>
              <input
                type="date"
                id="edit-task-due"
                value={editingTask.due || ''}
                onChange={(e) => setEditingTask({ ...editingTask, due: e.target.value || null })}
              />
            </div>

            <div className="field">
              <label htmlFor="edit-task-prio">Priority</label>
              <div className="tasks-prio-chips" id="edit-task-prio">
                {(['low', 'med', 'high'] as TaskPriority[]).map((pVal) => (
                  <button
                    key={pVal}
                    type="button"
                    className={`tasks-prio-chip${editingTask.priority === pVal ? ' active' : ''}${editingTask.priority === 'high' && pVal === 'high' ? ' red' : ''}`}
                    onClick={() => setEditingTask({ ...editingTask, priority: pVal })}
                  >
                    {cap1(pVal)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="edit-task-cat">Category</label>
              <select
                id="edit-task-cat"
                value={editingTask.category || ''}
                onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value })}
              >
                <option value="">—</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setEditingTask(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn green">
                Save
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        title="Delete task"
      >
        {deleteCandidate && (
          <div>
            <p style={{ margin: '8px 0 20px', color: 'var(--text-2)', fontSize: '14px' }}>
              Are you sure you want to delete “{deleteCandidate.title}”?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn red"
                onClick={() => {
                  handleDelete(deleteCandidate.id);
                  setDeleteCandidate(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
