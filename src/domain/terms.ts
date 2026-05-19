import type { DegreeTerm, TermId, TermSeason } from "./types";

export const seasonOrder: TermSeason[] = ["spring", "summer", "fall"];

export function makeTermId(year: number, season: TermSeason): TermId {
  return `${year}-${season}`;
}

export function parseTermId(termId: TermId): { year: number; season: TermSeason } {
  const [year, season] = termId.split("-") as [string, TermSeason];
  return { year: Number(year), season };
}

export function compareTermIds(a: TermId, b: TermId): number {
  const left = parseTermId(a);
  const right = parseTermId(b);
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  return seasonOrder.indexOf(left.season) - seasonOrder.indexOf(right.season);
}

export function nextTermId(termId: TermId): TermId {
  const { year, season } = parseTermId(termId);
  const index = seasonOrder.indexOf(season);
  if (index === seasonOrder.length - 1) {
    return makeTermId(year + 1, seasonOrder[0]);
  }

  return makeTermId(year, seasonOrder[index + 1]);
}

export function termLabel(termId: TermId): string {
  const { year, season } = parseTermId(termId);
  return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}

export function createTerms(startYear: number, countYears: number) {
  return Array.from({ length: countYears }).flatMap((_, yearOffset) => {
    const year = startYear + yearOffset;
    return seasonOrder.map((season) => ({ year, season, id: makeTermId(year, season) }));
  });
}

export interface PlanningRangeSettings {
  currentYear: number;
  currentSeason: TermSeason;
  rangeStartYear: number;
  rangeEndYear: number;
}

export interface ReconciledPlanningRange {
  settings: PlanningRangeSettings;
  terms: DegreeTerm[];
  selectedTermId: TermId;
}

export function clampYearToRange(year: number, currentYear: number): number {
  const safeCurrentYear = Number.isFinite(currentYear) ? Math.trunc(currentYear) : new Date().getFullYear();
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : safeCurrentYear;
  return Math.min(safeCurrentYear + 10, Math.max(safeCurrentYear - 10, safeYear));
}

export function normalizePlanningRange(settings: PlanningRangeSettings): PlanningRangeSettings {
  const currentYear = Number.isFinite(settings.currentYear)
    ? Math.trunc(settings.currentYear)
    : new Date().getFullYear();
  const rangeStartYear = clampYearToRange(settings.rangeStartYear, currentYear);
  const rangeEndYear = clampYearToRange(settings.rangeEndYear, currentYear);
  const start = Math.min(rangeStartYear, rangeEndYear);
  const end = Math.max(rangeStartYear, rangeEndYear);

  return {
    currentYear,
    currentSeason: settings.currentSeason,
    rangeStartYear: start,
    rangeEndYear: end
  };
}

export function createBlankDegreeTerm(year: number, season: TermSeason): DegreeTerm {
  return {
    id: makeTermId(year, season),
    year,
    season,
    termType: "study",
    plannedCourseIds: [],
    maxUnits: season === "summer" ? 9 : 12,
    preferredCourseCount: season === "summer" ? 2 : 4,
    allowCoursesDuringBlockedTerm: false
  };
}

export function reconcilePlanningRange(
  terms: DegreeTerm[],
  selectedTermId: TermId,
  settings: PlanningRangeSettings
): ReconciledPlanningRange {
  const normalized = normalizePlanningRange(settings);
  const requiredIds = new Set<TermId>();
  for (let year = normalized.rangeStartYear; year <= normalized.rangeEndYear; year += 1) {
    seasonOrder.forEach((season) => requiredIds.add(makeTermId(year, season)));
  }

  const byId = new Map<TermId, DegreeTerm>();
  terms.forEach((term) => {
    if (requiredIds.has(term.id) || term.plannedCourseIds.length > 0) {
      byId.set(term.id, term);
    }
  });

  requiredIds.forEach((termId) => {
    if (!byId.has(termId)) {
      const { year, season } = parseTermId(termId);
      byId.set(termId, createBlankDegreeTerm(year, season));
    }
  });

  const reconciledTerms = [...byId.values()].sort((left, right) => compareTermIds(left.id, right.id));
  const selectedTermStillExists = byId.has(selectedTermId);
  const currentTermId = makeTermId(normalized.currentYear, normalized.currentSeason);
  const selectedTerm =
    selectedTermStillExists
      ? selectedTermId
      : byId.has(currentTermId)
        ? currentTermId
        : reconciledTerms[0]?.id ?? currentTermId;

  return {
    settings: normalized,
    terms: reconciledTerms,
    selectedTermId: selectedTerm
  };
}
