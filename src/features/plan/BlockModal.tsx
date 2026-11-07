import React, { useEffect, useState } from 'react';
import type { Block, BlockSource } from '@/domain/types';
import { DAY_FULL, fromISO, mondayIndex, todayISO } from '@/domain/dates';
import { store, stampNewRecord, touchRecord } from '@/store';
import { recomputeDayStats } from '@/domain/stats';
import { Modal } from '@/ui/Modal';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { blockCategories } from './blockCategories';

export interface BlockModalProps {
  open: boolean;
  onClose: () => void;
  block: Block | null;
  defaultDay: number | string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultRepeat?: 'weekly' | 'once';
}

type RepeatMode = 'weekly' | 'once';

function presetDate(day: number | string): string {
  return typeof day === 'string' ? day : todayISO();
}

function presetWeekday(day: number | string): number {
  return typeof day === 'number' ? day : mondayIndex(fromISO(day));
}

export const BlockModal: React.FC<BlockModalProps> = ({
  open,
  onClose,
  block,
  defaultDay,
  defaultStart,
  defaultEnd,
  defaultRepeat,
}) => {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('class');
  const [source, setSource] = useState<BlockSource>('personal');
  const [repeat, setRepeat] = useState<RepeatMode>('weekly');
  const [date, setDate] = useState(todayISO());
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (block) {
      setTitle(block.title);
      setCategory(String(block.category || 'other'));
      setSource(block.source === 'personal' ? 'personal' : 'college');
      const once = typeof block.day === 'string';
      setRepeat(once ? 'once' : 'weekly');
      setDate(typeof block.day === 'string' ? block.day : todayISO());
      setWeekday(
        typeof block.day === 'number'
          ? block.day
          : mondayIndex(fromISO(block.day)),
      );
      setStart(block.start);
      setEnd(block.end);
      return;
    }

    setTitle('');
    setCategory('class');
    setSource('personal');
    setRepeat(defaultRepeat ?? 'weekly');
    setDate(presetDate(defaultDay));
    setWeekday(presetWeekday(defaultDay));
    setStart(defaultStart ?? '09:00');
    setEnd(defaultEnd ?? '10:00');
  }, [open, block, defaultDay, defaultStart, defaultEnd, defaultRepeat]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    let message = '';
    if (!cleanTitle) {
      message = 'Title is required.';
    } else if (repeat === 'once' && !date) {
      message = 'Pick a date for the one-off block.';
    } else if (!start || !end) {
      message = 'Start and end times are required.';
    } else if (end <= start) {
      message = 'End time must be after start time.';
    }

    if (message) {
      setError(message);
      Haptics.error();
      return;
    }

    const day: number | string = repeat === 'once' ? date : weekday;

    store.set((state) => {
      if (block) {
        const current = state.blocks.find((item) => item.id === block.id);
        if (current) {
          current.title = cleanTitle;
          current.day = day;
          current.start = start;
          current.end = end;
          current.category = category;
          current.source = source;
          touchRecord(current);
        }
      } else {
        const created = stampNewRecord<Partial<Block>>(
          {
            title: cleanTitle,
            day,
            start,
            end,
            category,
            done: false,
            doneDates: [],
            source,
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Block;
        state.blocks.push(created);
      }
      recomputeDayStats(state.dayStats, state.blocks, todayISO());
    });

    Haptics.success();
    toast.showToast(block ? 'Block updated' : 'Block added');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={block ? 'Edit block' : 'New block'}>
      <form className="block-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="bf-title">Title</label>
          <input
            id="bf-title"
            value={title}
            maxLength={90}
            placeholder="e.g. DSA lecture"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="bf-cat">Category</label>
            <select id="bf-cat" value={category} onChange={(event) => setCategory(event.target.value)}>
              {blockCategories().map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Source</label>
            <Segmented<BlockSource>
              value={source}
              onChange={setSource}
              options={[
                { value: 'college', label: 'College' },
                { value: 'personal', label: 'Personal' },
              ]}
              aria-label="Source"
            />
          </div>
        </div>

        <div className="field">
          <label>Repeat</label>
          <Segmented<RepeatMode>
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'once', label: 'Once' },
            ]}
            aria-label="Repeat"
          />
        </div>

        {repeat === 'weekly' ? (
          <div className="field">
            <label htmlFor="bf-day">Day</label>
            <select
              id="bf-day"
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
            >
              {DAY_FULL.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="bf-date">Date</label>
            <input id="bf-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label htmlFor="bf-start">Start</label>
            <input id="bf-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bf-end">End</label>
            <input id="bf-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>

        {error ? (
          <div className="form-err" role="alert">
            {error}
          </div>
        ) : null}

        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn green">
            {block ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
