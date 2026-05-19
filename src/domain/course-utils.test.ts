import { describe, expect, it } from "vitest";
import { extractCourseCodes, getAvailabilityConfidence, hasTimeOverlap } from "./course-utils";
import type { Course } from "./types";

describe("course utilities", () => {
  it("extracts course codes from raw prerequisite text", () => {
    expect(extractCourseCodes("Prerequisite: CMPT 125 and MACM101; MATH 152 recommended.")).toEqual([
      "CMPT 125",
      "MACM 101",
      "MATH 152"
    ]);
  });

  it("classifies availability confidence from historical offerings", () => {
    const course: Course = {
      id: "CMPT 354",
      subject: "CMPT",
      number: "354",
      title: "Database Systems I",
      units: 3,
      source: "seed",
      historicalOfferings: ["2024-summer", "2025-summer", "2026-summer"]
    };

    expect(getAvailabilityConfidence(course, "2026-summer")).toBe("confirmed");
    expect(getAvailabilityConfidence(course, "2027-summer")).toBe("likely");
    expect(getAvailabilityConfidence(course, "2027-fall")).toBe("unknown");
  });

  it("detects real overlaps without flagging touching boundaries", () => {
    expect(hasTimeOverlap("10:30", "12:20", "11:30", "13:20")).toBe(true);
    expect(hasTimeOverlap("10:30", "12:20", "12:20", "13:20")).toBe(false);
  });
});
