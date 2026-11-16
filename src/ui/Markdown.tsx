import React from 'react';
import { parseMarkdown, type InlineNode, type MarkdownBlock } from '@/domain/markdown';
import { openExternal } from '@/platform/openExternal';

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'text') return <React.Fragment key={index}>{node.text}</React.Fragment>;
        if (node.type === 'code') return <code key={index}>{node.text}</code>;
        if (node.type === 'strong') {
          return (
            <strong key={index}>
              <Inline nodes={node.children} />
            </strong>
          );
        }
        if (node.type === 'em') {
          return (
            <em key={index}>
              <Inline nodes={node.children} />
            </em>
          );
        }
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault();
              void openExternal(node.href);
            }}
          >
            <Inline nodes={node.children} />
          </a>
        );
      })}
    </>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.type === 'heading') {
    if (block.level === 1) {
      return (
        <h1>
          <Inline nodes={block.children} />
        </h1>
      );
    }
    if (block.level === 2) {
      return (
        <h2>
          <Inline nodes={block.children} />
        </h2>
      );
    }
    return (
      <h3>
        <Inline nodes={block.children} />
      </h3>
    );
  }
  if (block.type === 'code') {
    return (
      <pre>
        <code data-language={block.language || undefined}>{block.text}</code>
      </pre>
    );
  }
  if (block.type === 'list') {
    const items = block.items.map((item, index) => (
      <li key={index} className={item.checked === null ? undefined : 'md-check'}>
        {item.checked === null ? null : (
          <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} />
        )}
        <Inline nodes={item.children} />
      </li>
    ));
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return (
    <p>
      <Inline nodes={block.children} />
    </p>
  );
}

/** Read-only, HTML-free preview for note Markdown. */
export const Markdown: React.FC<{ source: string; className?: string }> = ({
  source,
  className,
}) => (
  <div className={`md-preview${className ? ` ${className}` : ''}`}>
    {parseMarkdown(source).map((block, index) => (
      <Block key={index} block={block} />
    ))}
  </div>
);
