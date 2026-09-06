import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  tokenizeInline,
  parseMarkdownBlocks,
  isTableSeparatorLine,
  splitTableCells,
  parseTableAlignments
} from '../src/utils/markdownParser.js';

describe('Markdown & Table Parser Unit & Regression Tests', () => {
  describe('1. Bold, Italic & Inline Formatting', () => {
    it('Tokenizes bold text correctly without displaying raw asterisks', () => {
      const input = 'Hello **Elango S**! I am your **TeamSync AI Copilot**.';
      const tokens = tokenizeInline(input);

      const boldTokens = tokens.filter(t => t.type === 'bold');
      assert.strictEqual(boldTokens.length, 2);
      assert.strictEqual(boldTokens[0].text, 'Elango S');
      assert.strictEqual(boldTokens[1].text, 'TeamSync AI Copilot');
    });

    it('Tokenizes italic, code, and links correctly', () => {
      const input = 'Check *this* `npm run dev` and [TeamSync](https://teamsync.io)';
      const tokens = tokenizeInline(input);

      assert.ok(tokens.some(t => t.type === 'italic' && t.text === 'this'));
      assert.ok(tokens.some(t => t.type === 'code' && t.text === 'npm run dev'));
      assert.ok(tokens.some(t => t.type === 'link' && t.text === 'TeamSync' && t.href === 'https://teamsync.io'));
    });
  });

  describe('2. Markdown Table Detection & Structured Output', () => {
    it('Validates table separator lines and column alignment', () => {
      const sep = '| :--- |:---:| ---:|';
      assert.strictEqual(isTableSeparatorLine(sep), true);

      const alignments = parseTableAlignments(sep);
      assert.deepStrictEqual(alignments, ['left', 'center', 'right']);
    });

    it('Parses markdown table blocks into headers, alignments, and rows', () => {
      const markdown = `
Here is the operational report:

| Department | Headcount | Assigned Tasks | Velocity |
| :--- | :---: | :---: | ---: |
| Engineering | 8 | 24 | 92% |
| Product | 4 | 9 | 88% |

Summary completed.
`;

      const blocks = parseMarkdownBlocks(markdown);

      const tableBlock = blocks.find(b => b.type === 'table');
      assert.ok(tableBlock, 'Must parse table block');
      assert.deepStrictEqual(tableBlock.headers, ['Department', 'Headcount', 'Assigned Tasks', 'Velocity']);
      assert.deepStrictEqual(tableBlock.alignments, ['left', 'center', 'center', 'right']);
      assert.strictEqual(tableBlock.rows.length, 2);
      assert.deepStrictEqual(tableBlock.rows[0], ['Engineering', '8', '24', '92%']);
      assert.deepStrictEqual(tableBlock.rows[1], ['Product', '4', '9', '88%']);
    });
  });

  describe('3. Lists, Headers & Code Blocks', () => {
    it('Parses headings, code blocks and lists', () => {
      const markdown = `
# Executive Briefing
\`\`\`bash
npm run test
\`\`\`
- Task 1
- Task 2
`;
      const blocks = parseMarkdownBlocks(markdown);
      assert.strictEqual(blocks[0].type, 'heading');
      assert.strictEqual(blocks[0].level, 1);
      assert.strictEqual(blocks[0].text, 'Executive Briefing');

      assert.strictEqual(blocks[1].type, 'code');
      assert.strictEqual(blocks[1].language, 'bash');
      assert.strictEqual(blocks[1].code, 'npm run test');

      assert.strictEqual(blocks[2].type, 'unordered_list');
      assert.strictEqual(blocks[2].items.length, 2);
    });
  });
});
