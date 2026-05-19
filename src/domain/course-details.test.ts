import { describe, expect, it } from "vitest";
import { buildCourseDetailModel, historicalTermsFor } from "./course-details";
import { createInitialAppData } from "./fixtures";
import type { CourseSection, PlannedCourse } from "./types";

describe("course detail model", () => {
  it("prefers confirmed same-term official sections", () => {
    const data = createInitialAppData();
    const planned: PlannedCourse = {
      id: "planned-cmpt354",
      courseId: "CMPT 354",
      termId: "2026-summer",
      selectedSectionIds: []
    };
    const section: CourseSection = {
      id: "CMPT 354-2026-summer-D100",
      courseId: "CMPT 354",
      termId: "2026-summer",
      label: "D100",
      title: "Database Systems I",
      classType: "enrollment",
      instructors: [{ name: "Current Instructor" }],
      meetings: [],
      lastFetchedAt: "2026-05-19T00:00:00.000Z",
      raw: {}
    };

    const detail = buildCourseDetailModel({ ...data, sections: [section] }, planned);

    expect(detail.source).toBe("official");
    expect(detail.confirmedSections).toEqual([section]);
    expect(detail.pastInstructors).toEqual([]);
    expect(detail.lastFetchedAt).toBe("2026-05-19T00:00:00.000Z");
  });

  it("falls back to last-three-year historical instructors when current sections are unavailable", () => {
    const data = createInitialAppData();
    const planned: PlannedCourse = {
      id: "planned-cmpt354",
      courseId: "CMPT 354",
      termId: "2026-fall",
      selectedSectionIds: []
    };
    const historicalSection: CourseSection = {
      id: "CMPT 354-2025-fall-D100",
      courseId: "CMPT 354",
      termId: "2025-fall",
      label: "D100",
      title: "Database Systems I",
      classType: "enrollment",
      instructors: [{ name: "Past Instructor", email: "past@sfu.ca" }],
      meetings: [],
      lastFetchedAt: "2026-05-19T00:00:00.000Z",
      raw: {}
    };

    const detail = buildCourseDetailModel({ ...data, sections: [historicalSection] }, planned);

    expect(detail.source).toBe("fallback");
    expect(detail.confirmedSections).toEqual([]);
    expect(detail.historicalSections).toEqual([historicalSection]);
    expect(detail.pastInstructors).toEqual([
      {
        name: "Past Instructor",
        email: "past@sfu.ca",
        profileUrl: undefined,
        terms: ["2025-fall"]
      }
    ]);
  });

  it("sorts historical lookup terms with same-season terms first", () => {
    expect(historicalTermsFor("2026-fall").slice(0, 3).map((term) => term.termId)).toEqual([
      "2025-fall",
      "2024-fall",
      "2023-fall"
    ]);
  });
});
