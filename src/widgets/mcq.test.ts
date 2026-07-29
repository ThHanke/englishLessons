import { describe, it, expect } from 'vitest';
import { checkAnswer, renderMcqHtml, type McqItem } from './mcq.ts';

describe('checkAnswer', () => {
  const item: McqItem = { question: 'Pick one', options: ['a', 'b', 'c'], correctIndex: 1 };

  it('marks the correct index correct', () => {
    expect(checkAnswer(1, item)).toBe('correct');
  });

  it('marks a wrong index incorrect', () => {
    expect(checkAnswer(0, item)).toBe('incorrect');
    expect(checkAnswer(2, item)).toBe('incorrect');
  });

  it('marks null unanswered', () => {
    expect(checkAnswer(null, item)).toBe('unanswered');
  });
});

describe('renderMcqHtml', () => {
  it('renders a self-contained HTML file with no external script/link references', () => {
    const items: McqItem[] = [{ question: 'Q1', options: ['a', 'b'], correctIndex: 0 }];
    const html = renderMcqHtml('MCQ Practice', items);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('renders one radio group per question', () => {
    const items: McqItem[] = [
      { question: 'Q1', options: ['a', 'b'], correctIndex: 0 },
      { question: 'Q2', options: ['x', 'y', 'z'], correctIndex: 2 },
    ];
    const html = renderMcqHtml('MCQ Practice', items);
    expect((html.match(/name="q0"/g) ?? []).length).toBe(2);
    expect((html.match(/name="q1"/g) ?? []).length).toBe(3);
  });

  it('escapes HTML in question and option text so it renders inert, not executable', () => {
    const items: McqItem[] = [
      { question: '<script>alert(1)</script>', options: ['<b>bold</b>', 'safe'], correctIndex: 1 },
    ];
    const html = renderMcqHtml('XSS check', items);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('renders a single item without crashing', () => {
    const items: McqItem[] = [{ question: 'Only one', options: ['a'], correctIndex: 0 }];
    const html = renderMcqHtml('Single', items);
    expect(html).toContain('Only one');
    expect((html.match(/name="q0"/g) ?? []).length).toBe(1);
  });

  it('handles an empty options array without throwing, rendering a degenerate control', () => {
    const items: McqItem[] = [{ question: 'No options here', options: [], correctIndex: 0 }];
    expect(() => renderMcqHtml('Degenerate', items)).not.toThrow();
    const html = renderMcqHtml('Degenerate', items);
    expect(html).not.toMatch(/name="q0"/);
    expect(html).toContain('No options available');
  });
});
