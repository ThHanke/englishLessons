export interface RawRow {
  band: string;
  area: string;
  subarea: string;
  bereich: string;
  bulletText: string;
  sourceLine: number;
}

const AREA_MAP: Record<string, string> = {
  'Funktional-kommunikative Kompetenzen': 'funktional_kommunikativ',
  'Interkulturelle Kompetenzen': 'interkulturell',
  'Methodische Kompetenzen': 'methodisch',
};

const DEFAULT_SUBAREA: Record<string, string> = {
  funktional_kommunikativ: 'kommunikative_kompetenzen',
  interkulturell: 'anforderungen',
  methodisch: 'anforderungen',
};

const SUBAREA_PREFIXES: Array<[string, string]> = [
  ['Kommunikative Kompetenzen', 'kommunikative_kompetenzen'],
  ['Kommunikative Inhalte', 'kommunikative_inhalte'],
  ['Textsorten', 'textsorten'],
  ['Verfügung über sprachliche Mittel', 'sprachliche_mittel'],
  ['Verfügung über soziokulturelles Orientierungswissen', 'orientierungswissen'],
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function headingLevel(line: string): number | null {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1]!.length : null;
}

export function extractHeadingSection(
  markdown: string,
  startPattern: RegExp,
): { text: string; startLine: number } {
  const lines = markdown.split('\n');
  let startIdx = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i]!)) {
      startIdx = i;
      level = headingLevel(lines[i]!)!;
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error(`Heading matching ${startPattern} not found`);
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const lvl = headingLevel(lines[i]!);
    if (lvl !== null && lvl <= level) {
      endIdx = i;
      break;
    }
  }
  return { text: lines.slice(startIdx + 1, endIdx).join('\n'), startLine: startIdx + 2 };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|');
}

function isSeparatorRow(line: string): boolean {
  return /^\|?[\s:-]+\|[\s:|-]*\|?\s*$/.test(line.trim());
}

function splitBullets(content: string): string[] {
  if (!/(^|<br>)\s*–/.test(content)) {
    return [content];
  }
  return content
    .split(/<br>\s*–\s*/)
    .map((s) => s.replace(/^–\s*/, '').trim())
    .filter((s) => s.length > 0);
}

function matchSubarea(label: string): string {
  for (const [prefix, slug] of SUBAREA_PREFIXES) {
    if (label.startsWith(prefix)) return slug;
  }
  return slugify(label);
}

/** Pure stage-1 mapper: raw markdown text (a single band's section) -> raw typed rows. No semantic interpretation. */
export function mapBandToRows(markdown: string, band: string, lineOffset = 0): RawRow[] {
  const lines = markdown.split('\n');
  const rows: RawRow[] = [];
  let area: string | null = null;
  let subarea: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    const boldMatch = /^\*\*Kompetenzbereich:\s*(.+?)\*\*\s*$/.exec(trimmed);
    if (boldMatch) {
      const areaLabel = boldMatch[1]!.trim();
      area = AREA_MAP[areaLabel] ?? slugify(areaLabel);
      subarea = null;
      continue;
    }

    const italicMatch = /^\*([^*]+)\*\s*(\(.*\))?\s*$/.exec(trimmed);
    if (italicMatch) {
      subarea = matchSubarea(italicMatch[1]!.trim());
      continue;
    }

    if (trimmed.startsWith('|')) {
      if (isSeparatorRow(trimmed)) continue;
      const nextLine = lines[i + 1]?.trim() ?? '';
      const isHeaderRow = isSeparatorRow(nextLine);
      if (isHeaderRow) continue;

      const cells = splitTableRow(trimmed);
      if (cells.length < 2) continue;
      const bereich = cells[0]!.trim();
      const content = cells[1]!.trim();
      if (!content) continue;

      const resolvedArea = area ?? 'unknown';
      const resolvedSubarea = subarea ?? DEFAULT_SUBAREA[resolvedArea] ?? 'unknown';

      for (const bulletText of splitBullets(content)) {
        rows.push({
          band,
          area: resolvedArea,
          subarea: resolvedSubarea,
          bereich,
          bulletText,
          sourceLine: i + 1 + lineOffset,
        });
      }
    }
  }

  return rows;
}

export function extractBand56Rows(fullMarkdown: string): RawRow[] {
  const { text, startLine } = extractHeadingSection(fullMarkdown, /^###\s+3\.1\s/);
  return mapBandToRows(text, '5-6', startLine - 1);
}

export function extractBand78RealschuleRows(fullMarkdown: string): RawRow[] {
  const { text, startLine } = extractHeadingSection(fullMarkdown, /^####\s+3\.2\.1\s/);
  return mapBandToRows(text, '7-8-realschule', startLine - 1);
}
