import { describe, it, expect } from 'vitest';
import { parseYaml, stringifyYaml, YamlLoadError } from './yaml.ts';
import type { GradeBand, Module } from './types.ts';

const bandFixture = `
id: sa-sek-en-2019.7-8.rs
grades: [7, 8]
track: realschulabschluss
cefr_target: B1
competence_areas:
  funktional_kommunikativ:
    kommunikativ:
      - id: fk.k.hoer.1
        skill_area: listening
        statement: "einfache und komplexere Äußerungen verstehen"
        mode: [understand]
        source: { doc: lehrplan-2019, location: "l149" }
        used_in: [module_construction]
    sprachliche_mittel:
      grammatik:
        - id: fk.g.passive
          topic: "active and passive voice"
          mode: [understand, produce]
          source: { doc: lehrplan-2019, location: "l160" }
          used_in: [module_construction]
      wortschatz: []
      aussprache: []
      orthografie: []
  interkulturell:
    anforderungen: []
    orientierungswissen: []
  methodisch: []
content_fields:
  - id: c.social.freizeit
    field: soziales_umfeld
    text: "Freizeit, Schulsysteme, Kultur, Medienfunktionen"
    source: { doc: lehrplan-2019, location: "l200" }
    used_in: [module_construction]
text_types:
  receptive: [sketch, prospekt]
  productive: [blog_post, dialog]
`;

describe('GradeBand round-trip', () => {
  it('loads a §3.1 band fixture and re-stringifies without field loss', () => {
    const band = parseYaml<GradeBand>(bandFixture);
    expect(band.id).toBe('sa-sek-en-2019.7-8.rs');
    expect(band.competence_areas.funktional_kommunikativ.sprachliche_mittel.grammatik[0]?.id).toBe(
      'fk.g.passive',
    );

    const roundTripped = parseYaml<GradeBand>(stringifyYaml(band));
    expect(roundTripped).toEqual(band);
  });
});

describe('Module DRAFT time fields (KTD7)', () => {
  it('type-checks and round-trips with DRAFT sentinels', () => {
    const module: Module = {
      id: 'm1',
      title: 'Back to school / Free time',
      weeks: 'DRAFT',
      content_fields: ['c.social.freizeit'],
      goals: ['Talk about free-time activities using present perfect'],
      covers: [{ id: 'fk.g.present_perfect', required_depth: 'produce' }],
      milestone: { type: 'test', assesses: ['fk.g.present_perfect'] },
      pedagogy: { new_grammar: ['fk.g.present_perfect'] },
      draft: true,
    };

    const roundTripped = parseYaml<Module>(stringifyYaml(module));
    expect(roundTripped).toEqual(module);
    expect(roundTripped.weeks).toBe('DRAFT');
  });
});

describe('malformed YAML', () => {
  it('surfaces a clear load error, not silent undefined', () => {
    const badIndent = `
id: sa-sek-en-2019.5-6
  grades: [5, 6]
   track: bad
`;
    expect(() => parseYaml(badIndent, 'bad-fixture.yaml')).toThrow(YamlLoadError);
  });
});
