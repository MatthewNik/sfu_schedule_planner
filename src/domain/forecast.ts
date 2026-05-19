import { compareTermIds, nextTermId } from "./terms";
import type { AppData, GraduationForecast, PlanVersion, RequirementGroupProgress, TermId } from "./types";

function lastPlannedTerm(plan: PlanVersion): TermId | undefined {
  const sorted = plan.degreePlan.plannedCourses
    .map((planned) => planned.termId)
    .sort(compareTermIds);
  return sorted[sorted.length - 1];
}

function addStudyTerms(start: TermId, count: number, plan: PlanVersion): TermId {
  let cursor = start;
  let remaining = count;
  while (remaining > 0) {
    cursor = nextTermId(cursor);
    const term = plan.degreePlan.terms.find((candidate) => candidate.id === cursor);
    if (!term || !["co-op", "off"].includes(term.termType)) {
      remaining -= 1;
    }
  }
  return cursor;
}

export function createGraduationForecast(
  data: AppData,
  plan: PlanVersion,
  requirementProgress: RequirementGroupProgress[]
): GraduationForecast {
  const incomplete = requirementProgress.filter((group) => !group.complete);
  const missingCourses = new Set(incomplete.flatMap((group) => group.missingCourseIds));
  const remainingUnits = incomplete.reduce((total, group) => {
    if (group.requiredUnits > group.completedUnits) {
      return total + (group.requiredUnits - group.completedUnits);
    }
    if (group.requiredCount > group.completedCount) {
      return total + (group.requiredCount - group.completedCount) * 3;
    }
    return total;
  }, 0);

  const averageUnits = Math.max(
    6,
    Math.round(
      plan.degreePlan.terms
        .filter((term) => term.termType === "study" || term.termType === "part-time")
        .reduce((sum, term) => sum + Math.min(term.maxUnits, term.preferredCourseCount * 3), 0) /
        Math.max(1, plan.degreePlan.terms.length)
    )
  );
  const extraStudyTerms = Math.ceil(remainingUnits / averageUnits);
  const lastTerm = lastPlannedTerm(plan) ?? data.settings.selectedTermId;
  const estimated =
    incomplete.length === 0 && missingCourses.size === 0
      ? lastTerm
      : addStudyTerms(lastTerm, Math.max(1, extraStudyTerms), plan);
  const earliest =
    incomplete.length === 0 && missingCourses.size === 0
      ? lastTerm
      : addStudyTerms(lastTerm, Math.max(1, Math.ceil(remainingUnits / 12)), {
          ...plan,
          degreePlan: {
            ...plan.degreePlan,
            terms: plan.degreePlan.terms.map((term) => ({ ...term, termType: "study" }))
          }
        });

  const uncertainAssumptions = data.courses
    .filter((course) => {
      return plan.degreePlan.plannedCourses.some((planned) => planned.courseId === course.id);
    })
    .filter((course) => course.historicalOfferings.length === 0)
    .map((course) => `${course.id} has no historical availability data.`);

  return {
    activePlanId: plan.id,
    estimatedGraduationTerm: estimated,
    earliestPossibleGraduationTerm: earliest,
    remainingRequirements: incomplete.map((group) => group.label),
    blockingCourses: [...missingCourses],
    uncertainAssumptions,
    notes: [
      "Estimate only. This is not official advising.",
      "Forecast uses active plan, editable local requirements, completed courses, transfer credits, and configured co-op/off terms."
    ]
  };
}
