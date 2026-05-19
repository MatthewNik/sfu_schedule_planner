import { createId, nowIso } from "./ids";
import { reconcilePlanningRange } from "./terms";
import { plannerLayoutExportType, type PlannerLayoutExportInput } from "./schemas";
import type { AppData, Course, CourseSection, DegreeTerm, PlanVersion, TermId } from "./types";

function selectedSectionIds(plan: PlanVersion): Set<string> {
  return new Set([
    ...plan.degreePlan.plannedCourses.flatMap((planned) => planned.selectedSectionIds),
    ...plan.semesterSchedules.flatMap((schedule) =>
      Object.values(schedule.selectedSectionIdsByPlannedCourseId).flat()
    )
  ]);
}

function mergeCourses(existing: Course[], incoming: Course[]): Course[] {
  const byId = new Map(existing.map((course) => [course.id, course]));
  incoming.forEach((course) => {
    const current = byId.get(course.id);
    byId.set(
      course.id,
      current
        ? {
            ...current,
            ...course,
            historicalOfferings: [...new Set([...current.historicalOfferings, ...course.historicalOfferings])]
          }
        : course
    );
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeSections(existing: CourseSection[], incoming: CourseSection[]): CourseSection[] {
  return [...new Map([...existing, ...incoming].map((section) => [section.id, section])).values()];
}

export function plannerLayoutExportFilename(planName: string): string {
  const slug = planName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "plan"}-layout.json`;
}

export function createPlannerLayoutExport(
  data: AppData,
  plan: PlanVersion,
  exportedAt = nowIso()
): PlannerLayoutExportInput {
  const courseIds = new Set(plan.degreePlan.plannedCourses.map((planned) => planned.courseId));
  const sectionIds = selectedSectionIds(plan);

  return {
    exportType: plannerLayoutExportType,
    schemaVersion: 1,
    exportedAt,
    settings: {
      currentYear: data.settings.currentYear,
      currentSeason: data.settings.currentSeason,
      rangeStartYear: data.settings.rangeStartYear,
      rangeEndYear: data.settings.rangeEndYear,
      selectedTermId: data.settings.selectedTermId
    },
    plan: {
      name: plan.name,
      degreePlan: plan.degreePlan,
      semesterSchedules: plan.semesterSchedules,
      notes: plan.notes
    },
    courses: data.courses.filter((course) => courseIds.has(course.id)),
    sections: data.sections.filter((section) => sectionIds.has(section.id))
  };
}

export function importPlannerLayoutExport(
  current: AppData,
  layout: PlannerLayoutExportInput,
  createdAt = nowIso()
): AppData {
  const importedSettings = {
    ...current.settings,
    ...layout.settings,
    activeView: "planner" as const
  };
  const reconciled = reconcilePlanningRange(
    layout.plan.degreePlan.terms as DegreeTerm[],
    layout.settings.selectedTermId as TermId,
    importedSettings
  );
  const importedPlan: PlanVersion = {
    id: createId("plan"),
    name: layout.plan.name,
    type: "long_term_plan",
    active: true,
    createdAt,
    updatedAt: createdAt,
    degreePlan: {
      plannedCourses: layout.plan.degreePlan.plannedCourses as PlanVersion["degreePlan"]["plannedCourses"],
      terms: reconciled.terms
    },
    semesterSchedules: layout.plan.semesterSchedules as PlanVersion["semesterSchedules"],
    warningSnapshots: [],
    acknowledgedWarningFingerprints: [],
    requirementProgress: [],
    notes: layout.plan.notes
  };

  return {
    ...current,
    courses: mergeCourses(current.courses, layout.courses as Course[]),
    sections: mergeSections(current.sections, layout.sections as CourseSection[]),
    planVersions: [
      ...current.planVersions.map((plan) =>
        plan.type === "long_term_plan" ? { ...plan, active: false } : plan
      ),
      importedPlan
    ],
    settings: {
      ...importedSettings,
      ...reconciled.settings,
      selectedTermId: reconciled.selectedTermId
    }
  };
}
