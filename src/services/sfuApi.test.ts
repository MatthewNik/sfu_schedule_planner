import { describe, expect, it } from "vitest";
import { courseFromOutline, sectionFromOutline } from "./sfuApi";

describe("SFU API normalization", () => {
  const outline = {
    info: {
      dept: "CMPT",
      number: "354",
      title: "Database Systems I",
      units: "3",
      description: "Logical representations of data records.",
      prerequisites: "CMPT 225 and MACM 101.",
      corequisites: "",
      section: "D100",
      designation: "N/A"
    },
    instructor: [
      {
        name: "Ouldooz Baghban Karimi",
        roleCode: "PI",
        email: "oba2@sfu.ca",
        profileUrl: "https://www.sfu.ca/example"
      }
    ],
    courseSchedule: [
      {
        campus: "Surrey",
        days: "Mo",
        sectionCode: "LEC",
        startTime: "10:30",
        endTime: "12:20",
        isExam: false
      }
    ]
  };

  it("normalizes course fields from the nested SFU info object", () => {
    expect(courseFromOutline(outline, "cmpt", "354", "2026-summer", "2026-05-19T00:00:00.000Z")).toMatchObject({
      id: "CMPT 354",
      title: "Database Systems I",
      units: 3,
      description: "Logical representations of data records.",
      prerequisitesText: "CMPT 225 and MACM 101.",
      source: "sfu",
      historicalOfferings: ["2026-summer"],
      lastFetchedAt: "2026-05-19T00:00:00.000Z"
    });
  });

  it("normalizes instructors, meetings, campus, and section metadata", () => {
    expect(
      sectionFromOutline(
        outline,
        2026,
        "summer",
        "cmpt",
        "354",
        { value: "d100", title: "Database Systems I", classType: "e", sectionCode: "LEC" },
        "2026-05-19T00:00:00.000Z"
      )
    ).toMatchObject({
      id: "CMPT 354-2026-summer-D100",
      courseId: "CMPT 354",
      label: "D100",
      instructors: [
        {
          name: "Ouldooz Baghban Karimi",
          roleCode: "PI",
          email: "oba2@sfu.ca",
          profileUrl: "https://www.sfu.ca/example"
        }
      ],
      meetings: [
        {
          days: ["MO"],
          startTime: "10:30",
          endTime: "12:20",
          campus: "Surrey",
          sectionCode: "LEC"
        }
      ],
      lastFetchedAt: "2026-05-19T00:00:00.000Z"
    });
  });
});
