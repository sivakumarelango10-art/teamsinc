/**
 * Markdown & Table Parser Utilities for TeamSync
 */

export const isTableSeparatorLine = (line) => {
  if (!line || typeof line !== 'string') return false;
  const trimmed = line.trim();
  return trimmed.includes('|') && /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed);
};

export const splitTableCells = (line) => {
  if (!line || typeof line !== 'string') return [];
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((c) => c.trim());
};

export const parseTableAlignments = (alignLine) => {
  const parts = splitTableCells(alignLine);
  return parts.map((part) => {
    const trimmed = part.trim();
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
    if (trimmed.endsWith(':')) return 'right';
    return 'left';
  });
};

/**
 * Tokenize markdown string into structured blocks:
 * - code block
 * - table
 * - heading
 * - hr
 * - blockquote
 * - unordered_list
 * - ordered_list
 * - paragraph
 */
export const parseMarkdownBlocks = (content) => {
  if (!content || typeof content !== 'string') return [];

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Code Block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n')
      });
      continue;
    }

    // 2. Table
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headerLine = line;
      const alignLine = lines[i + 1];
      const headers = splitTableCells(headerLine);
      const alignments = parseTableAlignments(alignLine);
      const rows = [];
      i += 2;

      while (i < lines.length && lines[i].trim().includes('|')) {
        const rowCells = splitTableCells(lines[i]);
        if (rowCells.length > 0 && !(rowCells.length === 1 && rowCells[0] === '')) {
          rows.push(rowCells);
        }
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        alignments,
        rows
      });
      continue;
    }

    // 3. Headings
    if (/^#{1,6}\s+/.test(trimmed)) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        blocks.push({
          type: 'heading',
          level: match[1].length,
          text: match[2]
        });
        i++;
        continue;
      }
    }

    // 4. Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n')
      });
      continue;
    }

    // 6. Unordered List
    if (/^[-*+]\s+/.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'unordered_list',
        items: listItems
      });
      continue;
    }

    // 7. Ordered List
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({
        type: 'ordered_list',
        items: listItems
      });
      continue;
    }

    // 8. Empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // 9. Standard Paragraph
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(
        lines[i].trim().includes('|') &&
        i + 1 < lines.length &&
        isTableSeparatorLine(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({
      type: 'paragraph',
      lines: paraLines
    });
  }

  return blocks;
};

/**
 * Tokenize inline text into tokens:
 * - text
 * - bold
 * - italic
 * - bold_italic
 * - code
 * - link
 * - strikethrough
 */
export const tokenizeInline = (text) => {
  if (!text || typeof text !== 'string') return [];

  const tokenRegex = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;

  const rawParts = text.split(tokenRegex);
  const tokens = [];

  for (const part of rawParts) {
    if (!part) continue;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push({ type: 'code', text: part.slice(1, -1) });
    } else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        tokens.push({ type: 'link', text: match[1], href: match[2] });
      } else {
        tokens.push({ type: 'text', text: part });
      }
    } else if (/^https?:\/\/[^\s<]+$/.test(part)) {
      tokens.push({ type: 'link', text: part, href: part });
    } else if (
      (part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
      (part.startsWith('___') && part.endsWith('___') && part.length >= 6)
    ) {
      tokens.push({ type: 'bold_italic', text: part.slice(3, -3) });
    } else if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      tokens.push({ type: 'bold', text: part.slice(2, -2) });
    } else if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      tokens.push({ type: 'italic', text: part.slice(1, -1) });
    } else if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      tokens.push({ type: 'strikethrough', text: part.slice(2, -2) });
    } else {
      tokens.push({ type: 'text', text: part });
    }
  }

  return tokens;
};
