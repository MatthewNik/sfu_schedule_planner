export type TermSeason = "spring" | "summer" | "fall";
export type TermType = "study" | "co-op" | "off" | "part-time" | "custom";
export type WarningSeverity = "low" | "medium" | "high" | "critical";
export type PlanVersionType = "long_term_plan" | "semester_schedule";
export type AvailabilityConfidence = "confirmed" | "likely" | "uncommon" | "unknown";
export type CourseNodeStatus = "completed" | "planned" | "available" | "locked" | "unknown";

export interface Course {
  id: string;
  subject: string;
  number: string;
  title: string;
  units: number;
  description?: string;
  prerequisitesText?: string;
  corequisitesText?: string;
  designation?: string;
  source: "seed" | "sfu" | "manual";
  historicalOfferings: TermId[];
  lastFetchedAt?: string;
}

export interface CourseInstructor {
  name: string;
  roleCode?: string;
  email?: string;
  profileUrl?: string;
  office?: string;
  officeHours?: string;
}

export interface CourseSection {
  id: string;
  courseId: string;
  termId: TermId;
  label: string;
  title: string;
  classType: "enrollment" | "non_enrollment" | "unknown";
  sectionCode?: string;
  associatedClass?: string;
  instructors?: CourseInstructor[];
  meetings: SectionMeeting[];
  lastFetchedAt?: string;
  raw?: unknown;
}

export interface SectionMeeting {
  id: string;
  days: Weekday[];
  startTime: string;
  endTime: string;
  campus?: string;
  sectionCode?: string;
  isExam?: boolean;
}

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export type TermId = `${number}-${TermSeason}`;

export interface PlannedCourse {
  id: string;
  courseId: string;
  termId: TermId;
  selectedSectionIds: string[];
  notes?: string;
  manuallyMarkedComplete?: boolean;
  overrideWarnings?: string[];
}

export interface DegreeTerm {
  id: TermId;
  year: number;
  season: TermSeason;
  termType: TermType;
  plannedCourseIds: string[];
  maxUnits: number;
  preferredCourseCount: number;
  allowCoursesDuringBlockedTerm: boolean;
  customLabel?: string;
  notes?: string;
}

export interface DegreePlan {
  terms: DegreeTerm[];
  plannedCourses: PlannedCourse[];
}

export interface SemesterScheduleVersion {
  id: string;
  termId: TermId;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  selectedSectionIdsByPlannedCourseId: Record<string, string[]>;
  notes?: string;
}

export interface ProgramProfile {
  id: string;
  major: string;
  secondMajor?: string;
  minor?: string;
  concentration?: string;
  calendarYear: string;
  transferCredits: number;
  completedCourses: string[];
  remainingCourses?: string[];
  substitutions: RequirementSubstitution[];
  waivedRequirements: string[];
  notes?: string;
}

export interface RequirementSubstitution {
  id: string;
  requirementId: string;
  originalCourseId?: string;
  substituteCourseId?: string;
  note: string;
}

export type RequirementGroupType =
  | "required_courses"
  | "choose_n"
  | "unit_minimum"
  | "upper_division_units"
  | "designation"
  | "custom";

export interface RequirementGroup {
  id: string;
  type: RequirementGroupType;
  label: string;
  courseIds: string[];
  chooseCount?: number;
  unitMinimum?: number;
  designation?: string;
  manuallyMarkedComplete?: boolean;
  notes?: string;
}

export interface RequirementTemplate {
  id: string;
  name: string;
  calendarYear: string;
  source: "local_editable" | "verified_import";
  groups: RequirementGroup[];
  notes?: string;
}

export interface RequirementGroupProgress {
  groupId: string;
  label: string;
  complete: boolean;
  completedCount: number;
  requiredCount: number;
  completedUnits: number;
  requiredUnits: number;
  missingCourseIds: string[];
  note?: string;
}

export interface PlanVersion {
  id: string;
  name: string;
  type: PlanVersionType;
  parentPlanId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  degreePlan: DegreePlan;
  semesterSchedules: SemesterScheduleVersion[];
  warningSnapshots: PlannerWarning[];
  acknowledgedWarningFingerprints: string[];
  requirementProgress: RequirementGroupProgress[];
  notes?: string;
}

export interface PlannerWarning {
  id: string;
  fingerprint: string;
  severity: WarningSeverity;
  message: string;
  affectedCourseIds: string[];
  affectedTermId?: TermId;
  acknowledged: boolean;
  source:
    | "availability"
    | "units"
    | "prerequisite"
    | "corequisite"
    | "schedule"
    | "term_type"
    | "import";
}

export interface GraduationForecast {
  activePlanId: string;
  estimatedGraduationTerm: TermId | "unknown";
  earliestPossibleGraduationTerm: TermId | "unknown";
  remainingRequirements: string[];
  blockingCourses: string[];
  uncertainAssumptions: string[];
  notes: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  completedNodes: string[];
  plannedNodes: string[];
  lockedNodes: string[];
  unknownNodes: string[];
}

export interface DependencyNode {
  id: string;
  courseId: string;
  label: string;
  status: CourseNodeStatus;
  rawPrerequisitesText?: string;
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  parsed: boolean;
}

export interface UserSettings {
  hideLowSeverityWarnings: boolean;
  selectedTermId: TermId;
  activeView: "planner" | "schedule" | "requirements" | "data";
  currentYear: number;
  currentSeason: TermSeason;
  rangeStartYear: number;
  rangeEndYear: number;
}

export interface AppData {
  schemaVersion: 1;
  courses: Course[];
  sections: CourseSection[];
  programProfiles: ProgramProfile[];
  requirementTemplates: RequirementTemplate[];
  planVersions: PlanVersion[];
  forecasts: GraduationForecast[];
  settings: UserSettings;
}
