import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderVocabIntroHtml, type VocabWord } from './vocabIntro.ts';

describe('renderVocabIntroHtml', () => {
  it('renders a self-contained HTML file with no external script/link references', () => {
    const words: VocabWord[] = [{ word: 'caretaker', translation: 'Hausmeister' }];
    const html = renderVocabIntroHtml('New Vocabulary', words);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=/i);
    expect(html).toContain('<script>');
  });

  it('renders one row per word with its translation', () => {
    const words: VocabWord[] = [
      { word: 'caretaker', translation: 'Hausmeister' },
      { word: 'timetable', translation: 'Stundenplan' },
    ];
    const html = renderVocabIntroHtml('New Vocabulary', words);
    expect(html).toContain('caretaker');
    expect(html).toContain('Hausmeister');
    expect(html).toContain('timetable');
    expect(html).toContain('Stundenplan');
    expect(html).toContain('data-word="caretaker"');
    expect(html).toContain('data-word="timetable"');
  });

  it('renders a "no new vocabulary" note, not a crash, for an empty list', () => {
    const html = renderVocabIntroHtml('New Vocabulary', []);
    expect(html).toContain('No new vocabulary for this lesson.');
    expect(html).not.toContain('data-word=');
  });

  it('escapes HTML in word and translation', () => {
    const html = renderVocabIntroHtml('XSS check', [
      { word: '<script>alert(1)</script>', translation: '<b>bold</b>' },
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('disables the read-aloud button when speechSynthesis is unsupported', () => {
    const html = renderVocabIntroHtml('New Vocabulary', [{ word: 'caretaker', translation: 'Hausmeister' }]);
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const btn = dom.window.document.querySelector('button.speak') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('speaks the word via window.speechSynthesis when supported', () => {
    const html = renderVocabIntroHtml('New Vocabulary', [{ word: 'caretaker', translation: 'Hausmeister' }]);
    const speak = vi.fn();
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        (window as unknown as { speechSynthesis: { speak: typeof speak } }).speechSynthesis = { speak };
        (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (
          this: { text: string },
          text: string,
        ) {
          this.text = text;
        };
      },
    });
    const btn = dom.window.document.querySelector('button.speak') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]![0]).toMatchObject({ text: 'caretaker' });
  });
});
