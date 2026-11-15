import React, { useRef, useState } from 'react';
import type { Block } from '@/domain/types';
import {
  normalizeImportDay,
  parseTimetableItems,
  validateTimetableImport,
  TimetableImportResult,
  TimetableImportValidRow,
} from '@/domain/timetableImport';
import { DAY_FULL } from '@/domain/dates';
import { store, stampNewRecord } from '@/store';
import { recomputeDayStats } from '@/domain/stats';
import { todayISO } from '@/domain/dates';
import { Modal } from '@/ui/Modal';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { fileSaver } from '@/platform';

export interface ImportTimetableModalProps {
  open: boolean;
  onClose: () => void;
}

const TT_EXAMPLE = [
  'day,start,end,title,type',
  'Monday,09:00,10:00,DSA lecture,class',
  'Tuesday,14:00,16:00,Physics lab,class',
  '2026-12-05,18:00,19:30,Exam revision,study',
].join('\n');

interface PreviewRow {
  row: number;
  title: string;
  dayLabel: string;
  time: string;
  category: string;
  errors: string[];
}

function dayLabel(day: unknown): string {
  const normalized = normalizeImportDay(day);
  if (typeof normalized === 'number') return DAY_FULL[normalized] ?? '—';
  return normalized ?? '—';
}

function buildPreview(text: string, result: TimetableImportResult): PreviewRow[] {
  const items = parseTimetableItems(text);
  const errorsByRow = new Map<number, string[]>();
  result.errors.forEach((error) => {
    const list = errorsByRow.get(error.row) ?? [];
    list.push(error.reason);
    errorsByRow.set(error.row, list);
  });
  const validByRow = new Map<number, TimetableImportValidRow>();
  result.valid.forEach((row) => validByRow.set(row.row, row));

  return items.map((item, index) => {
    const row = index + 1;
    const valid = validByRow.get(row);
    const raw = item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
    const title = valid?.title ?? String(raw['title'] ?? '').trim();
    const start = valid?.start ?? String(raw['start'] ?? '');
    const end = valid?.end ?? String(raw['end'] ?? '');
    return {
      row,
      title,
      dayLabel: dayLabel(valid?.day ?? raw['day']),
      time: `${start || '—'}–${end || '—'}`,
      category: String(valid?.category ?? raw['category'] ?? 'class'),
      errors: errorsByRow.get(row) ?? [],
    };
  });
}

export const ImportTimetableModal: React.FC<ImportTimetableModalProps> = ({ open, onClose }) => {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [validCount, setValidCount] = useState(0);

  const reset = () => {
    setText('');
    setFileName('');
    setMessage('');
    setPreview(null);
    setValidCount(0);
  };

  const close = () => {
    onClose();
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setFileName(file.name);
      setMessage('');
      setPreview(null);
    };
    reader.readAsText(file);
  };

  const copyExample = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(TT_EXAMPLE);
        toast.showToast('Example format copied');
        return;
      }
    } catch {
      // fall through to placing it in the textarea
    }
    setText(TT_EXAMPLE);
    setPreview(null);
    setMessage('');
    textareaRef.current?.focus();
    textareaRef.current?.select();
    toast.showToast('Example placed in the box');
  };

  const downloadTemplate = async () => {
    try {
      await fileSaver.saveFile(
        new Blob([TT_EXAMPLE + '\n'], { type: 'text/csv;charset=utf-8' }),
        'timetable-template.csv',
      );
    } catch {
      toast.showToast('Could not download the template');
    }
  };

  const validate = () => {
    const result = validateTimetableImport(text);
    if (result.fatal) {
      setPreview(null);
      setMessage(result.fatal);
      Haptics.error();
      return;
    }
    const rows = buildPreview(text, result);
    setPreview(rows);
    setValidCount(result.valid.length);
    setMessage('');
  };

  const commit = () => {
    if (!preview || validCount === 0) return;
    const result = validateTimetableImport(text);
    store.set((state) => {
      result.valid.forEach((row) => {
        const created = stampNewRecord<Partial<Block>>(
          {
            title: row.title,
            day: row.day,
            start: row.start,
            end: row.end,
            category: row.category || 'class',
            done: false,
            doneDates: [],
            source: row.source === 'personal' ? 'personal' : 'college',
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Block;
        state.blocks.push(created);
      });
      recomputeDayStats(state.dayStats, state.blocks, todayISO());
    });
    Haptics.success();
    toast.showToast(`Imported ${validCount} block${validCount === 1 ? '' : 's'}`);
    reset();
    close();
  };

  return (
    <Modal open={open} onClose={close} title={preview ? 'Preview' : 'Import timetable'}>
      {preview ? (
        <div className="plan-import">
          <p className="hint">
            {validCount} valid row{validCount === 1 ? '' : 's'}
            {preview.length - validCount > 0
              ? `, ${preview.length - validCount} row${preview.length - validCount === 1 ? '' : 's'} with errors (skipped).`
              : '. Everything looks good.'}
          </p>
          <div className="tt-wrap">
            <table className="tt-prev">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.row} className={row.errors.length ? 'bad' : 'ok'}>
                    <td>{row.row}</td>
                    <td>{row.title || '—'}</td>
                    <td>{row.dayLabel}</td>
                    <td>{row.time}</td>
                    <td>{row.category}</td>
                    <td>
                      {row.errors.length ? (
                        <>
                          <b>Error:</b> {row.errors.join('; ')}
                        </>
                      ) : (
                        'OK'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row end">
            <button type="button" className="btn ghost" onClick={() => setPreview(null)}>
              Back
            </button>
            <button
              type="button"
              className="btn green"
              onClick={commit}
              disabled={validCount === 0}
            >
              Import {validCount} block{validCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      ) : (
        <div className="plan-import">
          <p className="hint">
            Paste CSV with the header <span className="mono">day,start,end,title,type</span> or a JSON
            array of blocks. <span className="mono">day</span> can be <span className="mono">0–6</span>{' '}
            (0 = Monday), a weekday name, or <span className="mono">YYYY-MM-DD</span>. Times use{' '}
            <span className="mono">HH:MM</span>.
          </p>
          <div className="field">
            <label htmlFor="tt-json">Timetable data</label>
            <textarea
              id="tt-json"
              ref={textareaRef}
              className="std"
              rows={8}
              value={text}
              placeholder={'day,start,end,title,type\nMonday,09:00,10:00,DSA lecture,class'}
              onChange={(event) => {
                setText(event.target.value);
                setMessage('');
              }}
            />
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} />
              Choose file
            </button>
            <button type="button" className="btn" onClick={copyExample}>
              <Icon name="download" size={16} />
              Copy example format
            </button>
            <button type="button" className="btn" onClick={downloadTemplate}>
              <Icon name="download" size={16} />
              Download CSV template
            </button>
            {fileName ? <span className="hint mono">{fileName}</span> : null}
            <input
              ref={fileRef}
              id="tt-file"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              style={{ display: 'none' }}
              onChange={handleFile}
              aria-label="Choose timetable CSV or JSON file"
            />
          </div>
          {message ? (
            <p className="hint plan-import-error" role="alert">
              {message}
            </p>
          ) : null}
          <div className="row end">
            <button type="button" className="btn ghost" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn green" onClick={validate}>
              Validate and preview
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
