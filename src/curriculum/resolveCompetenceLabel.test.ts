import { describe, it, expect } from "vitest";
import type { GradeBand, Source, UsedIn } from "../schema/types.ts";
import { resolveCompetenceLabel, resolveCompetenceLabels } from "./resolveCompetenceLabel.ts";

const SOURCE: Source = { doc: "fixture", location: "l1" };
const USED_IN: UsedIn[] = ["module_construction"];

function fixtureBand(): GradeBand {
  return {
    id: "fixture-band",
    grades: [7, 8],
    cefr_target: "A2",
    competence_areas: {
      funktional_kommunikativ: {
        kommunikativ: [
          {
            id: "fk.k.hoer.1",
            skill_area: "listening",
            statement: "understands short spoken texts",
            mode: ["understand"],
            source: SOURCE,
            used_in: USED_IN,
          },
        ],
        sprachliche_mittel: {
          grammatik: [
            {
              id: "fk.g.passive",
              topic: "active and passive voice",
              mode: ["understand", "produce"],
              source: SOURCE,
              used_in: USED_IN,
            },
          ],
          wortschatz: [],
          aussprache: [],
          orthografie: [],
        },
      },
      interkulturell: {
        anforderungen: [
          {
            id: "fk.ik.1",
            skill_area: "intercultural",
            statement: "compares everyday life across cultures",
            mode: ["understand"],
            source: SOURCE,
            used_in: USED_IN,
          },
        ],
        orientierungswissen: [
          { id: "c.social.freizeit_medien", field: "social", text: "Free time and media", source: SOURCE, used_in: USED_IN },
        ],
      },
      methodisch: [
        { id: "fk.m.1", text: "uses a bilingual dictionary", source: SOURCE, used_in: USED_IN },
      ],
    },
    content_fields: [],
    text_types: { receptive: [], productive: [] },
  };
}

describe("resolveCompetenceLabel", () => {
  it("resolves a grammar id via its 'topic' field", () => {
    expect(resolveCompetenceLabel("fk.g.passive", fixtureBand())).toBe("active and passive voice");
  });

  it("resolves a communicative competence id via its 'statement' field", () => {
    expect(resolveCompetenceLabel("fk.k.hoer.1", fixtureBand())).toBe("understands short spoken texts");
  });

  it("resolves an intercultural requirement id via its 'statement' field", () => {
    expect(resolveCompetenceLabel("fk.ik.1", fixtureBand())).toBe("compares everyday life across cultures");
  });

  it("resolves an orientierungswissen content-field id via its 'text' field", () => {
    expect(resolveCompetenceLabel("c.social.freizeit_medien", fixtureBand())).toBe("Free time and media");
  });

  it("resolves a methodisch hint-method id via its 'text' field", () => {
    expect(resolveCompetenceLabel("fk.m.1", fixtureBand())).toBe("uses a bilingual dictionary");
  });

  it("falls back to the raw id when nothing matches, rather than throwing", () => {
    expect(resolveCompetenceLabel("fk.g.nonexistent", fixtureBand())).toBe("fk.g.nonexistent");
  });
});

describe("resolveCompetenceLabels", () => {
  it("resolves every id against the band matching the given curriculum ref", () => {
    const bandsById = new Map([["sa-sek-en-2019.7-8.rs", fixtureBand()]]);
    expect(
      resolveCompetenceLabels(["fk.g.passive", "fk.k.hoer.1"], "sa-sek-en-2019.7-8.rs", bandsById),
    ).toEqual(["active and passive voice", "understands short spoken texts"]);
  });

  it("falls back to the raw ids unresolved when the curriculum ref matches no loaded band", () => {
    const bandsById = new Map([["sa-sek-en-2019.7-8.rs", fixtureBand()]]);
    expect(resolveCompetenceLabels(["fk.g.passive"], "unknown-ref", bandsById)).toEqual(["fk.g.passive"]);
  });
});
