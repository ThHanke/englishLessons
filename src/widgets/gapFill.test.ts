import { describe, it, expect } from 'vitest';
import { checkBlank, checkItem, renderGapFillHtml, type GapFillItem } from './gapFill.ts';

describe('checkBlank', () => {
  it('marks a correct answer correct', () => {
    expect(checkBlank('written', { answer: 'written', position: 0 })).toBe('correct');
  });

  it('marks an incorrect answer incorrect', () => {
    expect(checkBlank('wrote', { answer: 'written', position: 0 })).toBe('incorrect');
  });

  it('is case/whitespace-insensitive', () => {
    expect(checkBlank('  Written  ', { answer: 'written', position: 0 })).toBe('correct');
  });

  it('treats an empty blank as unanswered, not a crash', () => {
    expect(checkBlank('', { answer: 'written', position: 0 })).toBe('unanswered');
    expect(checkBlank('   ', { answer: 'written', position: 0 })).toBe('unanswered');
  });
});

describe('checkItem', () => {
  it('checks every blank in a multi-blank item', () => {
    const item: GapFillItem = {
      sentence: 'The letter ___ by Tom, and the reply ___ tomorrow.',
      blanks: [
        { answer: 'was written', position: 0 },
        { answer: 'will be sent', position: 1 },
      ],
    };
    expect(checkItem(['was written', ''], item)).toEqual(['correct', 'unanswered']);
  });
});

describe('renderGapFillHtml', () => {
  it('renders a self-contained HTML file with no external script/link references', () => {
    const item: GapFillItem = { sentence: 'The room ___ every day.', blanks: [{ answer: 'is cleaned', position: 0 }] };
    const html = renderGapFillHtml('Passive Voice Practice', item);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
    expect(html).toContain('data-blank="0"');
  });
});
