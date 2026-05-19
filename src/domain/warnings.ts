import {
  completedAndPriorPlannedCourseIds,
  extractCourseCodes,
  getAvailabilityConfidence,
  getCourse,
  getPlannedCoursesForTerm,
  hasTimeOverlap,
  plannedCourseUnits,
  selectedSectionsForSchedule
} from "./course-utils";
import type {
  AppData,
  CourseSection,
  PlannerWarning,
  PlanVersion,
  TermId,
  WarningSeverity
} from "./types";

function warningId(fingerprint: string): string {
  return `warning_${fingerprint.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
}

function createWarning(
  severity: WarningSeverity,
  source: PlannerWarning["source"],
  message: string,
  affectedCourseIds: string[],
  affectedTermId: TermId | undefined,
  acknowledgedFingerprints: Set<string>
): PlannerWarning {
  const fingerprint = [source, severity, affectedTermId ?? "none", ...affectedCourseIds, message]
    .join("|")
    .toLowerCase();

  return {
    id: warningId(fingerprint),
    fingerprint,
    severity,
    source,
    message,
    affectedCourseIds,
    affectedTermId,
    acknowledged: acknowledgedFingerprints.has(fingerprint)
  };
}

function sectionOverlapWarnings(
  sections: CourseSection[],
  plan: PlanVersion,
  acknowledged: Set<string>
): PlannerWarning[] {
  return plan.semesterSchedules
    .filter((schedule) => schedule.active)
    .flatMap((schedule) => {
      const selectedSections = selectedSectionsForSchedule(
        sections,
        schedule.selectedSectionIdsByPlannedCourseId
      );
      const warnings: PlannerWarning[] = [];

      for (let leftIndex = 0; leftIndex < selectedSections.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < selectedSections.length; rightIndex += 1) {
          const left = selectedSections[leftIndex];
          const right = selectedSections[rightIndex];
          for (const leftMeeting of left.meetings) {
            for (const rightMeeting of right.meetings) {
              const sharedDay = leftMeeting.days.some((day) => rightMeeting.days.includes(day));
              if (
                sharedDay &&
                hasTimeOverlap(
                  leftMeeting.startTime,
                  leftMeeting.endTime,
                  rightMeeting.startTime,
                  rightMeeting.endTime
                )
              ) {
                warnings.push(
                  createWarning(
                    "critical",
                    "schedule",
                    `${left.courseId} ${left.label} overlaps with ${right.courseId} ${right.label}.`,
                    [left.courseId, right.courseId],
                    schedule.termId,
                    acknowledged
                  )
                );
              }
            }
          }
        }
      }

      return warnings;
    });
}

export function generateWarnings(data: AppData, plan: PlanVersion): PlannerWarning[] {
  const acknowledged = new Set(plan.acknowledgedWarningFingerprints);
  const warnings: PlannerWarning[] = [];

  for (const term of plan.degreePlan.terms) {
    const planned = getPlannedCoursesForTerm(plan.degreePlan.plannedCourses, term);
    const units = plannedCourseUnits(data.courses, planned);

    if (units > term.maxUnits) {
      warnings.push(
        createWarning(
          "medium",
          "units",
          `${term.id} has ${units} units, above the configured maximum of ${term.maxUnits}.`,
          planned.map((course) => course.courseId),
          term.id,
          acknowledged
        )
      );
    }

    if (
      planned.length > 0 &&
      ["co-op", "off"].includes(term.termType) &&
      !term.allowCoursesDuringBlockedTerm
    ) {
      warnings.push(
        createWarning(
          "medium",
          "term_type",
          `${term.id} is marked ${term.termType}, so courses are de-emphasized unless override is enabled.`,
          planned.map((course) => course.courseId),
          term.id,
          acknowledged
        )
      );
    }

    for (const plannedCourse of planned) {
      const course = getCourse(data.courses, plannedCourse.courseId);
      if (!course) {
        continue;
      }

      const confidence = getAvailabilityConfidence(course, term.id);
      if (confidence === "unknown") {
        warnings.push(
          createWarning(
            "low",
            "availability",
            `No historical offering data found for ${course.id} in ${term.season}.`,
            [course.id],
            term.id,
            acknowledged
          )
        );
      }

      if (confidence === "uncommon") {
        warnings.push(
          createWarning(
            "medium",
            "availability",
            `${course.id} is not usually offered in ${term.season}.`,
            [course.id],
            term.id,
            acknowledged
          )
        );
      }

      const completedBeforeTerm = completedAndPriorPlannedCourseIds(data, term.id, plan.id);
      for (const prerequisiteId of extractCourseCodes(course.prerequisitesText)) {
        if (!completedBeforeTerm.has(prerequisiteId)) {
          warnings.push(
            createWarning(
              "high",
              "prerequisite",
              `Prerequisite ${prerequisiteId} is not completed or planned before ${course.id}.`,
              [course.id, prerequisiteId],
              term.id,
              acknowledged
            )
          );
        }
      }

      for (const corequisiteId of extractCourseCodes(course.corequisitesText)) {
        const plannedSameTerm = planned.some((candidate) => candidate.courseId === corequisiteId);
        if (!completedBeforeTerm.has(corequisiteId) && !plannedSameTerm) {
          warnings.push(
            createWarning(
              "high",
              "corequisite",
              `Corequisite ${corequisiteId} is not completed or planned with ${course.id}.`,
              [course.id, corequisiteId],
              term.id,
              acknowledged
            )
          );
        }
      }
    }
  }

  warnings.push(...sectionOverlapWarnings(data.sections, plan, acknowledged));

  const byFingerprint = new Map<string, PlannerWarning>();
  warnings.forEach((warning) => byFingerprint.set(warning.fingerprint, warning));
  return [...byFingerprint.values()].sort((a, b) => {
    const severityOrder: Record<WarningSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
