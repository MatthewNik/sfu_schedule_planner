import { describe, expect, it } from "vitest";
import { collectTermCatalogCourses, coursesFromDepartmentItems } from "./term-catalog";

describe("term catalog", () => {
  it("builds courses for any subject from SFU list items", () => {
    expect(
      coursesFromDepartmentItems(
        "cmpt",
        [
          { value: "225", title: "Data Structures and Programming" },
          { value: "376w", title: "Professional Responsibility and Technical Writing" }
        ],
        "2027-spring"
      ).map((course) => course.id)
    ).toEqual(["CMPT 225", "CMPT 376W"]);
  });

  it("loads every department and searches the typed subject first", async () => {
    const loaded: string[] = [];
    const courses = await collectTermCatalogCourses(
      [{ value: "cmpt" }, { value: "math" }, { value: "mse" }, { text: "ENSC" }],
      async (department) => {
        loaded.push(department);
        return [{ value: "410", title: `${department} topic` }];
      },
      "2027-spring",
      { prioritySubject: "math", concurrency: 1 }
    );

    expect(loaded).toEqual(["MATH", "CMPT", "MSE", "ENSC"]);
    expect(courses.map((course) => course.id)).toEqual(["MATH 410", "CMPT 410", "MSE 410", "ENSC 410"]);
    expect(courses.every((course) => course.historicalOfferings.includes("2027-spring"))).toBe(true);
  });

  it("skips a department that fails and keeps the others", async () => {
    const courses = await collectTermCatalogCourses(
      [{ value: "mse" }, { value: "cmpt" }],
      async (department) => {
        if (department === "MSE") {
          throw new Error("offline");
        }
        return [{ value: "120", title: "Introduction to Computing Science" }];
      },
      "2027-spring",
      { concurrency: 2 }
    );

    expect(courses.map((course) => course.id)).toEqual(["CMPT 120"]);
  });
});