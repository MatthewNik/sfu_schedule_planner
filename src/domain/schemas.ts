import { z } from "zod";

const termSeasonSchema = z.enum(["spring", "summer", "fall"]);
const termTypeSchema = z.enum(["study", "co-op", "off", "part-time", "custom"]);
const warningSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

const termIdSchema = z.string().regex(/^\d{4}-(spring|summer|fall)$/);
export const plannerLayoutExportType = "sfu-schedule-planner-layout" as const;

export const sectionMeetingSchema = z.object({
  id: z.string(),
  days: z.array(weekdaySchema),
  startTime: z.string(),
  endTime: z.string(),
  campus: z.string().optional(),
  sectionCode: z.string().optional(),
  isExam: z.boolean().optional()
});

export const courseSchema = z.object({
  id: z.string(),
  subject: z.string(),
  number: z.string(),
  title: z.string(),
  units: z.number().nonnegative(),
  description: z.string().optional(),
  prerequisitesText: z.string().optional(),
  corequisitesText: z.string().optional(),
  designation: z.string().optional(),
  source: z.enum(["seed", "sfu", "manual"]),
  historicalOfferings: z.array(termIdSchema)
});

export const courseSectionSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  termId: termIdSchema,
  label: z.string(),
  title: z.string(),
  classType: z.enum(["enrollment", "non_enrollment", "unknown"]),
  sectionCode: z.string().optional(),
  associatedClass: z.string().optional(),
  meetings: z.array(sectionMeetingSchema),
  raw: z.unknown().optional()
});

export const plannedCourseSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  termId: termIdSchema,
  selectedSectionIds: z.array(z.string()),
  notes: z.string().optional(),
  manuallyMarkedComplete: z.boolean().optional(),
  overrideWarnings: z.array(z.string()).optional()
});

export const degreeTermSchema = z.object({
  id: termIdSchema,
  year: z.number().int(),
  season: termSeasonSchema,
  termType: termTypeSchema,
  plannedCourseIds: z.array(z.string()),
  maxUnits: z.number().nonnegative(),
  preferredCourseCount: z.number().int().nonnegative(),
  allowCoursesDuringBlockedTerm: z.boolean(),
  customLabel: z.string().optional(),
  notes: z.string().optional()
});

export const degreePlanSchema = z.object({
  terms: z.array(degreeTermSchema),
  plannedCourses: z.array(plannedCourseSchema)
});

export const semesterScheduleVersionSchema = z.object({
  id: z.string(),
  termId: termIdSchema,
  name: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  selectedSectionIdsByPlannedCourseId: z.record(z.array(z.string())),
  notes: z.string().optional()
});

export const requirementSubstitutionSchema = z.object({
  id: z.string(),
  requirementId: z.string(),
  originalCourseId: z.string().optional(),
  substituteCourseId: z.string().optional(),
  note: z.string()
});

export const programProfileSchema = z.object({
  id: z.string(),
  major: z.string(),
  secondMajor: z.string().optional(),
  minor: z.string().optional(),
  concentration: z.string().optional(),
  calendarYear: z.string(),
  transferCredits: z.number().nonnegative(),
  completedCourses: z.array(z.string()),
  remainingCourses: z.array(z.string()).optional(),
  substitutions: z.array(requirementSubstitutionSchema),
  waivedRequirements: z.array(z.string()),
  notes: z.string().optional()
});

export const requirementGroupSchema = z.object({
  id: z.string(),
  type: z.enum([
    "required_courses",
    "choose_n",
    "unit_minimum",
    "upper_division_units",
    "designation",
    "custom"
  ]),
  label: z.string(),
  courseIds: z.array(z.string()),
  chooseCount: z.number().int().nonnegative().optional(),
  unitMinimum: z.number().nonnegative().optional(),
  designation: z.string().optional(),
  manuallyMarkedComplete: z.boolean().optional(),
  notes: z.string().optional()
});

export const requirementTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  calendarYear: z.string(),
  source: z.enum(["local_editable", "verified_import"]),
  groups: z.array(requirementGroupSchema),
  notes: z.string().optional()
});

export const requirementGroupProgressSchema = z.object({
  groupId: z.string(),
  label: z.string(),
  complete: z.boolean(),
  completedCount: z.number().int().nonnegative(),
  requiredCount: z.number().int().nonnegative(),
  completedUnits: z.number().nonnegative(),
  requiredUnits: z.number().nonnegative(),
  missingCourseIds: z.array(z.string()),
  note: z.string().optional()
});

export const plannerWarningSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  severity: warningSeveritySchema,
  message: z.string(),
  affectedCourseIds: z.array(z.string()),
  affectedTermId: termIdSchema.optional(),
  acknowledged: z.boolean(),
  source: z.enum([
    "availability",
    "units",
    "prerequisite",
    "corequisite",
    "schedule",
    "term_type",
    "import"
  ])
});

export const graduationForecastSchema = z.object({
  activePlanId: z.string(),
  estimatedGraduationTerm: z.union([termIdSchema, z.literal("unknown")]),
  earliestPossibleGraduationTerm: z.union([termIdSchema, z.literal("unknown")]),
  remainingRequirements: z.array(z.string()),
  blockingCourses: z.array(z.string()),
  uncertainAssumptions: z.array(z.string()),
  notes: z.array(z.string())
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(1),
  courses: z.array(courseSchema),
  sections: z.array(courseSectionSchema),
  programProfiles: z.array(programProfileSchema),
  requirementTemplates: z.array(requirementTemplateSchema),
  planVersions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["long_term_plan", "semester_schedule"]),
      parentPlanId: z.string().optional(),
      active: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
      degreePlan: degreePlanSchema,
      semesterSchedules: z.array(semesterScheduleVersionSchema),
      warningSnapshots: z.array(plannerWarningSchema),
      acknowledgedWarningFingerprints: z.array(z.string()),
      requirementProgress: z.array(requirementGroupProgressSchema),
      notes: z.string().optional()
    })
  ),
  forecasts: z.array(graduationForecastSchema),
  settings: z.object({
    hideLowSeverityWarnings: z.boolean().default(false),
    selectedTermId: termIdSchema,
    activeView: z.enum(["planner", "schedule", "requirements", "data"]).default("planner"),
    currentYear: z.number().int().default(2026),
    currentSeason: termSeasonSchema.default("fall"),
    rangeStartYear: z.number().int().default(2026),
    rangeEndYear: z.number().int().default(2028)
  })
});

export type AppDataInput = z.infer<typeof appDataSchema>;

export const plannerLayoutExportSchema = z.object({
  exportType: z.literal(plannerLayoutExportType),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  settings: z.object({
    currentYear: z.number().int(),
    currentSeason: termSeasonSchema,
    rangeStartYear: z.number().int(),
    rangeEndYear: z.number().int(),
    selectedTermId: termIdSchema
  }),
  plan: z.object({
    name: z.string(),
    degreePlan: degreePlanSchema,
    semesterSchedules: z.array(semesterScheduleVersionSchema),
    notes: z.string().optional()
  }),
  courses: z.array(courseSchema),
  sections: z.array(courseSectionSchema)
});

export type PlannerLayoutExportInput = z.infer<typeof plannerLayoutExportSchema>;

export function parseImportedAppData(value: unknown): AppDataInput {
  return appDataSchema.parse(value);
}

export function parseImportedPlannerLayoutExport(value: unknown): PlannerLayoutExportInput {
  return plannerLayoutExportSchema.parse(value);
}
