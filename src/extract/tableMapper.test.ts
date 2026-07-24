import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractBand56Rows, extractBand78RealschuleRows, mapBandToRows } from './tableMapper.ts';

const fixture56 = readFileSync(
  new URL('./fixtures/band-5-6.md', import.meta.url),
  'utf-8',
);
const fixture78rs = readFileSync(
  new URL('./fixtures/band-7-8-realschule.md', import.meta.url),
  'utf-8',
);

describe('extractBand56Rows', () => {
  const rows = extractBand56Rows(fixture56);

  it('yields the expected count of bullet rows for the Grammatik cell', () => {
    const grammatikRows = rows.filter((r) => r.bereich === 'Grammatik');
    expect(grammatikRows).toHaveLength(4);
    expect(grammatikRows.every((r) => r.sourceLine > 0)).toBe(true);
    expect(grammatikRows[0]!.bulletText).toContain('Aussagen, Fragen und Aufforderungen');
  });

  it('preserves inline italics markers naming grammar terms', () => {
    const grammatikRows = rows.filter((r) => r.bereich === 'Grammatik');
    const tenseRow = grammatikRows.find((r) => r.bulletText.includes('gegenwärtig'));
    expect(tenseRow?.bulletText).toContain('*simple present*');
    expect(tenseRow?.bulletText).toContain('*simple past*');
  });

  it('stops at the next same-or-higher heading and does not bleed into 7/8', () => {
    expect(rows.some((r) => r.bulletText.includes('darf nicht in 5/6 rows'))).toBe(false);
  });

  it('produces no rows for empty/whitespace cells', () => {
    expect(rows.some((r) => r.bereich === 'Leer')).toBe(false);
  });

  it('tags every row with band 5-6 and resolved area/subarea', () => {
    expect(rows.every((r) => r.band === '5-6')).toBe(true);
    const contentFieldRow = rows.find((r) => r.bereich === 'Persönliches Umfeld');
    expect(contentFieldRow?.subarea).toBe('kommunikative_inhalte');
    expect(contentFieldRow?.bulletText).toBe('eigene Person, Familie und Freundeskreis');
  });

  it('matches the known row snapshot for the trimmed fixture', () => {
    expect(rows).toMatchSnapshot();
  });
});

describe('extractBand78RealschuleRows', () => {
  const rows = extractBand78RealschuleRows(fixture78rs);

  it('never emits rows from §3.3 Hauptschule', () => {
    expect(rows.some((r) => r.bulletText.includes('Hauptschule'))).toBe(false);
    expect(rows.every((r) => r.band === '7-8-realschule')).toBe(true);
  });

  it('splits the bundled Grammatik cell into distinct bullets', () => {
    expect(rows.filter((r) => r.bereich === 'Grammatik')).toHaveLength(7);
  });
});

describe('mapBandToRows on real Lehrplan source', () => {
  const realMarkdown = readFileSync(
    'docs/lecture_plans/sachsen-anhalt-sekundarschule-englisch-lehrplan-2019-08-01.md',
    'utf-8',
  );

  it('produces stable, non-empty row counts per area for both in-scope bands, no cross-bleed', () => {
    const rows56 = extractBand56Rows(realMarkdown);
    const rows78rs = extractBand78RealschuleRows(realMarkdown);

    expect(rows56.length).toBeGreaterThan(0);
    expect(rows78rs.length).toBeGreaterThan(0);
    for (const area of ['funktional_kommunikativ', 'interkulturell', 'methodisch']) {
      expect(rows56.filter((r) => r.area === area).length).toBeGreaterThan(0);
      expect(rows78rs.filter((r) => r.area === area).length).toBeGreaterThan(0);
    }

    expect(rows56.some((r) => r.bulletText.includes('active and passive voice'))).toBe(false);
    expect(rows78rs.some((r) => r.bulletText.includes('Hauptschule'))).toBe(false);
  });
});
