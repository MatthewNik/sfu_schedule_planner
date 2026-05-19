import type { AppData, PlanVersion, ProgramProfile, RequirementTemplate } from "./types";

export type RecommendationStrategy =
  | "fastest"
  | "balanced"
  | "lighter"
  | "co_op_friendly"
  | "fewer_summer_courses"
  | "custom";

export interface RecommendationConstraints {
  maxUnitsPerTerm: number;
  preferredCoursesPerTerm: number;
  blockedTermIds: string[];
  coOpTermIds: string[];
}

export class RecommendationEngine {
  static generate(
    _profile: ProgramProfile,
    _requirements: RequirementTemplate[],
    _catalog: AppData["courses"],
    _constraints: RecommendationConstraints,
    _strategy: RecommendationStrategy
  ): PlanVersion[] {
    return [];
  }
}
