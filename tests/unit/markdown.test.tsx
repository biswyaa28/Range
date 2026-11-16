import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  noteExportName,
  noteToMarkdown,
  notesToMarkdown,
  parseMarkdown,
  safeExternalUrl,
} from '@/domain/markdown';
import { Markdown } from '@/ui/Markdown';

describe('markdown parser', () => {
  it('parses headings, emphasis, code, lists and checklists', () => {
    const blocks = parseMarkdown(
      '# Title\n\nSome **bold** and *soft* and `code`.\n\n- [x] done\n- [ ] open\n\n1. first\n2. second\n\n```ts\nconst x = 1;\n```',
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'code',
    ]);
    const check = blocks[2];
    expect(check?.type === 'list' && check.items[0]?.checked).toBe(true);
    const ordered = blocks[3];
    expect(ordered?.type === 'list' && ordered.ordered).toBe(true);
    const code = blocks[4];
    expect(code?.type === 'code' && code.text).toBe('const x = 1;');
  });

  it('only accepts http, https and mailto links', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeExternalUrl('mailto:me@example.com')).toMatch(/^mailto:/);
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(safeExternalUrl('//evil.example')).toBeNull();
    expect(safeExternalUrl('java\nscript:alert(1)')).toBeNull();
  });

  it('renders text instead of raw HTML and drops unsafe links', () => {
    const { container } = render(
      <Markdown source={'<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain('[click](javascript:alert(1))');
  });

  it('renders safe links with noopener and noreferrer', () => {
    const { getByRole } = render(<Markdown source={'[site](https://example.com)'} />);
    const link = getByRole('link', { name: 'site' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('builds per-note and all-note exports', () => {
    expect(noteToMarkdown({ title: 'Physics', body: 'Notes' })).toBe('# Physics\n\nNotes\n');
    expect(notesToMarkdown([{ title: 'A', body: 'one' }], '2026-11-16')).toContain(
      '# Notes export (2026-11-16)',
    );
    expect(noteExportName('Lab: chapter 4', 'id')).toBe('lab-chapter-4.md');
    expect(noteExportName('', 'id')).toBe('note-id.md');
  });
});
