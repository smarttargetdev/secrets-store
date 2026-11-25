import type { ReactNode } from 'react';

interface MarkdownRendererProps {
  content: string;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl, 'https://example.com');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[12px] text-orange-700 dark:text-orange-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900 dark:text-slate-100">
          {renderInline(token.slice(2, -2))}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <em key={keyIdx++} className="italic">
          {renderInline(token.slice(1, -1))}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        nodes.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 dark:text-orange-400 underline underline-offset-2 hover:text-orange-700 dark:hover:text-orange-300"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <div
          key={blockKey++}
          className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100"
        >
          {lang ? (
            <div className="px-3.5 py-1.5 border-b border-slate-800 text-[11px] font-mono text-slate-400">
              {lang}
            </div>
          ) : null}
          <pre className="p-3.5 overflow-x-auto font-mono text-xs leading-relaxed">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(
        <hr key={blockKey++} className="border-slate-200 dark:border-slate-800 my-2" />
      );
      i++;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1) {
        blocks.push(
          <h1 key={blockKey++} className="font-display text-2xl font-bold tracking-tight">
            {renderInline(text)}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2
            key={blockKey++}
            className="font-display text-lg font-bold tracking-tight pt-2 border-t border-slate-100 dark:border-slate-800/80"
          >
            {renderInline(text)}
          </h2>
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={blockKey++} className="font-display text-base font-semibold">
            {renderInline(text)}
          </h3>
        );
      } else {
        blocks.push(
          <h4 key={blockKey++} className="font-display text-sm font-semibold">
            {renderInline(text)}
          </h4>
        );
      }
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={blockKey++}
          className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300"
        >
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={blockKey++} className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={blockKey++} className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={blockKey++} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        {renderInline(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="space-y-4">{blocks}</div>;
}
