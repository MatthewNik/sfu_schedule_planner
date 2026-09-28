import { extractCourseCodes, getAvailabilityConfidence, normalizeCourseId } from "./course-utils";
import { termLabel } from "./terms";
import type { AvailabilityConfidence, Course, DegreeTerm, TermId, TermSeason } from "./types";

export interface CourseSearchQuery {
  raw: string;
  subject?: string;
  numberPrefix?: string;
  normalizedText: string;
  offeredIn?: TermId;
}

export interface CourseSearchResult {
  course: Course;
  matchesSubject: boolean;
  matchesNumberPrefix: boolean;
}

export interface PossibleTermPlacement {
  termId: TermId;
  label: string;
  season: TermSeason;
  confidence: Exclude<AvailabilityConfidence, "unknown">;
  reason: string;
}

export function parseCourseSearchQuery(query: string): CourseSearchQuery {
  const raw = query;
  const normalizedText = query.trim().replace(/\s+/g, " ").toUpperCase();
  const compact = normalizedText.replace(/\s+/g, "");
  const compactMatch = compact.match(/^([A-Z]{2,5})([0-9]{0,3}[A-Z]?)?$/);
  const spacedMatch = normalizedText.match(/^([A-Z]{2,5})(?:\s+([0-9]{0,3}[A-Z]?))?/);

  const subject = compactMatch?.[1] ?? spacedMatch?.[1];
  const numberPrefix = compactMatch?.[2] ?? spacedMatch?.[2];
  const numberOnly = !subject ? normalizedText.match(/^([0-9]{1,3}[A-Z]?)$/)?.[1] : undefined;

  return {
    raw,
    subject,
    numberPrefix: numberPrefix || numberOnly || undefined,
    normalizedText
  };
}

export function findMatchingCourses(query: string | CourseSearchQuery, courses: Course[]): CourseSearchResult[] {
  const parsed = typeof query === "string" ? parseCourseSearchQuery(query) : query;

  if (!parsed.normalizedText) {
    return [];
  }

  return courses
    .filter((course) => {
      const matchesSubject = parsed.subject ? course.subject === parsed.subject : true;
      const matchesNumberPrefix = parsed.numberPrefix
        ? course.number.startsWith(parsed.numberPrefix)
        : true;
      const fullText = `${course.id} ${course.title}`.toUpperCase();
      const textMatch = fullText.includes(parsed.normalizedText);
      const matchesAnySubjectNumber = parsed.numberPrefix
        ? course.number.startsWith(parsed.numberPrefix)
        : false;
      const matchesQuery = parsed.subject
        ? matchesSubject && matchesNumberPrefix
        : parsed.numberPrefix
          ? matchesAnySubjectNumber
          : textMatch;
      const matchesOffering = parsed.offeredIn ? course.historicalOfferings.includes(parsed.offeredIn) : true;
      return matchesQuery && matchesOffering;
    })
    .map((course) => ({
      course,
      matchesSubject: parsed.subject ? course.subject === parsed.subject : false,
      matchesNumberPrefix: parsed.numberPrefix
        ? course.number.startsWith(parsed.numberPrefix)
        : false
    }))
    .sort((left, right) => left.course.id.localeCompare(right.course.id));
}

export function getPossiblePlacements(course: Course, terms: DegreeTerm[]): PossibleTermPlacement[] {
  return terms
    .map((term) => {
      const confidence = getAvailabilityConfidence(course, term.id);
      if (confidence === "unknown") {
        return null;
      }

      const reason =
        confidence === "confirmed"
          ? `${course.id} has confirmed or cached offering data for ${termLabel(term.id)}.`
          : confidence === "likely"
            ? `${course.id} is usually offered in ${term.season}.`
            : `${course.id} has limited historical offering data for ${term.season}.`;

      return {
        termId: term.id,
        label: termLabel(term.id),
        season: term.season,
        confidence,
        reason
      };
    })
    .filter((placement): placement is PossibleTermPlacement => placement !== null);
}

export function extractCourseCodesFromPlainText(text: string): string[] {
  return extractCourseCodes(text);
}

export function createPlaceholderCourse(
  subject: string,
  number: string,
  title: string | undefined,
  termId: TermId
): Course {
  const id = normalizeCourseId(subject, number);
  return {
    id,
    subject: subject.toUpperCase(),
    number: number.toUpperCase(),
    title: title?.trim() || id,
    units: 3,
    source: "sfu",
    historicalOfferings: [termId]
  };
}
