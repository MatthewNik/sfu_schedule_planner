import { extractCourseCodes } from "./course-utils";
import type { AppData, CourseNodeStatus, DependencyGraph, DependencyNode, PlanVersion } from "./types";

export function createDependencyGraph(data: AppData, plan: PlanVersion): DependencyGraph {
  const completed = new Set(data.programProfiles[0]?.completedCourses ?? []);
  const planned = new Set(plan.degreePlan.plannedCourses.map((course) => course.courseId));
  const relevant = new Set([...completed, ...planned]);

  plan.degreePlan.plannedCourses.forEach((plannedCourse) => {
    const course = data.courses.find((candidate) => candidate.id === plannedCourse.courseId);
    extractCourseCodes(course?.prerequisitesText).forEach((courseId) => relevant.add(courseId));
  });

  const nodes: DependencyNode[] = [...relevant].map((courseId) => {
    const course = data.courses.find((candidate) => candidate.id === courseId);
    const status: CourseNodeStatus = completed.has(courseId)
      ? "completed"
      : planned.has(courseId)
        ? "planned"
        : course
          ? "locked"
          : "unknown";

    return {
      id: courseId,
      courseId,
      label: course?.id ?? courseId,
      status,
      rawPrerequisitesText: course?.prerequisitesText
    };
  });

  const edges = data.courses
    .filter((course) => relevant.has(course.id))
    .flatMap((course) => {
      return extractCourseCodes(course.prerequisitesText)
        .filter((source) => relevant.has(source))
        .map((source) => ({
          id: `${source}->${course.id}`,
          source,
          target: course.id,
          label: "prerequisite",
          parsed: false
        }));
    });

  return {
    nodes,
    edges,
    completedNodes: nodes.filter((node) => node.status === "completed").map((node) => node.id),
    plannedNodes: nodes.filter((node) => node.status === "planned").map((node) => node.id),
    lockedNodes: nodes.filter((node) => node.status === "locked").map((node) => node.id),
    unknownNodes: nodes.filter((node) => node.status === "unknown").map((node) => node.id)
  };
}
