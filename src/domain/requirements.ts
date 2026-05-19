import { getCourse } from "./course-utils";
import type {
  AppData,
  Course,
  PlanVersion,
  ProgramProfile,
  RequirementGroup,
  RequirementGroupProgress,
  RequirementTemplate
} from "./types";

function completedOrPlannedCourseIds(profile: ProgramProfile, plan: PlanVersion): Set<string> {
  return new Set([
    ...profile.completedCourses,
    ...plan.degreePlan.plannedCourses.map((planned) => planned.courseId)
  ]);
}

function groupCompletedCourses(
  group: RequirementGroup,
  completed: Set<string>,
  courses: Course[]
): Course[] {
  if (group.courseIds.length === 0) {
    return [];
  }

  return group.courseIds
    .filter((courseId) => completed.has(courseId))
    .map((courseId) => getCourse(courses, courseId))
    .filter(Boolean) as Course[];
}

export function evaluateRequirementProgress(
  data: AppData,
  profile: ProgramProfile,
  template: RequirementTemplate,
  plan: PlanVersion
): RequirementGroupProgress[] {
  const completed = completedOrPlannedCourseIds(profile, plan);
  const allCompletedCourses = [...completed]
    .map((courseId) => getCourse(data.courses, courseId))
    .filter(Boolean) as Course[];
  const totalUnits = profile.transferCredits + allCompletedCourses.reduce((sum, course) => sum + course.units, 0);

  return template.groups.map((group) => {
    if (profile.waivedRequirements.includes(group.id) || group.manuallyMarkedComplete) {
      return {
        groupId: group.id,
        label: group.label,
        complete: true,
        completedCount: group.courseIds.length,
        requiredCount: group.chooseCount ?? group.courseIds.length,
        completedUnits: group.unitMinimum ?? 0,
        requiredUnits: group.unitMinimum ?? 0,
        missingCourseIds: [],
        note: "Marked complete or waived manually."
      };
    }

    const completedCourses = groupCompletedCourses(group, completed, data.courses);

    if (group.type === "unit_minimum") {
      const requiredUnits = group.unitMinimum ?? 0;
      return {
        groupId: group.id,
        label: group.label,
        complete: totalUnits >= requiredUnits,
        completedCount: allCompletedCourses.length,
        requiredCount: 0,
        completedUnits: totalUnits,
        requiredUnits,
        missingCourseIds: []
      };
    }

    if (group.type === "upper_division_units") {
      const upperUnits = allCompletedCourses
        .filter((course) => Number(course.number.slice(0, 3)) >= 300)
        .reduce((sum, course) => sum + course.units, 0);
      const requiredUnits = group.unitMinimum ?? 0;
      return {
        groupId: group.id,
        label: group.label,
        complete: upperUnits >= requiredUnits,
        completedCount: completedCourses.length,
        requiredCount: 0,
        completedUnits: upperUnits,
        requiredUnits,
        missingCourseIds: []
      };
    }

    if (group.type === "designation") {
      const designatedUnits = allCompletedCourses
        .filter((course) => {
          return course.designation?.toLowerCase().includes(group.designation?.toLowerCase() ?? "");
        })
        .reduce((sum, course) => sum + course.units, 0);
      const requiredUnits = group.unitMinimum ?? 0;
      return {
        groupId: group.id,
        label: group.label,
        complete: designatedUnits >= requiredUnits,
        completedCount: completedCourses.length,
        requiredCount: 0,
        completedUnits: designatedUnits,
        requiredUnits,
        missingCourseIds: [],
        note: group.designation
      };
    }

    if (group.type === "choose_n") {
      const requiredCount = group.chooseCount ?? group.courseIds.length;
      return {
        groupId: group.id,
        label: group.label,
        complete: completedCourses.length >= requiredCount,
        completedCount: completedCourses.length,
        requiredCount,
        completedUnits: completedCourses.reduce((sum, course) => sum + course.units, 0),
        requiredUnits: 0,
        missingCourseIds: group.courseIds.filter((courseId) => !completed.has(courseId))
      };
    }

    const missingCourseIds = group.courseIds.filter((courseId) => !completed.has(courseId));
    return {
      groupId: group.id,
      label: group.label,
      complete: missingCourseIds.length === 0,
      completedCount: completedCourses.length,
      requiredCount: group.courseIds.length,
      completedUnits: completedCourses.reduce((sum, course) => sum + course.units, 0),
      requiredUnits: 0,
      missingCourseIds
    };
  });
}
