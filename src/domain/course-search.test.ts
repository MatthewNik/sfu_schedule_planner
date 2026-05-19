import { describe, expect, it } from "vitest";
import {
  extractCourseCodesFromPlainText,
  findMatchingCourses,
  getPossiblePlacements,
  parseCourseSearchQuery
} from "./course-search";
import type { Course, DegreeTerm } from "./types";

const courses: Course[] = [
  {
    id: "MSE 312",
    subject: "MSE",
    number: "312",
    title: "Materials Selection",
    units: 3,
    source: "seed",
    historicalOfferings: ["2025-fall", "2026-fall"]
  },
  {
    id: "MSE 410",
    subject: "MSE",
    number: "410",
    title: "Failure Analysis",
    units: 3,
    source: "seed",
    historicalOfferings: []
  },
  {
    id: "CMPT 225",
    subject: "CMPT",
    number: "225",
    title: "Data Structures And Programming",
    units: 3,
    source: "seed",
    historicalOfferings: ["2026-fall"]
  }
];

const terms: DegreeTerm[] = [
  {
    id: "2026-spring",
    year: 2026,
    season: "spring",
    termType: "study",
    plannedCourseIds: [],
    maxUnits: 12,
    preferredCourseCount: 4,
    allowCoursesDuringBlockedTerm: false
  },
  {
    id: "2026-fall",
    year: 2026,
    season: "fall",
    termType: "study",
    plannedCourseIds: [],
    maxUnits: 12,
    preferredCourseCount: 4,
    allowCoursesDuringBlockedTerm: false
  }
];

describe("course search helpers", () => {
  it("parses subject and number-prefix queries", () => {
    expect(parseCourseSearchQuery("MSE 3")).toMatchObject({ subject: "MSE", numberPrefix: "3" });
    expect(parseCourseSearchQuery("mse3")).toMatchObject({ subject: "MSE", numberPrefix: "3" });
    expect(parseCourseSearchQuery("CMPT 22")).toMatchObject({ subject: "CMPT", numberPrefix: "22" });
    expect(parseCourseSearchQuery("math")).toMatchObject({ subject: "MATH", numberPrefix: undefined });
  });

  it("finds subject and number-prefix matches", () => {
    expect(findMatchingCourses("MSE 3", courses).map((result) => result.course.id)).toEqual(["MSE 312"]);
    expect(findMatchingCourses("CMPT 22", courses).map((result) => result.course.id)).toEqual(["CMPT 225"]);
  });

  it("extracts course codes from messy pasted text", () => {
    expect(extractCourseCodesFromPlainText("MSE312, cmpt 225\nand MATH 152")).toEqual([
      "MSE 312",
      "CMPT 225",
      "MATH 152"
    ]);
  });

  it("returns possible placements only when confidence is known", () => {
    expect(getPossiblePlacements(courses[0], terms).map((placement) => placement.termId)).toEqual([
      "2026-fall"
    ]);
    expect(getPossiblePlacements(courses[1], terms)).toEqual([]);
  });
});
