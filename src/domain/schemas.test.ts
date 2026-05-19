import { describe, expect, it } from "vitest";
import { createClearedAppData, createInitialAppData } from "./fixtures";
import { createPlannerLayoutExport } from "./planner-layout-export";
import { parseImportedAppData, parseImportedPlannerLayoutExport } from "./schemas";

describe("import schema", () => {
  it("accepts valid exported planner data", () => {
    const data = createInitialAppData();
    expect(parseImportedAppData(data).schemaVersion).toBe(1);
  });

  it("accepts optional remaining courses on program profiles", () => {
    const data = createInitialAppData();
    data.programProfiles[0].remainingCourses = ["MSE 312", "CMPT 225"];
    expect(parseImportedAppData(data).programProfiles[0].remainingCourses).toEqual([
      "MSE 312",
      "CMPT 225"
    ]);
  });

  it("rejects malformed schema versions", () => {
    const data = { ...createInitialAppData(), schemaVersion: 99 };
    expect(() => parseImportedAppData(data)).toThrow();
  });

  it("accepts valid planner layout exports", () => {
    const data = createInitialAppData();
    const layout = createPlannerLayoutExport(data, data.planVersions[0], "2026-05-19T00:00:00.000Z");
    expect(parseImportedPlannerLayoutExport(layout).exportType).toBe("sfu-schedule-planner-layout");
  });

  it("rejects malformed planner layout exports", () => {
    expect(() =>
      parseImportedPlannerLayoutExport({
        exportType: "sfu-schedule-planner-layout",
        schemaVersion: 1
      })
    ).toThrow();
  });

  it("creates cleared app data without preset planner work", () => {
    const data = createClearedAppData();
    expect(data.planVersions[0].degreePlan.plannedCourses).toEqual([]);
    expect(data.planVersions[0].semesterSchedules).toEqual([]);
    expect(data.programProfiles[0].completedCourses).toEqual([]);
    expect(data.programProfiles[0].remainingCourses).toEqual([]);
    expect(parseImportedAppData(data).schemaVersion).toBe(1);
  });
});
