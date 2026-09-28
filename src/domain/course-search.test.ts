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
    id: "MSE 402",
    subject: "MSE",
    number: "402",
    title: "Engineering Ethics",
    units: 3,
    source: "seed",
    historicalOfferings: ["2027-spring"]
  },
  {
    id: "MSE 410",
    subject: "MSE",
    number: "410",
    title: "Failure Analysis",
    units: 3,
    source: "seed",
    historicalOfferings: ["2026-fall"]
  },
  {
    id: "MSE 413",
    subject: "MSE",
    number: "413",
    title: "Machine Learning In Mechatronics",
    units: 3,
    source: "seed",
    historicalOfferings: ["2026-fall", "2027-spring"]
  },
  {
    id: "CMPT 225",
    subject: "CMPT",
    number: "225",
    title: "Data Structures And Programming",
    units: 3,
    source: "seed",
    historicalOfferings: ["2026-fall"]
  },
  {
    id: "CMPT 405",
    subject: "CMPT",
    number: "405",
    title: "Design And Analysis Of Computing Algorithms",
    units: 3,
    source: "seed",
    historicalOfferings: ["2027-spring"]
  },
  {
    id: "MATH 232",
    subject: "MATH",
    number: "232",
    title: "Applied Linear Algebra",
    units: 3,
    source: "seed",
    historicalOfferings: ["2027-spring"]
  },
  {
    id: "ENSC 351",
    subject: "ENSC",
    number: "351",
    title: "Embedded And Real Time System Software",
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
    expect(parseCourseSearchQuery("4")).toMatchObject({ subject: undefined, numberPrefix: "4" });
    expect(parseCourseSearchQuery("105W")).toMatchObject({ subject: undefined, numberPrefix: "105W" });
    expect(parseCourseSearchQuery("ca 149")).toMatchObject({ subject: "CA", numberPrefix: "149" });
  });

  it("finds subject and number-prefix matches", () => {
    expect(findMatchingCourses("MSE 3", courses).map((result) => result.course.id)).toEqual(["MSE 312"]);
    expect(findMatchingCourses("CMPT 22", courses).map((result) => result.course.id)).toEqual(["CMPT 225"]);
    expect(findMatchingCourses("MSE 4", courses).map((result) => result.course.id)).toEqual([
      "MSE 402",
      "MSE 410",
      "MSE 413"
    ]);
    expect(findMatchingCourses("4", courses).map((result) => result.course.id)).toEqual([
      "CMPT 405",
      "MSE 402",
      "MSE 410",
      "MSE 413"
    ]);
  });

  it("limits prefix matches to a published semester", () => {
    const spring2027 = {
      ...parseCourseSearchQuery("MSE 4"),
      offeredIn: "2027-spring" as const
    };

    expect(findMatchingCourses(spring2027, courses).map((result) => result.course.id)).toEqual([
      "MSE 402",
      "MSE 413"
    ]);
    expect(
      findMatchingCourses({ ...parseCourseSearchQuery("4"), offeredIn: "2027-spring" }, courses).map(
        (result) => result.course.id
      )
    ).toEqual(["CMPT 405", "MSE 402", "MSE 413"]);
    expect(
      findMatchingCourses({ ...parseCourseSearchQuery("cmpt"), offeredIn: "2027-spring" }, courses).map(
        (result) => result.course.id
      )
    ).toEqual(["CMPT 405"]);
    expect(
      findMatchingCourses({ ...parseCourseSearchQuery("math 2"), offeredIn: "2027-spring" }, courses).map(
        (result) => result.course.id
      )
    ).toEqual(["MATH 232"]);
    expect(
      findMatchingCourses({ ...parseCourseSearchQuery("ensc"), offeredIn: "2027-spring" }, courses).map(
        (result) => result.course.id
      )
    ).toEqual([]);
    expect(findMatchingCourses("MSE 4", courses).map((result) => result.course.id)).toEqual([
      "MSE 402",
      "MSE 410",
      "MSE 413"
    ]);
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
