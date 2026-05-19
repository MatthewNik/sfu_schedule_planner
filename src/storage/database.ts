import Dexie, { type Table } from "dexie";
import { createClearedAppData } from "../domain/fixtures";
import { appDataSchema } from "../domain/schemas";
import type {
  AppData,
  Course,
  CourseSection,
  GraduationForecast,
  PlanVersion,
  ProgramProfile,
  RequirementTemplate,
  UserSettings
} from "../domain/types";

interface AppStateRecord {
  id: "active";
  data: AppData;
  updatedAt: string;
}

interface SettingsRecord extends UserSettings {
  id: "settings";
}

class PlannerDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  courses!: Table<Course, string>;
  sections!: Table<CourseSection, string>;
  programProfiles!: Table<ProgramProfile, string>;
  requirementTemplates!: Table<RequirementTemplate, string>;
  planVersions!: Table<PlanVersion, string>;
  forecasts!: Table<GraduationForecast, string>;
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super("sfu-schedule-planner");
    this.version(1).stores({
      appState: "id",
      courses: "id, subject, number",
      sections: "id, courseId, termId",
      programProfiles: "id, major, calendarYear",
      requirementTemplates: "id, name, calendarYear",
      planVersions: "id, type, active",
      forecasts: "activePlanId",
      settings: "id"
    });
  }
}

export const db = new PlannerDatabase();

function hasOnlyCourses(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((courseId) => actual.includes(courseId));
}

function isUntouchedLegacyDemoData(data: AppData): boolean {
  const plan = data.planVersions.find((candidate) => candidate.active) ?? data.planVersions[0];
  const profile = data.programProfiles[0];
  const plannedCourses = plan?.degreePlan.plannedCourses ?? [];

  return Boolean(
    plan &&
      profile &&
      plannedCourses.length === 2 &&
      plannedCourses.every((planned) => planned.termId === "2026-fall") &&
      hasOnlyCourses(
        plannedCourses.map((planned) => planned.courseId),
        ["CMPT 225", "CMPT 276"]
      ) &&
      hasOnlyCourses(profile.completedCourses, ["CMPT 120", "CMPT 125", "MACM 101", "MATH 151"]) &&
      hasOnlyCourses(profile.remainingCourses ?? [], ["CMPT 225", "CMPT 276", "CMPT 295", "MATH 152", "STAT 270"]) &&
      plan.degreePlan.terms.find((term) => term.id === "2026-fall")?.plannedCourseIds.length === 2 &&
      plan.semesterSchedules.length === 1 &&
      profile.notes === "" &&
      plan.notes === "Local planning draft."
  );
}

export async function loadAppData(): Promise<AppData> {
  const record = await db.appState.get("active");
  if (record) {
    const parsed = appDataSchema.safeParse(record.data);
    if (parsed.success) {
      const data = parsed.data as AppData;
      if (isUntouchedLegacyDemoData(data)) {
        const cleared = createClearedAppData();
        await saveAppData(cleared);
        return cleared;
      }

      return data;
    }
  }

  const seed = createClearedAppData();
  await saveAppData(seed);
  return seed;
}

export async function saveAppData(data: AppData): Promise<void> {
  const parsed = appDataSchema.parse(data) as AppData;
  await db.transaction(
    "rw",
    [
      db.appState,
      db.courses,
      db.sections,
      db.programProfiles,
      db.requirementTemplates,
      db.planVersions,
      db.forecasts,
      db.settings
    ],
    async () => {
      await db.appState.put({ id: "active", data: parsed, updatedAt: new Date().toISOString() });
      await db.courses.clear();
      await db.sections.clear();
      await db.programProfiles.clear();
      await db.requirementTemplates.clear();
      await db.planVersions.clear();
      await db.forecasts.clear();
      await db.settings.clear();
      await db.courses.bulkPut(parsed.courses);
      await db.sections.bulkPut(parsed.sections);
      await db.programProfiles.bulkPut(parsed.programProfiles);
      await db.requirementTemplates.bulkPut(parsed.requirementTemplates);
      await db.planVersions.bulkPut(parsed.planVersions);
      await db.forecasts.bulkPut(parsed.forecasts);
      await db.settings.put({ id: "settings", ...parsed.settings });
    }
  );
}

export async function clearAllPlannerData(): Promise<AppData> {
  await db.delete();
  await db.open();
  const seed = createClearedAppData();
  await saveAppData(seed);
  return seed;
}
