import { describe, expect, it } from "vitest";
import {
  createBlankDegreeTerm,
  makeTermId,
  reconcilePlanningRange
} from "./terms";
import type { DegreeTerm } from "./types";

function term(year: number, season: DegreeTerm["season"], plannedCourseIds: string[] = []): DegreeTerm {
  return {
    ...createBlankDegreeTerm(year, season),
    plannedCourseIds
  };
}

describe("planning range reconciliation", () => {
  it("creates missing terms across the requested range", () => {
    const result = reconcilePlanningRange([term(2026, "fall")], "2026-fall", {
      currentYear: 2026,
      currentSeason: "fall",
      rangeStartYear: 2025,
      rangeEndYear: 2027
    });

    expect(result.terms).toHaveLength(9);
    expect(result.terms.map((candidate) => candidate.id)).toContain("2025-spring");
    expect(result.terms.map((candidate) => candidate.id)).toContain("2027-fall");
  });

  it("removes empty terms outside the requested range", () => {
    const result = reconcilePlanningRange(
      [term(2024, "fall"), term(2026, "spring"), term(2026, "summer"), term(2026, "fall")],
      "2026-fall",
      {
        currentYear: 2026,
        currentSeason: "fall",
        rangeStartYear: 2026,
        rangeEndYear: 2026
      }
    );

    expect(result.terms.map((candidate) => candidate.id)).not.toContain("2024-fall");
    expect(result.terms.map((candidate) => candidate.id)).toEqual([
      "2026-spring",
      "2026-summer",
      "2026-fall"
    ]);
  });

  it("preserves out-of-range terms that contain planned courses", () => {
    const result = reconcilePlanningRange(
      [term(2024, "fall", ["planned_1"]), term(2026, "fall")],
      "2026-fall",
      {
        currentYear: 2026,
        currentSeason: "fall",
        rangeStartYear: 2026,
        rangeEndYear: 2026
      }
    );

    expect(result.terms.find((candidate) => candidate.id === "2024-fall")?.plannedCourseIds).toEqual([
      "planned_1"
    ]);
  });

  it("clamps range years to plus or minus ten from the current year", () => {
    const result = reconcilePlanningRange([term(2026, "fall")], "2026-fall", {
      currentYear: 2026,
      currentSeason: "fall",
      rangeStartYear: 1990,
      rangeEndYear: 2050
    });

    expect(result.settings.rangeStartYear).toBe(2016);
    expect(result.settings.rangeEndYear).toBe(2036);
    expect(result.terms[0]?.id).toBe(makeTermId(2016, "spring"));
    expect(result.terms[result.terms.length - 1]?.id).toBe(makeTermId(2036, "fall"));
  });

  it("moves selection to the configured current term when the old selected term is removed", () => {
    const result = reconcilePlanningRange([term(2024, "fall"), term(2026, "fall")], "2024-fall", {
      currentYear: 2026,
      currentSeason: "fall",
      rangeStartYear: 2026,
      rangeEndYear: 2026
    });

    expect(result.selectedTermId).toBe("2026-fall");
  });
});
