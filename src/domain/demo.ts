import type { AppState, Block, Task, Note, Deadline, DayStats } from './types';
import { defaultState } from './types';
import { addDays, mondayIndex, defaultClock, Clock } from './dates';
import type { IdGen } from './id';
import { defaultIdGen } from './id';

export function buildDemoData(
  clock: Clock = defaultClock,
  idGen: IdGen = defaultIdGen,
  existingTheme?: AppState['settings']['theme'],
): AppState {
  const T = clock.todayISO();
  const wd = mondayIndex(clock.now(), clock);
  const nowTs = clock.nowISO();

  const B = (
    day: number,
    title: string,
    start: string,
    end: string,
    category: Block['category'],
    source?: Block['source'],
  ): Block => ({
    id: idGen.uuid(),
    title,
    day,
    start,
    end,
    category,
    done: false,
    doneDates: [],
    source: source || 'college',
    createdAt: nowTs,
    updatedAt: nowTs,
    deleted: false,
    deviceId: '',
  });

  const blocks: Block[] = [
    B(0, 'DSA Lecture', '09:00', '10:00', 'class'),
    B(0, 'Data Structures Lab', '10:15', '12:00', 'class'),
    B(0, 'Lunch', '13:00', '14:00', 'meal', 'personal'),
    B(0, 'Linear Algebra', '14:00', '15:30', 'class'),
    B(0, 'Gym Session', '18:00', '19:00', 'exercise', 'personal'),
    B(1, 'Calculus II', '09:30', '11:00', 'class'),
    B(1, 'Lunch', '13:00', '14:00', 'meal', 'personal'),
    B(1, 'Library Study Block', '16:00', '18:00', 'study', 'personal'),
    B(2, 'DSA Tutorial', '11:00', '12:30', 'class'),
    B(2, 'English Literature', '14:00', '15:30', 'class'),
    B(2, 'Evening Run', '19:00', '19:45', 'exercise', 'personal'),
    B(3, 'Physics II', '09:00', '10:30', 'class'),
    B(3, 'Group Project Meeting', '16:00', '18:00', 'study'),
    B(3, 'Dinner & Chill', '20:00', '21:00', 'meal', 'personal'),
    B(4, 'Operating Systems Lecture', '10:00', '12:00', 'class'),
    B(4, 'Assignment Deep Work', '15:00', '17:00', 'study', 'personal'),
    B(5, 'Groceries & Errands', '10:00', '11:30', 'personal', 'personal'),
    B(5, 'Side Project Coding', '15:00', '17:30', 'study', 'personal'),
    B(6, 'Laundry & Reset', '11:00', '12:00', 'personal', 'personal'),
    B(6, 'Weekly Review + Plan', '19:00', '19:45', 'study', 'personal'),
  ];

  /* Mark the first two of today's blocks as already done. */
  const todays = blocks.filter((b) => b.day === wd);
  if (todays[0]) todays[0].doneDates.push(T);
  if (todays[1]) todays[1].doneDates.push(T);

  const TK = (
    title: string,
    due: string | null,
    priority: Task['priority'],
    done: boolean,
    createdBack: number,
  ): Task => {
    const created = addDays(T, -createdBack) + 'T10:00:00.000Z';
    return {
      id: idGen.uuid(),
      title,
      due,
      priority,
      done,
      category: '',
      createdAt: created,
      updatedAt: created,
      deleted: false,
      deviceId: '',
    };
  };

  const tasks: Task[] = [
    TK('Finish OS assignment write-up', addDays(T, -1), 'high', false, 4),
    TK('Email professor about project extension', addDays(T, -1), 'med', false, 3),
    TK('Buy birthday gift for sis', T, 'med', false, 2),
    TK('Read chapter 7 — Graphs', T, 'low', false, 5),
    TK('Prep DSA tutorial sheet', addDays(T, 1), 'high', false, 2),
    TK('Book dentist appointment', addDays(T, 4), 'low', false, 6),
    TK('Water the plants', null, 'low', false, 1),
    TK('Submit scholarship form', addDays(T, -3), 'high', true, 8),
    TK('Renew gym membership', addDays(T, -2), 'med', true, 9),
  ];

  const notes: Note[] = [
    {
      id: idGen.uuid(),
      title: 'Reading list',
      pinned: true,
      updatedAt: T + 'T09:12:00.000Z',
      createdAt: T + 'T09:12:00.000Z',
      body: 'Designing Data-Intensive Applications — ch 5-7\nThe Pragmatic Programmer — re-read part II\nPapers: Raft, Spanner, Dynamo\n\nFiction queue:\nProject Hail Mary\nPiranesi',
      deleted: false,
      deviceId: '',
    },
    {
      id: idGen.uuid(),
      title: 'Project ideas',
      pinned: false,
      updatedAt: addDays(T, -2) + 'T21:40:00.000Z',
      createdAt: addDays(T, -2) + 'T21:40:00.000Z',
      body: '1. CLI that turns my timetable into a phone wallpaper\n2. Deadline scraper for the college portal (feeds the Inbox)\n3. Personal API: one JSON file, endless views\n\nRule: ship tiny, ship weekly.',
      deleted: false,
      deviceId: '',
    },
    {
      id: idGen.uuid(),
      title: 'Grocery list',
      pinned: false,
      updatedAt: addDays(T, -1) + 'T18:02:00.000Z',
      createdAt: addDays(T, -1) + 'T18:02:00.000Z',
      body: 'oat milk\neggs (12)\nblack coffee beans\nbananas\npeanut butter\nbread',
      deleted: false,
      deviceId: '',
    },
    {
      id: idGen.uuid(),
      title: 'Lecture capture — OS',
      pinned: false,
      updatedAt: addDays(T, -4) + 'T16:55:00.000Z',
      createdAt: addDays(T, -4) + 'T16:55:00.000Z',
      body: 'Midterm scope: scheduling + memory.\nKey formulas: turnaround = completion - arrival;\nresponse = first run - arrival.\nAsk about the allocator extension deadline.',
      deleted: false,
      deviceId: '',
    },
  ];

  const DL = (
    title: string,
    course: string,
    due: string,
    type: Deadline['type'],
    status: Deadline['status'],
    source: Deadline['source'],
  ): Deadline => ({
    id: idGen.uuid(),
    title,
    course,
    due,
    type,
    status,
    source,
    createdAt: nowTs,
    updatedAt: nowTs,
    deleted: false,
    deviceId: '',
  });

  const deadlines: Deadline[] = [
    DL('OS Assignment 2 — Memory Allocator', 'Operating Systems', addDays(T, 3), 'assignment', 'pending', 'college-sync'),
    DL('Physics Midterm', 'Physics II', addDays(T, 9), 'exam', 'pending', 'college-sync'),
    DL('Career Fair — Registration Open', 'College Announcements', addDays(T, 2), 'announcement', 'pending', 'college-sync'),
    DL('DSA Problem Set 5', 'Algorithms', addDays(T, -1), 'assignment', 'approved', 'college-sync'),
    DL('Calc II Quiz 3', 'Calculus II', addDays(T, 1), 'exam', 'approved', 'college-sync'),
    DL('English Essay Draft', 'English Literature', addDays(T, 5), 'assignment', 'approved', 'college-sync'),
    DL('Library Book Return', 'Library', addDays(T, 12), 'announcement', 'approved', 'personal'),
    DL('Scholarship Form', 'Admin Office', addDays(T, -4), 'assignment', 'done', 'personal'),
  ];

  const dayStats: Record<string, DayStats> = {};
  const hist = [
    [-13, 5, 4, 3, 75],
    [-12, 5, 5, 4, 100],
    [-11, 4, 2, 1, 25],
    [-10, 5, 4, 2, 50],
    [-9, 5, 5, 3, 100],
    [-8, 5, 3, 1, 0],
    [-7, 4, 4, 3, 125],
    [-6, 5, 5, 4, 75],
    [-5, 5, 4, 2, 50],
    [-4, 5, 3, 1, 25],
    [-3, 5, 5, 2, 100],
    [-2, 5, 4, 3, 75],
    [-1, 5, 5, 4, 100],
  ] as const;

  hist.forEach(([back, tot, done, tdone, focus]) => {
    const iso = addDays(T, back);
    dayStats[iso] = {
      date: iso,
      blocksTotal: tot,
      blocksDone: done,
      tasksDone: tdone,
      focusMinutes: focus,
      updatedAt: nowTs,
    };
  });

  const s = defaultState();
  s.blocks = blocks;
  s.tasks = tasks;
  s.notes = notes;
  s.deadlines = deadlines;
  s.dayStats = dayStats;
  s.settings.seeded = true;
  if (existingTheme) {
    s.settings.theme = existingTheme;
  }
  return s;
}
