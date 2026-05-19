import { compareTermIds, parseTermId } from "./terms";
import type {
  AppData,
  AvailabilityConfidence,
  Course,
  CourseSection,
  DegreeTerm,
  PlannedCourse,
  TermId,
  Weekday
} from "./types";

const courseCodePattern = /\b([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)\b/g;

export function normalizeCourseId(subject: string, number: string): string {
  return `${subject.trim().toUpperCase()} ${number.trim().toUpperCase()}`;
}

export function extractCourseCodes(text?: string): string[] {
  if (!text) {
    return [];
  }

  const matches = new Set<string>();
  for (const match of text.toUpperCase().matchAll(courseCodePattern)) {
    matches.add(normalizeCourseId(match[1], match[2]));
  }

  return [...matches];
}

export function getCourse(courses: Course[], courseId: string): Course | undefined {
  return courses.find((course) => course.id === courseId);
}

export function getPlannedCoursesForTerm(
  planCourses: PlannedCourse[],
  term: DegreeTerm
): PlannedCourse[] {
  const ids = new Set(term.plannedCourseIds);
  return planCourses.filter((planned) => ids.has(planned.id));
}

export function plannedCourseUnits(courses: Course[], plannedCourses: PlannedCourse[]): number {
  return plannedCourses.reduce((total, planned) => {
    return total + (getCourse(courses, planned.courseId)?.units ?? 0);
  }, 0);
}

export function completedAndPriorPlannedCourseIds(
  data: AppData,
  targetTermId: TermId,
  activePlanId: string
): Set<string> {
  const profile = data.programProfiles[0];
  const plan = data.planVersions.find((candidate) => candidate.id === activePlanId);
  const completed = new Set(profile?.completedCourses ?? []);

  if (!plan) {
    return completed;
  }

  plan.degreePlan.plannedCourses.forEach((planned) => {
    if (compareTermIds(planned.termId, targetTermId) < 0 || planned.manuallyMarkedComplete) {
      completed.add(planned.courseId);
    }
  });

  return completed;
}

export function getAvailabilityConfidence(course: Course, termId: TermId): AvailabilityConfidence {
  if (course.historicalOfferings.includes(termId)) {
    return "confirmed";
  }

  const target = parseTermId(termId);
  const lookbackYears = new Set([target.year - 1, target.year - 2, target.year - 3]);
  const sameSeasonCount = course.historicalOfferings.filter((offering) => {
    const parsed = parseTermId(offering);
    return parsed.season === target.season && lookbackYears.has(parsed.year);
  }).length;

  if (sameSeasonCount >= 2) {
    return "likely";
  }

  if (sameSeasonCount === 1) {
    return "uncommon";
  }

  return "unknown";
}

export function parseDays(days?: string): Weekday[] {
  if (!days) {
    return [];
  }

  const compact = days.toUpperCase().replace(/\s+/g, "");
  const parsed: Weekday[] = [];
  let index = 0;
  while (index < compact.length) {
    const two = compact.slice(index, index + 2);
    if (two === "MO") parsed.push("MO");
    else if (two === "TU") parsed.push("TU");
    else if (two === "WE") parsed.push("WE");
    else if (two === "TH") parsed.push("TH");
    else if (two === "FR") parsed.push("FR");
    else if (two === "SA") parsed.push("SA");
    else if (two === "SU") parsed.push("SU");
    index += 2;
  }

  return parsed;
}

export function selectedSectionsForSchedule(
  sections: CourseSection[],
  selectedSectionIdsByPlannedCourseId: Record<string, string[]>
): CourseSection[] {
  const selected = new Set(Object.values(selectedSectionIdsByPlannedCourseId).flat());
  return sections.filter((section) => selected.has(section.id));
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function hasTimeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const startA = timeToMinutes(aStart);
  const endA = timeToMinutes(aEnd);
  const startB = timeToMinutes(bStart);
  const endB = timeToMinutes(bEnd);
  return startA < endB && startB < endA;
}
