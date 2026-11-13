import React, { useState, useMemo } from 'react';
import type { Deadline, DeadlineType } from '@/domain/types';
import { todayISO, diffDays, fmtShort } from '@/domain/dates';
import { useStore, store } from '@/store';
import { stampNewRecord, softDeleteRecord, softUndeleteRecord, touchRecord } from '@/store/stamp';
import { Modal } from '@/ui/Modal';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { approveDeadline, dismissDeadline, selectDeadlines } from './deadlinesActions';
import './DeadlinesView.css';

export function urgency(due: string) {
  const d = diffDays(due, todayISO());
  if (d < 0) return { cls: 'u-overdue', label: `Overdue ${-d}d` };
  if (d <= 3) return { cls: 'u-soon', label: d === 0 ? 'Due today' : `${d} days left` };
  if (d <= 7) return { cls: 'u-week', label: `${d} days left` };
  return { cls: 'u-later', label: `${d} days left` };
}

function cap1(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
}

interface DeadlineItemProps {
  deadline: Deadline;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (d: Deadline) => void;
}

const DeadlineItem: React.FC<DeadlineItemProps> = ({ deadline, onToggle, onDelete, onEdit }) => {
  const u = urgency(deadline.due);
  const done = deadline.status === 'done';
  const x = diffDays(deadline.due, todayISO());
  const onSegs = x <= 1 ? 4 : x <= 3 ? 3 : x <= 7 ? 2 : 1;

  return (
    <div className="deadlines-card-wrap">
      <div className={`dl-card ${u.cls}${done ? ' done' : ''}`}>
        <span className="bar" />
        <button
          type="button"
          className="dl-card-content"
          onClick={() => onEdit(deadline)}
          aria-label={`Edit ${deadline.title}`}
        >
          <div className="dl-main">
            <div className="dl-title">{deadline.title}</div>
            <div className="dl-tags">
              {deadline.course ? <span className="chip">{deadline.course.toUpperCase()}</span> : null}
              <span className="chip">{cap1(String(deadline.type))}</span>
              <span className="chip mono">{deadline.due} · {fmtShort(deadline.due)}</span>
              <span className={`chip${u.cls === 'u-overdue' ? ' red' : u.cls === 'u-soon' ? ' solid' : ''}`}>
                {u.label}
              </span>
            </div>
            {!done && (
              <div
                className={`dlrow${x <= 3 ? ' hot' : ''}`}
                style={{ padding: '6px 0 0', borderTop: 'none' }}
              >
                <div
                  className="segs"
                  role="img"
                  aria-label={u.label.toLowerCase()}
                >
                  {[1, 2, 3, 4].map((k) => (
                    <i key={k} className={k <= onSegs ? 'on' : ''} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </button>

        <div className="dl-actions">
          <button
            type="button"
            className={`ibtn${done ? ' on' : ''}`}
            data-action="dl-toggle"
            data-id={deadline.id}
            aria-pressed={done}
            aria-label={`Mark done: ${deadline.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(deadline.id);
            }}
          >
            <Icon name="check" />
          </button>
          <button
            type="button"
            className="ibtn"
            data-action="dl-del"
            data-id={deadline.id}
            aria-label={`Delete: ${deadline.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(deadline.id);
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
        {done && <span className="stamp">Done</span>}
      </div>
    </div>
  );
};

export const DeadlinesView: React.FC = () => {
  const toast = useToast();
  const deadlines = useStore(selectDeadlines);
  const inbox = useMemo(
    () => deadlines.filter((d) => !d.deleted && d.status === 'pending'),
    [deadlines],
  );

  const rest = useMemo(
    () =>
      deadlines
        .filter((d) => !d.deleted && d.status !== 'pending')
        .slice()
        .sort((a, b) => String(a.due).localeCompare(String(b.due))),
    [deadlines],
  );

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState<{
    id?: string;
    title: string;
    course: string;
    due: string;
    type: DeadlineType;
  }>({
    title: '',
    course: '',
    due: '',
    type: 'assignment',
  });

  const handleApprove = (id: string) => {
    approveDeadline(id);
    Haptics.success();
    toast.showToast('Deadline approved');
  };

  const handleDismiss = (id: string) => {
    dismissDeadline(id);
    Haptics.warning();
    toast.showToast('Deadline dismissed');
  };

  const handleToggle = (id: string) => {
    store.set((state) => {
      const d = state.deadlines.find((x) => x.id === id);
      if (d) {
        d.status = d.status === 'done' ? 'approved' : 'done';
        touchRecord(d);
        if (d.status === 'done') {
          Haptics.success();
        } else {
          Haptics.tap();
        }
      }
    });
  };

  const handleDelete = (id: string) => {
    let deleted: Deadline | null = null;
    store.set((state) => {
      deleted = softDeleteRecord(state.deadlines, id);
    });

    Haptics.warning();
    toast.showToast('Deadline deleted', 'Undo', () => {
      if (!deleted) return;
      store.set((state) => {
        const d = state.deadlines.find((x) => x.id === id);
        if (d) {
          softUndeleteRecord(d);
        }
      });
      Haptics.select();
    });
  };

  const handleOpenAdd = () => {
    setModalItem({
      title: '',
      course: '',
      due: '',
      type: 'assignment',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (d: Deadline) => {
    setModalItem({
      id: d.id,
      title: d.title,
      course: d.course,
      due: d.due,
      type: d.type,
    });
    setModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    const title = modalItem.title.trim();
    const due = modalItem.due;
    if (!title || !due) {
      toast.showToast('Title and due date are required');
      return;
    }

    if (modalItem.id) {
      // Edit
      store.set((state) => {
        const d = state.deadlines.find((x) => x.id === modalItem.id);
        if (d) {
          d.title = title;
          d.course = modalItem.course.trim();
          d.due = due;
          d.type = modalItem.type;
          touchRecord(d);
        }
      });
      Haptics.tap();
      toast.showToast('Deadline updated');
    } else {
      // Add
      store.set((state) => {
        const newDl = stampNewRecord<Partial<Deadline>>(
          {
            title,
            course: modalItem.course.trim(),
            due,
            type: modalItem.type,
            status: 'approved',
            source: 'personal',
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Deadline;
        state.deadlines.push(newDl);
      });
      Haptics.success();
      toast.showToast('Deadline added');
    }
    setModalOpen(false);
  };

  return (
    <div className="view-content deadlines-view">
      <div className="view-head">
        <h1>Deadlines</h1>
        <div className="rule" />
      </div>

      {/* Inbox Panel */}
      <div className="panel inbox">
        <div className="panel-head">
          <h2>Inbox</h2>
          <span className="chip">{inbox.length} pending</span>
          <span className="spacer" />
          <span className="hint">
            Review items before they join your list. Will be fed by your college sync (AI wiring coming).
          </span>
        </div>

        {inbox.length > 0 ? (
          inbox.map((d) => {
            const u = urgency(d.due);
            return (
              <div key={d.id} className={`dl-card pending ${u.cls}`}>
                <span className="bar" />
                <div className="dl-main">
                  <div className="dl-title">{d.title}</div>
                  <div className="dl-tags">
                    {d.course ? <span className="chip">{d.course.toUpperCase()}</span> : null}
                    <span className="chip">{cap1(String(d.type))}</span>
                    <span className="chip mono">{d.due}</span>
                    <span className={`chip${u.cls === 'u-overdue' ? ' red' : u.cls === 'u-soon' ? ' solid' : ''}`}>
                      {u.label}
                    </span>
                  </div>
                </div>
                <div className="dl-actions">
                  <button
                    type="button"
                    className="btn green sm"
                    data-action="dl-approve"
                    data-id={d.id}
                    onClick={() => handleApprove(d.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    data-action="dl-dismiss"
                    data-id={d.id}
                    onClick={() => handleDismiss(d.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="hint">Inbox is empty for now. Load demo data in Settings to see pending items here.</p>
        )}
      </div>

      {/* Main List Panel */}
      <div className="panel">
        <div className="panel-head">
          <h2>All deadlines</h2>
          <span className="chip">{rest.length} items</span>
        </div>

        {rest.length > 0 ? (
          rest.map((d) => (
            <DeadlineItem
              key={d.id}
              deadline={d}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={handleOpenEdit}
            />
          ))
        ) : (
          <p className="hint">Nothing here yet — approved deadlines will appear sorted by due date.</p>
        )}
      </div>

      {/* Quick Add Form Panel */}
      <form
        className="panel dl-form"
        id="dl-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const title = (form.elements.namedItem('dl-title') as HTMLInputElement).value.trim();
          const course = (form.elements.namedItem('dl-course') as HTMLInputElement).value.trim();
          const due = (form.elements.namedItem('dl-due') as HTMLInputElement).value;
          const type = (form.elements.namedItem('dl-type') as HTMLSelectElement).value as DeadlineType;

          if (!title || !due) {
            toast.showToast('Title and due date are required');
            return;
          }

          store.set((state) => {
            const newDl = stampNewRecord<Partial<Deadline>>(
              {
                title,
                course,
                due,
                type,
                status: 'approved',
                source: 'personal',
              },
              state.deviceId,
              () => crypto.randomUUID(),
            ) as Deadline;
            state.deadlines.push(newDl);
          });
          form.reset();
          Haptics.success();
          toast.showToast('Deadline added');
        }}
      >
        <div className="field">
          <label htmlFor="dl-title">Title</label>
          <input id="dl-title" name="dl-title" maxLength={120} placeholder="e.g. Essay draft" required />
        </div>
        <div className="field">
          <label htmlFor="dl-course">Course</label>
          <input id="dl-course" name="dl-course" maxLength={60} placeholder="e.g. English Lit" />
        </div>
        <div className="field">
          <label htmlFor="dl-due">Due</label>
          <input type="date" id="dl-due" name="dl-due" required />
        </div>
        <div className="field">
          <label htmlFor="dl-type">Type</label>
          <select id="dl-type" name="dl-type" defaultValue="assignment">
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="announcement">Announcement</option>
          </select>
        </div>
        <button type="submit" className="btn green">
          <Icon name="plus" /> Add
        </button>
      </form>

      {/* Floating Action Button for mobile / quick add */}
      <button
        type="button"
        className="fab"
        data-action="dl-new"
        aria-label="New deadline"
        onClick={handleOpenAdd}
      >
        <Icon name="plus" />
      </button>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalItem.id ? 'Edit deadline' : 'Add deadline'}
      >
        <form onSubmit={handleSaveModal} className="deadlines-modal-form">
          <div className="field">
            <label htmlFor="modal-dl-title">Title</label>
            <input
              id="modal-dl-title"
              value={modalItem.title}
              maxLength={120}
              placeholder="e.g. Essay draft"
              onChange={(e) => setModalItem({ ...modalItem, title: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="modal-dl-course">Course</label>
            <input
              id="modal-dl-course"
              value={modalItem.course}
              maxLength={60}
              placeholder="e.g. English Lit"
              onChange={(e) => setModalItem({ ...modalItem, course: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="modal-dl-due">Due</label>
            <input
              type="date"
              id="modal-dl-due"
              value={modalItem.due}
              onChange={(e) => setModalItem({ ...modalItem, due: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="modal-dl-type">Type</label>
            <select
              id="modal-dl-type"
              value={modalItem.type}
              onChange={(e) => setModalItem({ ...modalItem, type: e.target.value as DeadlineType })}
            >
              <option value="assignment">Assignment</option>
              <option value="exam">Exam</option>
              <option value="announcement">Announcement</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn green">
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
