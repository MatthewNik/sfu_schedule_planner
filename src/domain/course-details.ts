import { compareTermIds, parseTermId } from "./terms";
import type { AppData, CourseInstructor, CourseSection, PlannedCourse, TermId, TermSeason } from "./types";

export type CourseDetailSource = "official" | "fallback" | "cached";

export interface PastInstructor {
  name: string;
  email?: string;
  profileUrl?: string;
  terms: TermId[];
}

export interface CourseDetailModel {
  source: CourseDetailSource;
  lastFetchedAt?: string;
  confirmedSections: CourseSection[];
  historicalSections: CourseSection[];
  pastInstructors: PastInstructor[];
  historicalOfferings: TermId[];
}

export function isOfficialSection(section: CourseSection): boolean {
  return Boolean(section.lastFetchedAt || section.raw);
}

export function historicalTermsFor(termId: TermId, years = 3): Array<{ year: number; season: TermSeason; termId: TermId }> {
  const target = parseTermId(termId);
  const seasons: TermSeason[] = ["spring", "summer", "fall"];
  const terms: Array<{ year: number; season: TermSeason; termId: TermId }> = [];

  for (let year = target.year - years; year < target.year; year += 1) {
    seasons.forEach((season) => {
      terms.push({ year, season, termId: `${year}-${season}` as TermId });
    });
  }

  return terms.sort((left, right) => {
    if (left.season === target.season && right.season !== target.season) {
      return -1;
    }
    if (right.season === target.season && left.season !== target.season) {
      return 1;
    }
    return compareTermIds(right.termId, left.termId);
  });
}

function newestTimestamp(values: Array<string | undefined>): string | undefined {
  return values.filter(Boolean).sort().at(-1);
}

function instructorKey(instructor: CourseInstructor): string {
  return `${instructor.name}|${instructor.email ?? ""}`;
}

export function buildCourseDetailModel(data: AppData, planned: PlannedCourse): CourseDetailModel {
  const course = data.courses.find((candidate) => candidate.id === planned.courseId);
  const historyTerms = new Set(historicalTermsFor(planned.termId).map((term) => term.termId));
  const officialSections = data.sections
    .filter((section) => section.courseId === planned.courseId && section.termId === planned.termId)
    .filter(isOfficialSection)
    .sort((left, right) => left.label.localeCompare(right.label));
  const historicalSections = data.sections
    .filter((section) => section.courseId === planned.courseId && historyTerms.has(section.termId))
    .filter(isOfficialSection)
    .sort((left, right) => {
      const leftTerm = parseTermId(left.termId);
      const rightTerm = parseTermId(right.termId);
      const plannedTerm = parseTermId(planned.termId);
      if (leftTerm.season === plannedTerm.season && rightTerm.season !== plannedTerm.season) {
        return -1;
      }
      if (rightTerm.season === plannedTerm.season && leftTerm.season !== plannedTerm.season) {
        return 1;
      }
      return compareTermIds(right.termId, left.termId) || left.label.localeCompare(right.label);
    });

  const pastInstructorsByKey = new Map<string, PastInstructor>();
  historicalSections.forEach((section) => {
    (section.instructors ?? []).forEach((instructor) => {
      const key = instructorKey(instructor);
      const existing = pastInstructorsByKey.get(key);
      if (existing) {
        existing.terms = [...new Set([...existing.terms, section.termId])].sort(compareTermIds).reverse();
        return;
      }
      pastInstructorsByKey.set(key, {
        name: instructor.name,
        email: instructor.email,
        profileUrl: instructor.profileUrl,
        terms: [section.termId]
      });
    });
  });

  return {
    source: officialSections.length ? "official" : historicalSections.length ? "fallback" : "cached",
    lastFetchedAt: newestTimestamp([
      course?.lastFetchedAt,
      ...officialSections.map((section) => section.lastFetchedAt),
      ...historicalSections.map((section) => section.lastFetchedAt)
    ]),
    confirmedSections: officialSections,
    historicalSections,
    pastInstructors: [...pastInstructorsByKey.values()].sort((left, right) => left.name.localeCompare(right.name)),
    historicalOfferings: (course?.historicalOfferings ?? [])
      .filter((offering) => historyTerms.has(offering))
      .sort(compareTermIds)
      .reverse()
  };
}
