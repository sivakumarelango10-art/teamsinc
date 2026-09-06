import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import {
  parseMarkdownBlocks,
  tokenizeInline
} from '../../utils/markdownParser';

/**
 * Render inline tokens safely into React nodes
 */
export const renderInlineTokens = (text, keyPrefix = 'inline') => {
  const tokens = tokenizeInline(text);

  return tokens.map((t, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (t.type) {
      case 'bold':
        return (
          <strong key={key} className="font-bold text-white tracking-wide">
            {t.text}
          </strong>
        );
      case 'italic':
        return (
          <em key={key} className="italic text-neutral-200">
            {t.text}
          </em>
        );
      case 'bold_italic':
        return (
          <strong key={key} className="font-bold text-white">
            <em className="italic">{t.text}</em>
          </strong>
        );
      case 'code':
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 mx-0.5 rounded bg-neutral-800 text-purple-300 font-mono text-[11px] border border-neutral-700/60"
          >
            {t.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={key}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 underline font-medium inline-flex items-center gap-0.5"
          >
            <span>{t.text}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
        );
      case 'strikethrough':
        return (
          <del key={key} className="line-through text-neutral-500">
            {t.text}
          </del>
        );
      case 'text':
      default:
        return <React.Fragment key={key}>{t.text}</React.Fragment>;
    }
  });
};

/**
 * Fenced Code Block with Copy Button
 */
const CodeBlock = ({ code, language = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2.5 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900 border-b border-neutral-800 text-[10px] text-neutral-400 font-mono">
        <span>{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition cursor-pointer text-neutral-400"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-neutral-200 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Markdown Table Component
 * Formats Markdown tables (| Col 1 | Col 2 |) with responsive scrolling,
 * clean headers, column alignment, and cell markdown parsing.
 */
const MarkdownTable = ({ headers = [], alignments = [], rows = [] }) => {
  if (!headers.length) return null;

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-neutral-750 bg-neutral-900/90 shadow-sm max-w-full">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-neutral-800/90 text-white font-bold border-b border-neutral-700">
          <tr>
            {headers.map((h, i) => {
              const align = alignments[i] || 'left';
              return (
                <th
                  key={i}
                  className={`px-3 py-2.5 text-[11px] font-semibold text-neutral-100 tracking-wide border-r border-neutral-750 last:border-r-0 ${
                    align === 'center'
                      ? 'text-center'
                      : align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  }`}
                >
                  {renderInlineTokens(h, `th-${i}`)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800 text-neutral-200">
          {rows.map((cells, rIdx) => (
            <tr
              key={rIdx}
              className="hover:bg-neutral-800/40 transition-colors odd:bg-transparent even:bg-neutral-900/40"
            >
              {headers.map((_, cIdx) => {
                const cellContent = cells[cIdx] !== undefined ? cells[cIdx] : '';
                const align = alignments[cIdx] || 'left';
                return (
                  <td
                    key={cIdx}
                    className={`px-3 py-2 text-xs border-r border-neutral-800 last:border-r-0 leading-relaxed ${
                      align === 'center'
                        ? 'text-center'
                        : align === 'right'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {renderInlineTokens(cellContent, `td-${rIdx}-${cIdx}`)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Main MarkdownRenderer Component
 */
export const MarkdownRenderer = ({ content, className = '' }) => {
  if (!content || typeof content !== 'string') return null;

  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={idx} code={block.code} language={block.language} />;

          case 'table':
            return (
              <MarkdownTable
                key={idx}
                headers={block.headers}
                alignments={block.alignments}
                rows={block.rows}
              />
            );

          case 'heading': {
            const headingContent = renderInlineTokens(block.text, `h-${idx}`);
            if (block.level === 1) {
              return (
                <h1 key={idx} className="text-base sm:text-lg font-bold text-white mt-3 mb-1">
                  {headingContent}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2 key={idx} className="text-sm sm:text-base font-bold text-white mt-2.5 mb-1">
                  {headingContent}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3 key={idx} className="text-xs sm:text-sm font-semibold text-purple-300 mt-2 mb-0.5">
                  {headingContent}
                </h3>
              );
            }
            return (
              <h4 key={idx} className="text-xs font-semibold text-neutral-200 mt-1.5 mb-0.5">
                {headingContent}
              </h4>
            );
          }

          case 'hr':
            return <hr key={idx} className="border-neutral-800 my-2.5" />;

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-purple-500 bg-purple-950/20 pl-3 py-1.5 my-2 rounded-r text-neutral-300 italic text-xs leading-relaxed"
              >
                {renderInlineTokens(block.text, `quote-${idx}`)}
              </blockquote>
            );

          case 'unordered_list':
            return (
              <ul key={idx} className="space-y-1 my-1.5 pl-1 text-xs">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 text-neutral-200 leading-relaxed">
                    <span className="text-purple-400 font-bold select-none mt-0.5 text-xs">•</span>
                    <div className="flex-1">{renderInlineTokens(item, `ul-${idx}-${itemIdx}`)}</div>
                  </li>
                ))}
              </ul>
            );

          case 'ordered_list':
            return (
              <ol key={idx} className="space-y-1 my-1.5 pl-1 text-xs list-decimal list-inside text-neutral-200 leading-relaxed">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    <span>{renderInlineTokens(item, `ol-${idx}-${itemIdx}`)}</span>
                  </li>
                ))}
              </ol>
            );

          case 'paragraph':
          default:
            return (
              <div key={idx} className="text-neutral-200 text-xs leading-relaxed">
                {block.lines.map((pLine, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {renderInlineTokens(pLine, `p-${idx}-${lIdx}`)}
                    {lIdx < block.lines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
};

export default MarkdownRenderer;
