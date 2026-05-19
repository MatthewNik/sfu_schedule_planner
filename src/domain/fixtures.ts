import { createId, nowIso } from "./ids";
import { createTerms, makeTermId } from "./terms";
import type {
  AppData,
  Course,
  CourseSection,
  DegreeTerm,
  PlannedCourse,
  RequirementTemplate,
  SemesterScheduleVersion
} from "./types";

const course = (
  subject: string,
  number: string,
  title: string,
  units: number,
  historicalOfferings: Course["historicalOfferings"],
  prerequisitesText?: string,
  designation?: string
): Course => ({
  id: `${subject} ${number}`,
  subject,
  number,
  title,
  units,
  prerequisitesText,
  designation,
  source: "seed",
  historicalOfferings
});

const courses: Course[] = [
  course("CMPT", "120", "Introduction to Computing Science and Programming I", 3, [
    "2024-spring",
    "2024-summer",
    "2024-fall",
    "2025-spring",
    "2025-summer",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ]),
  course("CMPT", "125", "Introduction to Computing Science and Programming II", 3, [
    "2024-spring",
    "2024-summer",
    "2024-fall",
    "2025-spring",
    "2025-summer",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ], "CMPT 120"),
  course("CMPT", "225", "Data Structures and Programming", 3, [
    "2024-spring",
    "2024-fall",
    "2025-spring",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ], "CMPT 125 and MACM 101"),
  course("CMPT", "276", "Introduction to Software Engineering", 3, [
    "2024-summer",
    "2024-fall",
    "2025-summer",
    "2025-fall",
    "2026-fall"
  ], "CMPT 225"),
  course("CMPT", "295", "Introduction to Computer Systems", 3, [
    "2024-spring",
    "2024-fall",
    "2025-spring",
    "2025-fall",
    "2026-spring"
  ], "CMPT 125 and MACM 101"),
  course("CMPT", "300", "Operating Systems I", 3, [
    "2024-spring",
    "2024-fall",
    "2025-spring",
    "2025-fall",
    "2026-fall"
  ], "CMPT 225 and CMPT 295"),
  course("CMPT", "307", "Data Structures and Algorithms", 3, [
    "2024-spring",
    "2025-spring",
    "2026-spring"
  ], "CMPT 225, MACM 101 and MATH 152"),
  course("CMPT", "354", "Database Systems I", 3, [
    "2024-summer",
    "2025-summer",
    "2026-summer"
  ], "CMPT 225"),
  course("MACM", "101", "Discrete Mathematics I", 3, [
    "2024-spring",
    "2024-summer",
    "2024-fall",
    "2025-spring",
    "2025-summer",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ], undefined, "Quantitative"),
  course("MATH", "151", "Calculus I", 3, [
    "2024-spring",
    "2024-summer",
    "2024-fall",
    "2025-spring",
    "2025-summer",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ], undefined, "Quantitative"),
  course("MATH", "152", "Calculus II", 3, [
    "2024-spring",
    "2024-summer",
    "2024-fall",
    "2025-spring",
    "2025-summer",
    "2025-fall",
    "2026-spring",
    "2026-fall"
  ], "MATH 151", "Quantitative"),
  course("STAT", "270", "Introduction to Probability and Statistics", 3, [
    "2024-spring",
    "2024-fall",
    "2025-spring",
    "2025-fall",
    "2026-spring"
  ], "MATH 152", "Quantitative")
];

const sections: CourseSection[] = [
  {
    id: "CMPT 225-2026-fall-D100",
    courseId: "CMPT 225",
    termId: "2026-fall",
    label: "D100",
    title: "Data Structures and Programming",
    classType: "enrollment",
    sectionCode: "LEC",
    meetings: [
      {
        id: "CMPT225-D100-LEC",
        days: ["MO", "WE"],
        startTime: "10:30",
        endTime: "12:20",
        campus: "Burnaby",
        sectionCode: "LEC"
      }
    ]
  },
  {
    id: "CMPT 276-2026-fall-D100",
    courseId: "CMPT 276",
    termId: "2026-fall",
    label: "D100",
    title: "Introduction to Software Engineering",
    classType: "enrollment",
    sectionCode: "LEC",
    meetings: [
      {
        id: "CMPT276-D100-LEC",
        days: ["MO", "WE"],
        startTime: "11:30",
        endTime: "13:20",
        campus: "Surrey",
        sectionCode: "LEC"
      }
    ]
  },
  {
    id: "MATH 152-2026-fall-D100",
    courseId: "MATH 152",
    termId: "2026-fall",
    label: "D100",
    title: "Calculus II",
    classType: "enrollment",
    sectionCode: "LEC",
    meetings: [
      {
        id: "MATH152-D100-LEC",
        days: ["TU", "TH"],
        startTime: "09:30",
        endTime: "11:20",
        campus: "Burnaby",
        sectionCode: "LEC"
      }
    ]
  }
];

function initialPlannedCourses(): PlannedCourse[] {
  return [
    {
      id: createId("planned"),
      courseId: "CMPT 225",
      termId: "2026-fall",
      selectedSectionIds: ["CMPT 225-2026-fall-D100"]
    },
    {
      id: createId("planned"),
      courseId: "CMPT 276",
      termId: "2026-fall",
      selectedSectionIds: ["CMPT 276-2026-fall-D100"]
    }
  ];
}

function initialTerms(plannedCourses: PlannedCourse[]): DegreeTerm[] {
  const plannedByTerm = new Map<string, string[]>();
  plannedCourses.forEach((planned) => {
    plannedByTerm.set(planned.termId, [...(plannedByTerm.get(planned.termId) ?? []), planned.id]);
  });

  return createTerms(2026, 3).map(({ id, year, season }) => ({
    id,
    year,
    season,
    termType: id === makeTermId(2027, "summer") ? "co-op" : "study",
    plannedCourseIds: plannedByTerm.get(id) ?? [],
    maxUnits: season === "summer" ? 9 : 12,
    preferredCourseCount: season === "summer" ? 2 : 4,
    allowCoursesDuringBlockedTerm: false
  }));
}

function requirementTemplate(): RequirementTemplate {
  return {
    id: "template-cmpt-local",
    name: "Computing Science Planning Template",
    calendarYear: "2026/2027",
    source: "local_editable",
    notes:
      "Planning template only. Edit it to match your official SFU calendar requirements.",
    groups: [
      {
        id: "req-lower-core",
        type: "required_courses",
        label: "Lower-division core",
        courseIds: ["CMPT 120", "CMPT 125", "CMPT 225", "MACM 101", "MATH 151", "MATH 152"]
      },
      {
        id: "req-upper-cmpt",
        type: "choose_n",
        label: "Upper-division CMPT sample choices",
        courseIds: ["CMPT 300", "CMPT 307", "CMPT 354"],
        chooseCount: 2
      },
      {
        id: "req-total-units",
        type: "unit_minimum",
        label: "Total units",
        courseIds: [],
        unitMinimum: 120
      },
      {
        id: "req-wqb-q",
        type: "designation",
        label: "Quantitative designation",
        courseIds: [],
        designation: "Quantitative",
        unitMinimum: 6
      }
    ]
  };
}

export function createInitialAppData(): AppData {
  const plannedCourses = initialPlannedCourses();
  const terms = initialTerms(plannedCourses);
  const createdAt = nowIso();
  const schedule: SemesterScheduleVersion = {
    id: createId("schedule"),
    termId: "2026-fall",
    name: "Fall 2026 Schedule A",
    active: true,
    createdAt,
    updatedAt: createdAt,
    selectedSectionIdsByPlannedCourseId: Object.fromEntries(
      plannedCourses.map((planned) => [planned.id, planned.selectedSectionIds])
    )
  };

  return {
    schemaVersion: 1,
    courses,
    sections,
    programProfiles: [
      {
        id: "profile-default",
        major: "Computing Science",
        secondMajor: "",
        minor: "",
        concentration: "",
        calendarYear: "2026/2027",
        transferCredits: 0,
        completedCourses: ["CMPT 120", "CMPT 125", "MACM 101", "MATH 151"],
        remainingCourses: ["CMPT 225", "CMPT 276", "CMPT 295", "MATH 152", "STAT 270"],
        substitutions: [],
        waivedRequirements: [],
        notes: ""
      }
    ],
    requirementTemplates: [requirementTemplate()],
    planVersions: [
      {
        id: "plan-active",
        name: "Plan 1",
        type: "long_term_plan",
        active: true,
        createdAt,
        updatedAt: createdAt,
        degreePlan: {
          terms,
          plannedCourses
        },
        semesterSchedules: [schedule],
        warningSnapshots: [],
        acknowledgedWarningFingerprints: [],
        requirementProgress: [],
        notes: "Local planning draft."
      }
    ],
    forecasts: [],
    settings: {
      hideLowSeverityWarnings: false,
      selectedTermId: "2026-fall",
      activeView: "planner",
      currentYear: 2026,
      currentSeason: "fall",
      rangeStartYear: 2026,
      rangeEndYear: 2028
    }
  };
}

export function createClearedAppData(): AppData {
  const terms = initialTerms([]);
  const createdAt = nowIso();

  return {
    schemaVersion: 1,
    courses,
    sections: [],
    programProfiles: [
      {
        id: "profile-default",
        major: "",
        secondMajor: "",
        minor: "",
        concentration: "",
        calendarYear: "",
        transferCredits: 0,
        completedCourses: [],
        remainingCourses: [],
        substitutions: [],
        waivedRequirements: [],
        notes: ""
      }
    ],
    requirementTemplates: [requirementTemplate()],
    planVersions: [
      {
        id: "plan-active",
        name: "Plan 1",
        type: "long_term_plan",
        active: true,
        createdAt,
        updatedAt: createdAt,
        degreePlan: {
          terms,
          plannedCourses: []
        },
        semesterSchedules: [],
        warningSnapshots: [],
        acknowledgedWarningFingerprints: [],
        requirementProgress: [],
        notes: ""
      }
    ],
    forecasts: [],
    settings: {
      hideLowSeverityWarnings: false,
      selectedTermId: "2026-fall",
      activeView: "planner",
      currentYear: 2026,
      currentSeason: "fall",
      rangeStartYear: 2026,
      rangeEndYear: 2028
    }
  };
}
