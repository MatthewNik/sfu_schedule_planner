import { normalizeCourseId, parseDays } from "../domain/course-utils";
import type { Course, CourseSection, SectionMeeting, TermId, TermSeason } from "../domain/types";

const DEFAULT_SFU_API_BASE_URL = "https://www.sfu.ca/bin/wcm/course-outlines";
export const SFU_API_BASE_URL =
  import.meta.env.VITE_SFU_API_BASE_URL ?? DEFAULT_SFU_API_BASE_URL;

export interface SfuListItem {
  text?: string;
  value?: string;
  title?: string;
  classType?: string;
  sectionCode?: string;
  associatedClass?: string;
}

interface SfuOutline {
  title?: string;
  prerequisites?: string;
  corequisites?: string;
  designation?: string;
  description?: string;
  dept?: string;
  number?: string;
  units?: string | number;
  section?: string;
  term?: string;
  name?: string;
  classNumber?: string;
  courseSchedule?: SfuScheduleItem[];
  examSchedule?: SfuScheduleItem[];
  schedule?: SfuScheduleItem[];
  [key: string]: unknown;
}

interface SfuScheduleItem {
  startTime?: string;
  endTime?: string;
  days?: string;
  campus?: string;
  sectionCode?: string;
  isExam?: boolean | string;
}

function apiUrl(parts: string[]): string {
  return `${SFU_API_BASE_URL}?${parts.map((part) => part.trim().toLowerCase()).join("/")}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`SFU API request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getSfuYears(): Promise<SfuListItem[]> {
  return fetchJson<SfuListItem[]>(SFU_API_BASE_URL);
}

export async function getSfuTerms(year: number | "current" | "registration"): Promise<SfuListItem[]> {
  return fetchJson<SfuListItem[]>(apiUrl([String(year)]));
}

export async function getSfuDepartments(
  year: number | "current" | "registration",
  term: TermSeason | "current" | "registration"
): Promise<SfuListItem[]> {
  return fetchJson<SfuListItem[]>(apiUrl([String(year), term]));
}

export async function getSfuCourseNumbers(
  year: number,
  term: TermSeason,
  department: string
): Promise<SfuListItem[]> {
  return fetchJson<SfuListItem[]>(apiUrl([String(year), term, department]));
}

export async function getSfuSections(
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string
): Promise<SfuListItem[]> {
  return fetchJson<SfuListItem[]>(apiUrl([String(year), term, department, courseNumber]));
}

export async function getSfuOutline(
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string,
  section: string
): Promise<SfuOutline> {
  return fetchJson<SfuOutline>(apiUrl([String(year), term, department, courseNumber, section]));
}

function normalizedMeetings(outline: SfuOutline, sectionId: string): SectionMeeting[] {
  const scheduleItems = [
    ...(Array.isArray(outline.courseSchedule) ? outline.courseSchedule : []),
    ...(Array.isArray(outline.schedule) ? outline.schedule : [])
  ].filter((item) => item.startTime && item.endTime && item.days);

  return scheduleItems.map((item, index) => ({
    id: `${sectionId}-meeting-${index}`,
    days: parseDays(item.days),
    startTime: item.startTime ?? "",
    endTime: item.endTime ?? "",
    campus: item.campus,
    sectionCode: item.sectionCode,
    isExam: item.isExam === true || item.isExam === "true"
  }));
}

function courseFromOutline(outline: SfuOutline, department: string, courseNumber: string, termId: TermId): Course {
  const subject = (outline.dept ?? department).toUpperCase();
  const number = (outline.number ?? courseNumber).toUpperCase();
  const id = normalizeCourseId(subject, number);

  return {
    id,
    subject,
    number,
    title: outline.title ?? outline.name ?? id,
    units: Number(outline.units ?? 3) || 3,
    description: outline.description,
    prerequisitesText: outline.prerequisites,
    corequisitesText: outline.corequisites,
    designation: outline.designation,
    source: "sfu",
    historicalOfferings: [termId]
  };
}

function sectionFromOutline(
  outline: SfuOutline,
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string,
  fallback: SfuListItem
): CourseSection {
  const courseId = normalizeCourseId(department, courseNumber);
  const label = (outline.section ?? fallback.value ?? fallback.text ?? "unknown").toUpperCase();
  const termId = `${year}-${term}` as TermId;
  const id = `${courseId}-${termId}-${label}`;

  return {
    id,
    courseId,
    termId,
    label,
    title: outline.title ?? fallback.title ?? courseId,
    classType:
      fallback.classType === "e"
        ? "enrollment"
        : fallback.classType === "n"
          ? "non_enrollment"
          : "unknown",
    sectionCode: fallback.sectionCode,
    associatedClass: fallback.associatedClass,
    meetings: normalizedMeetings(outline, id),
    raw: outline
  };
}

export async function fetchSfuCourseWithSections(
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string
): Promise<{ course?: Course; sections: CourseSection[] }> {
  const sectionItems = await getSfuSections(year, term, department, courseNumber);
  const enrollmentSections = sectionItems.filter((section) => section.value && section.classType !== "n");
  const outlines = await Promise.allSettled(
    enrollmentSections.map((section) =>
      getSfuOutline(year, term, department, courseNumber, section.value ?? "")
    )
  );

  const termId = `${year}-${term}` as TermId;
  const fulfilled = outlines
    .map((result, index) => ({ result, section: enrollmentSections[index] }))
    .filter((entry): entry is { result: PromiseFulfilledResult<SfuOutline>; section: SfuListItem } => {
      return entry.result.status === "fulfilled";
    });

  const firstOutline = fulfilled[0]?.result.value;
  return {
    course: firstOutline ? courseFromOutline(firstOutline, department, courseNumber, termId) : undefined,
    sections: fulfilled.map(({ result, section }) =>
      sectionFromOutline(result.value, year, term, department, courseNumber, section)
    )
  };
}

export async function fetchSfuCourseNumbersForSubject(
  year: number,
  term: TermSeason,
  department: string
): Promise<SfuListItem[]> {
  return getSfuCourseNumbers(year, term, department);
}
