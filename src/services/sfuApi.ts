import { normalizeCourseId, parseDays } from "../domain/course-utils";
import type { Course, CourseInstructor, CourseSection, SectionMeeting, TermId, TermSeason } from "../domain/types";

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
  info?: SfuOutlineInfo;
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
  instructor?: SfuInstructor[] | SfuInstructor;
  courseSchedule?: SfuScheduleItem[];
  examSchedule?: SfuScheduleItem[];
  schedule?: SfuScheduleItem[];
  [key: string]: unknown;
}

interface SfuOutlineInfo {
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
  [key: string]: unknown;
}

interface SfuInstructor {
  name?: string;
  roleCode?: string;
  email?: string;
  profileUrl?: string;
  office?: string;
  officeHours?: string;
  commonName?: string;
  firstName?: string;
  lastName?: string;
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

function outlineInfo(outline: SfuOutline): SfuOutlineInfo {
  return outline.info ?? outline;
}

function instructorsFromOutline(outline: SfuOutline): CourseInstructor[] {
  const raw = Array.isArray(outline.instructor)
    ? outline.instructor
    : outline.instructor
      ? [outline.instructor]
      : [];

  return raw
    .map((instructor): CourseInstructor | undefined => {
      const name = instructor.name?.trim() || [instructor.firstName, instructor.lastName].filter(Boolean).join(" ").trim();
      if (!name) {
        return undefined;
      }

      const normalized: CourseInstructor = { name };
      if (instructor.roleCode) normalized.roleCode = instructor.roleCode;
      if (instructor.email) normalized.email = instructor.email;
      if (instructor.profileUrl) normalized.profileUrl = instructor.profileUrl;
      if (instructor.office) normalized.office = instructor.office;
      if (instructor.officeHours) normalized.officeHours = instructor.officeHours;
      return normalized;
    })
    .filter((instructor): instructor is CourseInstructor => Boolean(instructor));
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

export function courseFromOutline(
  outline: SfuOutline,
  department: string,
  courseNumber: string,
  termId: TermId,
  fetchedAt = new Date().toISOString()
): Course {
  const info = outlineInfo(outline);
  const subject = (info.dept ?? department).toUpperCase();
  const number = (info.number ?? courseNumber).toUpperCase();
  const id = normalizeCourseId(subject, number);

  return {
    id,
    subject,
    number,
    title: info.title ?? info.name ?? id,
    units: Number(info.units ?? 3) || 3,
    description: info.description,
    prerequisitesText: info.prerequisites,
    corequisitesText: info.corequisites,
    designation: info.designation,
    source: "sfu",
    historicalOfferings: [termId],
    lastFetchedAt: fetchedAt
  };
}

export function sectionFromOutline(
  outline: SfuOutline,
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string,
  fallback: SfuListItem,
  fetchedAt = new Date().toISOString()
): CourseSection {
  const info = outlineInfo(outline);
  const courseId = normalizeCourseId(department, courseNumber);
  const label = (info.section ?? fallback.value ?? fallback.text ?? "unknown").toUpperCase();
  const termId = `${year}-${term}` as TermId;
  const id = `${courseId}-${termId}-${label}`;

  return {
    id,
    courseId,
    termId,
    label,
    title: info.title ?? fallback.title ?? courseId,
    classType:
      fallback.classType === "e"
        ? "enrollment"
        : fallback.classType === "n"
          ? "non_enrollment"
          : "unknown",
    sectionCode: fallback.sectionCode,
    associatedClass: fallback.associatedClass,
    instructors: instructorsFromOutline(outline),
    meetings: normalizedMeetings(outline, id),
    lastFetchedAt: fetchedAt,
    raw: outline
  };
}

export async function fetchSfuCourseWithSections(
  year: number,
  term: TermSeason,
  department: string,
  courseNumber: string
): Promise<{ course?: Course; sections: CourseSection[] }> {
  const fetchedAt = new Date().toISOString();
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
    course: firstOutline ? courseFromOutline(firstOutline, department, courseNumber, termId, fetchedAt) : undefined,
    sections: fulfilled.map(({ result, section }) =>
      sectionFromOutline(result.value, year, term, department, courseNumber, section, fetchedAt)
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
