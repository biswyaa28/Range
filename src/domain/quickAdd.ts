import type { TaskPriority, BlockCategory } from './types';
import { todayISO, addDays, mondayIndex, defaultClock, Clock } from './dates';

export type QuickAddKind = 'task' | 'block';

export interface QuickAddTaskPreview {
  kind: 'task';
  title: string;
  due: string | null; // ISO string or null
  priority: TaskPriority;
  category: string;
}

export interface QuickAddBlockPreview {
  kind: 'block';
  title: string;
  day: number | string; // 0-6 weekly or ISO string
  start: string; // HH:MM
  end: string; // HH:MM
  category: BlockCategory;
}

export type QuickAddPreview = QuickAddTaskPreview | QuickAddBlockPreview;

const TIME_RANGE_RE = /\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
const AT_TIME_RE = /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;

function parseTimeStr(raw: string, defaultMeridiem?: string): string | null {
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hours = parseInt(m[1] ?? '0', 10);
  const minutes = parseInt(m[2] ?? '0', 10);
  const meridiem = m[3] || defaultMeridiem;

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const WEEKDAY_NAMES: Record<string, number> = {
  monday: 0, mon: 0,
  tuesday: 1, tue: 1,
  wednesday: 2, wed: 2,
  thursday: 3, thu: 3,
  friday: 4, fri: 4,
  saturday: 5, sat: 5,
  sunday: 6, sun: 6,
};

/**
 * Natural-language parser parsing single-line quick add strings into either
 * a Block preview (if times/ranges are specified) or a Task preview.
 */
export function parseQuickAdd(input: string, clock: Clock = defaultClock): QuickAddPreview {
  let text = input.trim();
  const tToday = todayISO(clock);
  const curDayIndex = mondayIndex(clock.now(), clock);

  let detectedPriority: TaskPriority = 'med';
  // Check priority keywords
  if (/\b(?:p1|high\s+prio(?:rity)?|urgent|asap|important)\b/i.test(text)) {
    detectedPriority = 'high';
    text = text.replace(/\b(?:p1|high\s+prio(?:rity)?|urgent|asap|important)\b/gi, ' ');
  } else if (/\b(?:p2|med(?:ium)?\s+prio(?:rity)?)\b/i.test(text)) {
    detectedPriority = 'med';
    text = text.replace(/\b(?:p2|med(?:ium)?\s+prio(?:rity)?)\b/gi, ' ');
  } else if (/\b(?:p3|low\s+prio(?:rity)?)\b/i.test(text)) {
    detectedPriority = 'low';
    text = text.replace(/\b(?:p3|low\s+prio(?:rity)?)\b/gi, ' ');
  }

  // Check explicit block markers
  const isExplicitBlock = /\bblock:\s*/i.test(text);
  if (isExplicitBlock) {
    text = text.replace(/\bblock:\s*/gi, '');
  }

  // Detect time range e.g. "4-6pm" or "10:00 to 11:30" or "at 3pm"
  let startHM: string | null = null;
  let endHM: string | null = null;

  const rangeMatch = text.match(TIME_RANGE_RE);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const endMeridiem = rangeMatch[2].match(/(am|pm)$/i)?.[1]?.toLowerCase();
    const sParsed = parseTimeStr(rangeMatch[1], endMeridiem);
    const eParsed = parseTimeStr(rangeMatch[2]);
    if (sParsed && eParsed) {
      startHM = sParsed;
      endHM = eParsed;
      text = text.replace(rangeMatch[0], ' ');
    }
  } else {
    const atMatch = text.match(AT_TIME_RE);
    if (atMatch && atMatch[1]) {
      const parsed = parseTimeStr(atMatch[1]);
      if (parsed) {
        startHM = parsed;
        const [h, m] = parsed.split(':').map(Number);
        const nextHour = ((h ?? 0) + 1) % 24;
        endHM = `${String(nextHour).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
        text = text.replace(atMatch[0], ' ');
      }
    }
  }

  // Detect dates / day keywords
  let targetDay: number | string | null = null; // number (0-6) or ISO string
  let taskDueDate: string | null = null;

  if (/\b(?:today)\b/i.test(text)) {
    taskDueDate = tToday;
    targetDay = curDayIndex;
    text = text.replace(/\b(?:today)\b/gi, ' ');
  } else if (/\b(?:tomorrow)\b/i.test(text)) {
    taskDueDate = addDays(tToday, 1);
    targetDay = (curDayIndex + 1) % 7;
    text = text.replace(/\b(?:tomorrow)\b/gi, ' ');
  } else {
    // Check weekday names
    for (const [dayName, dayIdx] of Object.entries(WEEKDAY_NAMES)) {
      const re = new RegExp(`\\b(?:on\\s+)?${dayName}\\b`, 'i');
      if (re.test(text)) {
        targetDay = dayIdx;
        const diff = (dayIdx - curDayIndex + 7) % 7 || 7;
        taskDueDate = addDays(tToday, diff);
        text = text.replace(re, ' ');
        break;
      }
    }
  }

  // Clean remaining title
  const cleanTitle = text.replace(/\s+/g, ' ').trim();

  // If start & end are present or explicitly marked block -> Block
  if (startHM && endHM) {
    return {
      kind: 'block',
      title: cleanTitle || 'Untitled Block',
      day: targetDay !== null ? targetDay : curDayIndex,
      start: startHM,
      end: endHM,
      category: 'personal',
    };
  }

  return {
    kind: 'task',
    title: cleanTitle || 'Untitled Task',
    due: taskDueDate,
    priority: detectedPriority,
    category: '',
  };
}
