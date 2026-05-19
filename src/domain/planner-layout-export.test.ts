import { describe, expect, it } from "vitest";
import { createClearedAppData, createInitialAppData } from "./fixtures";
import {
  createPlannerLayoutExport,
  importPlannerLayoutExport,
  plannerLayoutExportFilename
} from "./planner-layout-export";

describe("planner layout exports", () => {
  it("exports only the active plan layout and referenced catalog records", () => {
    const data = createInitialAppData();
    const plan = data.planVersions[0];
    const exported = createPlannerLayoutExport(data, plan, "2026-05-19T00:00:00.000Z");
    const plannedCourseIds = new Set(plan.degreePlan.plannedCourses.map((planned) => planned.courseId));

    expect(exported.plan.name).toBe(plan.name);
    expect(exported.plan.degreePlan.terms).toEqual(plan.degreePlan.terms);
    expect(exported.plan.degreePlan.plannedCourses).toEqual(plan.degreePlan.plannedCourses);
    expect(exported.settings.rangeStartYear).toBe(data.settings.rangeStartYear);
    expect(exported.settings.rangeEndYear).toBe(data.settings.rangeEndYear);
    expect(exported.courses.map((course) => course.id).sort()).toEqual([...plannedCourseIds].sort());
    expect(exported.courses.length).toBeLessThan(data.courses.length);
    expect(exported.sections.every((section) => plannedCourseIds.has(section.courseId))).toBe(true);
  });

  it("imports a layout as a new active plan while preserving term course order", () => {
    const source = createInitialAppData();
    const target = createClearedAppData();
    const exported = createPlannerLayoutExport(source, source.planVersions[0], "2026-05-19T00:00:00.000Z");
    const imported = importPlannerLayoutExport(target, exported, "2026-05-19T01:00:00.000Z");
    const activePlans = imported.planVersions.filter((plan) => plan.active);
    const importedPlan = activePlans[0];
    const sourceFall = source.planVersions[0].degreePlan.terms.find((term) => term.id === "2026-fall");
    const importedFall = importedPlan.degreePlan.terms.find((term) => term.id === "2026-fall");

    expect(imported.planVersions).toHaveLength(target.planVersions.length + 1);
    expect(activePlans).toHaveLength(1);
    expect(importedPlan.name).toBe(source.planVersions[0].name);
    expect(importedFall?.plannedCourseIds).toEqual(sourceFall?.plannedCourseIds);
    expect(imported.settings.rangeStartYear).toBe(exported.settings.rangeStartYear);
    expect(imported.settings.rangeEndYear).toBe(exported.settings.rangeEndYear);
    expect(imported.settings.selectedTermId).toBe(exported.settings.selectedTermId);
  });

  it("creates stable plan-specific filenames", () => {
    expect(plannerLayoutExportFilename("Plan 1")).toBe("plan-1-layout.json");
    expect(plannerLayoutExportFilename("  MSE Summer / Spring  ")).toBe("mse-summer-spring-layout.json");
  });
});
