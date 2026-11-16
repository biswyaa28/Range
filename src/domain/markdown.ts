export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] };

export interface MarkdownListItem {
  checked: boolean | null;
  children: InlineNode[];
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'code'; language: string; text: string };

/** Only explicit web and mail links are safe to render as links. */
export function safeExternalUrl(raw: string): string | null {
  const value = raw.trim();
  const hasControl = [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!value || /\s/.test(value) || hasControl) return null;
  if (!/^(https?:\/\/[^\s/]+(?:\/[^\s]*)?|mailto:[^\s]+)$/i.test(value)) return null;
  return value;
}

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[([^\]\n]+)\]\(([^)\s]+)\))/;

export function parseInline(source: string): InlineNode[] {
  const out: InlineNode[] = [];
  let rest = source;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: 'text', text: rest.slice(0, match.index) });
    const token = match[0];
    if (token.startsWith('`')) {
      out.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      out.push({ type: 'strong', children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith('*') || token.startsWith('_')) {
      out.push({ type: 'em', children: parseInline(token.slice(1, -1)) });
    } else {
      const label = match[6] ?? '';
      const href = safeExternalUrl(match[7] ?? '');
      if (href) {
        out.push({ type: 'link', href, children: parseInline(label) });
      } else {
        out.push({ type: 'text', text: token });
      }
    }
    rest = rest.slice(match.index + token.length);
  }
  return out;
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const CHECK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const LIST = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const FENCE = /^\s*```([\w-]*)\s*$/;

/**
 * Parses the supported Markdown subset into data. Raw HTML is never
 * interpreted: angle brackets stay text and the renderer escapes them.
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const language = fence[1] ?? '';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language, text: code.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '#').length as 1 | 2 | 3,
        children: parseInline(heading[2] ?? ''),
      });
      index += 1;
      continue;
    }

    const check = CHECK.exec(line);
    if (check) {
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const item = CHECK.exec(lines[index] ?? '');
        if (!item) break;
        items.push({
          checked: (item[1] ?? '').toLowerCase() === 'x',
          children: parseInline(item[2] ?? ''),
        });
        index += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    const list = LIST.exec(line);
    if (list) {
      const ordered = Boolean(list[2]);
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const item = LIST.exec(lines[index] ?? '');
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push({ checked: null, children: parseInline(item[3] ?? '') });
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (
        !next.trim() ||
        FENCE.test(next) ||
        HEADING.test(next) ||
        CHECK.test(next) ||
        LIST.test(next)
      ) {
        break;
      }
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

/** A single file contains every note, separated by a horizontal rule. */
export function notesToMarkdown(
  notes: ReadonlyArray<{ title: string; body: string }>,
  dateISO: string,
): string {
  const parts = [`# Notes export (${dateISO})`, ''];
  notes.forEach((note, index) => {
    if (index > 0) parts.push('---', '');
    parts.push(`## ${note.title.trim() || 'Untitled'}`, '', note.body.trim(), '');
  });
  return parts.join('\n').trimEnd() + '\n';
}

export function noteToMarkdown(note: { title: string; body: string }): string {
  const title = note.title.trim() || 'Untitled';
  return `# ${title}\n\n${note.body.trim()}\n`;
}

export function noteExportName(title: string, id: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || `note-${id}`}.md`;
}
