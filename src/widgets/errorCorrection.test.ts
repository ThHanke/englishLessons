import { describe, it, expect } from 'vitest';
import { checkCorrection, renderErrorCorrectionHtml, type ErrorCorrectionItem } from './errorCorrection.ts';

describe('checkCorrection', () => {
  const item: ErrorCorrectionItem = {
    sentence: 'Yesterday went I to school.',
    correction: 'Yesterday I went to school.',
  };

  it('marks the exact correction correct', () => {
    expect(checkCorrection('Yesterday I went to school.', item)).toBe('correct');
  });

  it('is case/whitespace-insensitive', () => {
    expect(checkCorrection('  yesterday I WENT to school.  ', item)).toBe('correct');
  });

  it('marks a wrong correction incorrect', () => {
    expect(checkCorrection('Yesterday went to school.', item)).toBe('incorrect');
  });

  it('marks an empty answer unanswered', () => {
    expect(checkCorrection('', item)).toBe('unanswered');
    expect(checkCorrection('   ', item)).toBe('unanswered');
  });
});

describe('renderErrorCorrectionHtml', () => {
  it('renders a self-contained HTML file with no external script/link references', () => {
    const items: ErrorCorrectionItem[] = [
      { sentence: 'Yesterday went I to school.', correction: 'Yesterday I went to school.' },
    ];
    const html = renderErrorCorrectionHtml('Word Order Practice', items);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('renders the find/explain/correct scaffold for each item', () => {
    const items: ErrorCorrectionItem[] = [
      { sentence: 'Yesterday went I to school.', correction: 'Yesterday I went to school.' },
    ];
    const html = renderErrorCorrectionHtml('Word Order Practice', items);
    expect(html).toContain('data-find="0"');
    expect(html).toContain('data-explain="0"');
    expect(html).toContain('data-correct="0"');
    expect(html).toContain('Yesterday went I to school.');
  });

  it('shows an error-type hint when provided, omits it otherwise', () => {
    const withHint = renderErrorCorrectionHtml('Practice', [
      { sentence: 'Yesterday went I to school.', correction: 'Yesterday I went to school.', errorType: 'word order' },
    ]);
    expect(withHint).toContain('class="error-type-hint"');
    expect(withHint).toContain('word order');

    const withoutHint = renderErrorCorrectionHtml('Practice', [
      { sentence: 'Yesterday went I to school.', correction: 'Yesterday I went to school.' },
    ]);
    expect(withoutHint).not.toContain('<span class="error-type-hint">');
  });

  it('escapes HTML in sentence, correction, and errorType', () => {
    const html = renderErrorCorrectionHtml('XSS check', [
      {
        sentence: '<script>alert(1)</script>',
        correction: 'safe correction',
        errorType: '<b>bold</b>',
      },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('renders multiple items without their data attributes colliding', () => {
    const items: ErrorCorrectionItem[] = [
      { sentence: 'Yesterday went I to school.', correction: 'Yesterday I went to school.' },
      { sentence: 'Look! It rains.', correction: 'Look! It is raining.' },
    ];
    const html = renderErrorCorrectionHtml('Practice', items);
    expect(html).toContain('data-correct="0"');
    expect(html).toContain('data-correct="1"');
  });
});
