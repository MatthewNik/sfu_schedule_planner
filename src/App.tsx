import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  GraduationCap,
  GripVertical,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAvailabilityConfidence, getCourse, getPlannedCoursesForTerm } from "./domain/course-utils";
import { buildCourseDetailModel, historicalTermsFor, isOfficialSection, type CourseDetailModel } from "./domain/course-details";
import {
  createPlaceholderCourse,
  extractCourseCodesFromPlainText,
  findMatchingCourses,
  getPossiblePlacements,
  parseCourseSearchQuery
} from "./domain/course-search";
import { createGraduationForecast } from "./domain/forecast";
import { createId, nowIso } from "./domain/ids";
import {
  createPlannerLayoutExport,
  importPlannerLayoutExport,
  plannerLayoutExportFilename
} from "./domain/planner-layout-export";
import { evaluateRequirementProgress } from "./domain/requirements";
import {
  parseImportedAppData,
  parseImportedPlannerLayoutExport,
  plannerLayoutExportType
} from "./domain/schemas";
import { collectTermCatalogCourses } from "./domain/term-catalog";
import { compareTermIds, makeTermId, nextTermId, parseTermId, reconcilePlanningRange, termLabel } from "./domain/terms";
import { generateWarnings } from "./domain/warnings";
import {
  fetchSfuCourseNumbersForSubject,
  fetchSfuCourseWithSections,
  getSfuDepartments,
  type SfuListItem
} from "./services/sfuApi";
import { clearAllPlannerData, loadAppData, saveAppData } from "./storage/database";
import type {
  AppData,
  Course,
  CourseSection,
  DegreeTerm,
  PlanVersion,
  PlannedCourse,
  RequirementGroup,
  SemesterScheduleVersion,
  TermId,
  TermSeason,
  TermType,
  Weekday
} from "./domain/types";

const dayIndex: Record<Weekday, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
};

const viewTabs: Array<{
  view: AppData["settings"]["activeView"];
  Icon: LucideIcon;
  label: string;
}> = [
  { view: "planner", Icon: CalendarDays, label: "Planner" }
];

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function activePlan(data: AppData): PlanVersion {
  return (
    data.planVersions.find((plan) => plan.type === "long_term_plan" && plan.active) ??
    data.planVersions[0]
  );
}

function activeSchedule(plan: PlanVersion, termId: TermId): SemesterScheduleVersion | undefined {
  return plan.semesterSchedules.find((schedule) => schedule.termId === termId && schedule.active);
}

function mergeCourse(existing: Course | undefined, incoming: Course): Course {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    historicalOfferings: [...new Set([...existing.historicalOfferings, ...incoming.historicalOfferings])]
  };
}

function mergeSections(existing: CourseSection[], incoming: CourseSection[]): CourseSection[] {
  const byId = new Map(existing.map((section) => [section.id, section]));
  incoming.forEach((section) => {
    byId.set(section.id, section);
  });
  return [...byId.values()].sort((left, right) =>
    left.courseId.localeCompare(right.courseId) ||
    compareTermIds(left.termId, right.termId) ||
    left.label.localeCompare(right.label)
  );
}

function sfuCourseNumber(item: SfuListItem): string | undefined {
  const value = item.value ?? item.text ?? item.title;
  return value?.match(/[0-9]{3}[A-Z]?/i)?.[0]?.toUpperCase();
}

function sfuCourseTitle(item: SfuListItem, number: string): string {
  const title = item.title ?? item.text ?? "";
  return title.replace(number, "").replace(/^[-:\s]+/, "").trim();
}

function catalogSearchTerms(
  data: AppData,
  plan: PlanVersion,
  offeredIn?: TermId
): Array<{ year: number; season: TermSeason; termId: TermId }> {
  if (offeredIn) {
    const parsed = parseTermId(offeredIn);
    return [{ year: parsed.year, season: parsed.season, termId: offeredIn }];
  }

  return sfuCatalogSearchTerms(data, plan);
}

function sfuCatalogSearchTerms(data: AppData, plan: PlanVersion): Array<{ year: number; season: TermSeason; termId: TermId }> {
  const byTermId = new Map<TermId, { year: number; season: TermSeason; termId: TermId }>();
  for (let year = data.settings.currentYear - 10; year <= data.settings.currentYear + 10; year += 1) {
    (["spring", "summer", "fall"] as const).forEach((season) => {
      const termId = `${year}-${season}` as TermId;
      byTermId.set(termId, { year, season, termId });
    });
  }
  plan.degreePlan.terms.forEach((term) => {
    byTermId.set(term.id, { year: term.year, season: term.season, termId: term.id });
  });

  return [...byTermId.values()].sort((left, right) => compareTermIds(left.termId, right.termId));
}

function normalizeAppData(data: AppData): AppData {
  const selectedTerm = parseTermId(data.settings.selectedTermId);
  const currentYear = data.settings.currentYear ?? selectedTerm.year;
  const currentSeason = data.settings.currentSeason ?? selectedTerm.season;
  const rangeStartYear = data.settings.rangeStartYear ?? currentYear;
  const rangeEndYear = data.settings.rangeEndYear ?? currentYear + 2;
  const longTermPlans = data.planVersions.filter((plan) => plan.type === "long_term_plan");
  const settings = {
    ...data.settings,
    activeView: "planner" as const,
    currentYear,
    currentSeason,
    rangeStartYear,
    rangeEndYear
  };
  const active = activePlan({ ...data, settings });
  const reconciled = reconcilePlanningRange(active.degreePlan.terms, settings.selectedTermId, settings);

  return {
    ...data,
    planVersions: data.planVersions.map((plan) =>
      plan.id === active.id
        ? {
            ...(longTermPlans.length === 1 && plan.id === "plan-active" && plan.name.startsWith("Plan A:")
              ? { ...plan, name: "Plan 1" }
              : plan),
            degreePlan: { ...plan.degreePlan, terms: reconciled.terms }
          }
        : longTermPlans.length === 1 && plan.id === "plan-active" && plan.name.startsWith("Plan A:")
          ? { ...plan, name: "Plan 1" }
          : plan
    ),
    settings: { ...settings, ...reconciled.settings, selectedTermId: reconciled.selectedTermId }
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function exactCourseMatch(query: string, courses: Course[]): Course | undefined {
  const normalized = normalizeSearchText(query);
  return courses.find((course) => {
    return (
      normalizeSearchText(course.id) === normalized ||
      normalizeSearchText(`${course.id} ${course.title}`) === normalized
    );
  });
}

function nextPlanName(plans: PlanVersion[]): string {
  const used = new Set(plans.map((candidate) => candidate.name.trim().toUpperCase()));
  let index = 1;
  while (used.has(`PLAN ${index}`)) {
    index += 1;
  }
  return `Plan ${index}`;
}

function DraggableCourseCard({
  planned,
  course,
  terms,
  sections,
  onMove,
  onSelectSection,
  onOpenDetails,
  onRemove
}: {
  planned: PlannedCourse;
  course?: Course;
  terms: DegreeTerm[];
  sections: CourseSection[];
  onMove: (termId: TermId) => void;
  onSelectSection: (sectionId: string) => void;
  onOpenDetails: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: planned.id
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={classNames("course-card", isDragging && "dragging")}
      onClick={onOpenDetails}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails();
        }
      }}
    >
      <div className="course-card-topline">
        <button
          type="button"
          className="drag-handle"
          aria-label={`Drag ${planned.courseId}`}
          onClick={(event) => event.stopPropagation()}
          {...listeners}
          {...attributes}
        >
          <GripVertical size={16} />
        </button>
        <div>
          <strong>{course?.id ?? planned.courseId}</strong>
          <span>{course?.title ?? "Unknown Course"}</span>
        </div>
      </div>
      <div className="course-card-meta">
        <span>{course?.units ?? 0} Units</span>
        <span className="select-wrap">
          <select
            aria-label={`Move ${planned.courseId} To Term`}
            value={planned.termId}
            onChange={(event) => onMove(event.target.value as TermId)}
            onClick={(event) => event.stopPropagation()}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {termLabel(term.id)}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
        {sections.length ? (
          <span className="select-wrap">
            <select
              aria-label={`Select ${planned.courseId} Section`}
              value={planned.selectedSectionIds[0] ?? ""}
              onChange={(event) => onSelectSection(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            >
              <option value="">No Section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        ) : null}
        <button
          type="button"
          className="icon-button subtle"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetails();
          }}
          aria-label={`Show ${planned.courseId} Details`}
        >
          <Info size={15} />
        </button>
        <button
          type="button"
          className="icon-button subtle"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label="Remove Course"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function TermColumn({
  data,
  term,
  terms,
  plannedCourses,
  onRemoveCourse,
  onMoveCourse,
  onSelectSection,
  onOpenCourseDetails,
  previewCourse,
  previewPlacement,
  onPlacePreview,
  onUpdateTerm
}: {
  data: AppData;
  term: DegreeTerm;
  terms: DegreeTerm[];
  plannedCourses: PlannedCourse[];
  onRemoveCourse: (plannedCourseId: string) => void;
  onMoveCourse: (plannedCourseId: string, toTermId: TermId) => void;
  onSelectSection: (plannedCourseId: string, termId: TermId, sectionId: string) => void;
  onOpenCourseDetails: (planned: PlannedCourse) => void;
  previewCourse?: Course;
  previewPlacement?: ReturnType<typeof getPossiblePlacements>[number];
  onPlacePreview: (courseId: string, termId: TermId) => void;
  onUpdateTerm: (termId: TermId, patch: Partial<DegreeTerm>) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: term.id });
  const units = plannedCourses.reduce((sum, planned) => {
    return sum + (getCourse(data.courses, planned.courseId)?.units ?? 0);
  }, 0);

  return (
    <section
      ref={setNodeRef}
      className={classNames("term-column", isOver && "drop-target", ["co-op", "off"].includes(term.termType) && "blocked-term")}
    >
      <header className="term-header">
        <div>
          <h3>{term.customLabel || termLabel(term.id)}</h3>
          <p>{units} units</p>
        </div>
        <span className="select-wrap">
          <select
            aria-label={`Term Type For ${termLabel(term.id)}`}
            value={term.termType}
            onChange={(event) => onUpdateTerm(term.id, { termType: event.target.value as TermType })}
          >
            <option value="study">Study</option>
            <option value="co-op">Co-op</option>
            <option value="off">Off</option>
            <option value="part-time">Part-Time</option>
            <option value="custom">Custom</option>
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </header>
      <div className={classNames("course-stack", plannedCourses.length === 0 && !previewPlacement && "empty")}>
        {previewCourse && previewPlacement ? (
          <button
            type="button"
            className={classNames("ghost-course-card", `availability-${previewPlacement.confidence}`)}
            title={previewPlacement.reason}
            onClick={() => onPlacePreview(previewCourse.id, term.id)}
          >
            <strong>{previewCourse.id}</strong>
            <span>{previewCourse.title}</span>
            <small>{previewPlacement.confidence}</small>
          </button>
        ) : null}
        {plannedCourses.map((planned) => (
          <DraggableCourseCard
            key={planned.id}
            planned={planned}
            course={getCourse(data.courses, planned.courseId)}
            terms={terms}
            sections={data.sections.filter(
              (section) => section.courseId === planned.courseId && section.termId === planned.termId && isOfficialSection(section)
            )}
            onMove={(termId) => onMoveCourse(planned.id, termId)}
            onSelectSection={(sectionId) => onSelectSection(planned.id, planned.termId, sectionId)}
            onOpenDetails={() => onOpenCourseDetails(planned)}
            onRemove={() => onRemoveCourse(planned.id)}
          />
        ))}
        {plannedCourses.length === 0 && !previewPlacement ? (
          <p className="empty-state">Drop Or Add Courses Here.</p>
        ) : null}
      </div>
    </section>
  );
}

function formatFetchedAt(value?: string): string {
  if (!value) {
    return "Not checked yet";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDays(days: Weekday[]): string {
  return days.length ? days.join(", ") : "Days TBA";
}

function sourceLabel(detail: CourseDetailModel | undefined): string {
  if (!detail) {
    return "Cached local data";
  }
  if (detail.source === "official") {
    return "Official SFU data";
  }
  if (detail.source === "fallback") {
    return "Historical SFU fallback";
  }
  return "Cached local data";
}

function CourseDetailPanel({
  planned,
  course,
  detail,
  loading,
  error,
  onClose,
  onSelectSection
}: {
  planned?: PlannedCourse;
  course?: Course;
  detail?: CourseDetailModel;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSelectSection: (sectionId: string) => void;
}) {
  if (!planned) {
    return null;
  }

  const confirmedSections = detail?.confirmedSections ?? [];
  const selectedSectionId = planned.selectedSectionIds[0] ?? "";

  return (
    <aside className="course-detail-panel" aria-label="Course Details">
      <header className="course-detail-header">
        <div>
          <p>{sourceLabel(detail)}</p>
          <h2>{course?.id ?? planned.courseId}</h2>
          <span>{course?.title ?? "Unknown Course"}</span>
        </div>
        <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close Course Details">
          <X size={17} />
        </button>
      </header>

      <div className="course-detail-trust">
        <span>{course?.units ?? 0} credits</span>
        <span>Fetched: {formatFetchedAt(detail?.lastFetchedAt)}</span>
      </div>

      {loading ? <p className="detail-status">Checking Official SFU Course Outlines...</p> : null}
      {error ? <p className="detail-error">{error}</p> : null}

      <section className="detail-section">
        <h3>Description</h3>
        <p>{course?.description || "No course description is available in the local planner yet."}</p>
      </section>

      <section className="detail-section">
        <h3>Prerequisites</h3>
        <p>{course?.prerequisitesText || "No prerequisites listed."}</p>
      </section>

      {course?.corequisitesText ? (
        <section className="detail-section">
          <h3>Corequisites</h3>
          <p>{course.corequisitesText}</p>
        </section>
      ) : null}

      <section className="detail-section">
        <h3>Sections</h3>
        {confirmedSections.length ? (
          <>
            <label className="stacked-field">
              Selected Section
              <select value={selectedSectionId} onChange={(event) => onSelectSection(event.target.value)}>
                <option value="">No Section Selected</option>
                {confirmedSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="detail-section-list">
              {confirmedSections.map((section) => (
                <article key={section.id} className={classNames("detail-section-card", selectedSectionId === section.id && "active")}>
                  <div>
                    <strong>{section.label}</strong>
                    <span>{section.sectionCode ?? "Section"}</span>
                  </div>
                  <p>
                    {(section.instructors ?? []).map((instructor) => instructor.name).join(", ") || "Instructor TBA"}
                  </p>
                  {section.meetings.length ? (
                    <ul>
                      {section.meetings.map((meeting) => (
                        <li key={meeting.id}>
                          {formatDays(meeting.days)} {meeting.startTime}-{meeting.endTime}
                          {meeting.campus ? `, ${meeting.campus}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Day/time TBA</p>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p>No official section data posted for {termLabel(planned.termId)} yet.</p>
        )}
      </section>

      {!confirmedSections.length ? (
        <section className="detail-section">
          <h3>Historical Context</h3>
          {detail?.pastInstructors.length ? (
            <div className="past-instructor-list">
              {detail.pastInstructors.map((instructor) => (
                <p key={`${instructor.name}-${instructor.email ?? ""}`}>
                  <strong>{instructor.name}</strong>
                  <span>{instructor.terms.map(termLabel).join(", ")}</span>
                </p>
              ))}
            </div>
          ) : (
            <p>No past instructor data found in the last 3 years.</p>
          )}
          {detail?.historicalOfferings.length ? (
            <p>Known offerings: {detail.historicalOfferings.map(termLabel).join(", ")}</p>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [offeringFilter, setOfferingFilter] = useState<TermId | "">("");
  const [plannerSearchOpen, setPlannerSearchOpen] = useState(false);
  const [placementPreviewCourseId, setPlacementPreviewCourseId] = useState<string | null>(null);
  const [plannerSearchStatus, setPlannerSearchStatus] = useState("");
  const [completedQuery, setCompletedQuery] = useState("");
  const [completedSearchOpen, setCompletedSearchOpen] = useState(false);
  const [remainingQuery, setRemainingQuery] = useState("");
  const [remainingSearchOpen, setRemainingSearchOpen] = useState(false);
  const [remainingPasteText, setRemainingPasteText] = useState("");
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [importError, setImportError] = useState("");
  const [selectedDetailPlannedCourseId, setSelectedDetailPlannedCourseId] = useState<string | null>(null);
  const [courseDetailLoadingKey, setCourseDetailLoadingKey] = useState<string | null>(null);
  const [courseDetailError, setCourseDetailError] = useState("");
  const didLoad = useRef(false);
  const fetchedCatalogKeys = useRef(new Set<string>());
  const catalogStatusKey = useRef("");
  const dataRef = useRef<AppData | null>(null);
  const planRef = useRef<PlanVersion | null>(null);
  const searchSubjectRef = useRef<string | undefined>(undefined);
  const fetchedDetailKeys = useRef(new Set<string>());
  const plannerComboboxRef = useRef<HTMLDivElement>(null);
  const completedComboboxRef = useRef<HTMLDivElement>(null);
  const remainingComboboxRef = useRef<HTMLDivElement>(null);
  const planNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAppData()
      .then((loaded) => {
        setData(normalizeAppData(loaded));
        didLoad.current = true;
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Unable To Load Planner Data.");
      });
  }, []);

  useEffect(() => {
    function closeComboboxes(event: Event) {
      const target = event.target as Node;
      if (!plannerComboboxRef.current?.contains(target)) {
        setPlannerSearchOpen(false);
      }
      if (!completedComboboxRef.current?.contains(target)) {
        setCompletedSearchOpen(false);
      }
      if (!remainingComboboxRef.current?.contains(target)) {
        setRemainingSearchOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeComboboxes);
    document.addEventListener("focusin", closeComboboxes);
    return () => {
      document.removeEventListener("pointerdown", closeComboboxes);
      document.removeEventListener("focusin", closeComboboxes);
    };
  }, []);

  useEffect(() => {
    function cancelPlacement(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPlacementPreviewCourseId(null);
      }
    }

    document.addEventListener("keydown", cancelPlacement);
    return () => document.removeEventListener("keydown", cancelPlacement);
  }, []);

  useEffect(() => {
    if (!data || !didLoad.current) {
      return;
    }

    const handle = window.setTimeout(() => {
      void saveAppData(data);
    }, 300);

    return () => window.clearTimeout(handle);
  }, [data]);

  const computed = useMemo(() => {
    if (!data) {
      return null;
    }

    const plan = activePlan(data);
    const profile = data.programProfiles[0];
    const template = data.requirementTemplates[0];
    const progress = profile && template ? evaluateRequirementProgress(data, profile, template, plan) : [];
    const warnings = generateWarnings(data, plan);
    const forecast = createGraduationForecast(data, plan, progress);
    return { plan, profile, template, progress, warnings, forecast };
  }, [data]);

  const parsedCourseQuery = useMemo(() => parseCourseSearchQuery(courseQuery), [courseQuery]);
  const plannerSearchQuery = useMemo(
    () => ({
      ...parsedCourseQuery,
      offeredIn: offeringFilter || undefined
    }),
    [offeringFilter, parsedCourseQuery]
  );
  const plannerSearchResults = useMemo(() => {
    return findMatchingCourses(plannerSearchQuery, data?.courses ?? []).slice(0, 40);
  }, [data?.courses, plannerSearchQuery]);
  const completedSearchResults = useMemo(() => {
    return findMatchingCourses(completedQuery, data?.courses ?? []).slice(0, 10);
  }, [completedQuery, data?.courses]);
  const remainingSearchResults = useMemo(() => {
    return findMatchingCourses(remainingQuery, data?.courses ?? []).slice(0, 10);
  }, [remainingQuery, data?.courses]);
  const previewCourse = useMemo(() => {
    return data?.courses.find((course) => course.id === placementPreviewCourseId);
  }, [data?.courses, placementPreviewCourseId]);
  const previewPlacements = useMemo(() => {
    if (!previewCourse || !computed) {
      return [];
    }
    return getPossiblePlacements(previewCourse, computed.plan.degreePlan.terms);
  }, [computed, previewCourse]);

  dataRef.current = data;
  planRef.current = computed?.plan ?? null;
  searchSubjectRef.current = parsedCourseQuery.subject;

  function mergeFoundCourses(found: Course[]) {
    if (found.length === 0) {
      return;
    }
    setData((current) => {
      if (!current) {
        return current;
      }

      const byId = new Map(current.courses.map((course) => [course.id, course]));
      found.forEach((course) => {
        byId.set(course.id, mergeCourse(byId.get(course.id), course));
      });
      return { ...current, courses: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
    });
  }

  useEffect(() => {
    const currentData = dataRef.current;
    const currentPlan = planRef.current;
    if (!currentData || !currentPlan || !parsedCourseQuery.subject || parsedCourseQuery.subject.length < 2) {
      return;
    }

    const subject = parsedCourseQuery.subject;
    const offeredIn = offeringFilter || undefined;
    const terms = catalogSearchTerms(currentData, currentPlan, offeredIn);
    const cacheKey = `${subject}|${terms.map((term) => term.termId).join(",")}`;
    if (fetchedCatalogKeys.current.has(cacheKey)) {
      if (!offeredIn && catalogStatusKey.current !== cacheKey) {
        catalogStatusKey.current = cacheKey;
        setPlannerSearchStatus(`Showing ${subject} courses from all terms.`);
      }
      return;
    }
    fetchedCatalogKeys.current.add(cacheKey);
    catalogStatusKey.current = cacheKey;
    let cancelled = false;
    const termNote = offeredIn ? ` For ${termLabel(offeredIn)}` : "";

    const handle = window.setTimeout(() => {
      if (!offeredIn) {
        setPlannerSearchStatus(`Searching SFU For ${subject}...`);
      }
      void Promise.allSettled(
        terms.map(async (term) => {
          const items = await fetchSfuCourseNumbersForSubject(term.year, term.season, subject);
          return items
            .map((item) => {
              const number = sfuCourseNumber(item);
              if (!number) {
                return undefined;
              }
              return createPlaceholderCourse(subject, number, sfuCourseTitle(item, number), term.termId);
            })
            .filter((course): course is Course => Boolean(course));
        })
      ).then((results) => {
        if (cancelled) {
          return;
        }

        const found = results.flatMap((result) =>
          result.status === "fulfilled" ? result.value : []
        );
        if (found.length === 0) {
          if (!offeredIn) {
            setPlannerSearchStatus("No Additional SFU Courses Found.");
          }
          return;
        }

        mergeFoundCourses(found);
        if (!offeredIn) {
          setPlannerSearchStatus(`Found ${found.length} SFU Offering Match${found.length === 1 ? "" : "es"}.`);
        } else {
          setPlannerSearchStatus(`Found ${subject} courses offered${termNote}.`);
        }
      });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [offeringFilter, parsedCourseQuery.subject]);

  useEffect(() => {
    const offeredIn = offeringFilter || undefined;
    if (!offeredIn) {
      return;
    }

    const cacheKey = `all-subjects|${offeredIn}`;
    if (fetchedCatalogKeys.current.has(cacheKey)) {
      return;
    }
    fetchedCatalogKeys.current.add(cacheKey);
    const { year, season } = parseTermId(offeredIn);
    let cancelled = false;
    let finished = false;
    const label = termLabel(offeredIn);

    const handle = window.setTimeout(() => {
      setPlannerSearchStatus(`Searching every SFU subject for ${label}...`);
      void getSfuDepartments(year, season)
        .then((departments) =>
          collectTermCatalogCourses(
            departments,
            (department) => fetchSfuCourseNumbersForSubject(year, season, department),
            offeredIn,
            {
              prioritySubject: searchSubjectRef.current,
              isCancelled: () => cancelled,
              onBatch: (courses, progress) => {
                if (cancelled) {
                  return;
                }
                mergeFoundCourses(courses);
                const complete = progress.total > 0 && progress.done >= progress.total;
                if (complete) {
                  finished = true;
                }
                setPlannerSearchStatus(
                  complete
                    ? `Loaded SFU courses offered in ${label}.`
                    : `Searching SFU subjects (${progress.done}/${progress.total}) for ${label}...`
                );
              }
            }
          )
        )
        .then(() => {
          finished = true;
        })
        .catch(() => {
          fetchedCatalogKeys.current.delete(cacheKey);
          if (!cancelled) {
            setPlannerSearchStatus(`Could not load every subject for ${label}.`);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      if (!finished) {
        fetchedCatalogKeys.current.delete(cacheKey);
      }
    };
  }, [offeringFilter]);

  if (loadError) {
    return <main className="loading-screen">Could Not Load Planner Data: {loadError}</main>;
  }

  if (!data || !computed) {
    return <main className="loading-screen">Loading Planner...</main>;
  }

  const currentData = data;
  const plan = computed.plan;
  const currentTermId = makeTermId(data.settings.currentYear, data.settings.currentSeason);
  const nextSemesterId = nextTermId(currentTermId);
  const pinnedOfferingIds = new Set<TermId>([currentTermId, nextSemesterId]);
  const extraOfferingTerms = [...plan.degreePlan.terms]
    .filter((term) => !pinnedOfferingIds.has(term.id))
    .sort((left, right) => compareTermIds(left.id, right.id));
  const selectedTermId = data.settings.selectedTermId;
  const selectedTerm =
    plan.degreePlan.terms.find((term) => term.id === selectedTermId) ?? plan.degreePlan.terms[0];
  const longTermPlans = data.planVersions.filter((candidate) => candidate.type === "long_term_plan");

  function patchData(updater: (current: AppData) => AppData) {
    setData((current) => (current ? updater(current) : current));
  }

  function patchActivePlan(updater: (plan: PlanVersion) => PlanVersion) {
    patchData((current) => ({
      ...current,
      planVersions: current.planVersions.map((candidate) =>
        candidate.id === plan.id ? updater(candidate) : candidate
      )
    }));
  }

  async function fetchOfficialCourseDetails(planned: PlannedCourse, force = false) {
    const course = getCourse(currentData.courses, planned.courseId);
    const subject = course?.subject ?? planned.courseId.split(/\s+/)[0];
    const number = course?.number ?? planned.courseId.split(/\s+/)[1];
    const target = parseTermId(planned.termId);
    const cacheKey = `${planned.courseId}|${planned.termId}`;

    if (!subject || !number || (!force && fetchedDetailKeys.current.has(cacheKey))) {
      return;
    }

    setCourseDetailLoadingKey(cacheKey);
    setCourseDetailError("");

    try {
      let currentTermResult: { course?: Course; sections: CourseSection[] } = { sections: [] };
      let currentTermError: unknown;
      try {
        currentTermResult = await fetchSfuCourseWithSections(target.year, target.season, subject, number);
      } catch (error) {
        currentTermError = error;
      }

      const historicalResults = currentTermResult.sections.length
        ? []
        : await Promise.allSettled(
            historicalTermsFor(planned.termId).map((term) =>
              fetchSfuCourseWithSections(term.year, term.season, subject, number)
            )
          );
      const fulfilledHistorical = historicalResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const courses = [currentTermResult.course, ...fulfilledHistorical.map((result) => result.course)]
        .filter((candidate): candidate is Course => Boolean(candidate));
      const sections = [
        ...currentTermResult.sections,
        ...fulfilledHistorical.flatMap((result) => result.sections)
      ];

      if (courses.length || sections.length) {
        setData((current) => {
          if (!current) {
            return current;
          }

          const byId = new Map(current.courses.map((candidate) => [candidate.id, candidate]));
          courses.forEach((candidate) => {
            byId.set(candidate.id, mergeCourse(byId.get(candidate.id), candidate));
          });

          return {
            ...current,
            courses: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
            sections: mergeSections(current.sections, sections)
          };
        });
      }

      if (!courses.length && !sections.length && currentTermError) {
        setCourseDetailError(
          currentTermError instanceof Error
            ? currentTermError.message
            : "Unable to fetch official SFU course details."
        );
      }
      fetchedDetailKeys.current.add(cacheKey);
    } catch (error) {
      setCourseDetailError(error instanceof Error ? error.message : "Unable to fetch official SFU course details.");
    } finally {
      setCourseDetailLoadingKey((current) => (current === cacheKey ? null : current));
    }
  }

  function openCourseDetails(planned: PlannedCourse) {
    setSelectedDetailPlannedCourseId(planned.id);
    void fetchOfficialCourseDetails(planned);
  }

  function updateTerm(termId: TermId, patch: Partial<DegreeTerm>) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      updatedAt: nowIso(),
      degreePlan: {
        ...currentPlan.degreePlan,
        terms: currentPlan.degreePlan.terms.map((term) =>
          term.id === termId ? { ...term, ...patch } : term
        )
      }
    }));
  }

  function updatePlanningRange(
    patch: Partial<Pick<AppData["settings"], "currentYear" | "currentSeason" | "rangeStartYear" | "rangeEndYear">>
  ) {
    patchData((current) => {
      const currentPlan = activePlan(current);
      const proposedSettings = { ...current.settings, ...patch, activeView: "planner" as const };
      const reconciled = reconcilePlanningRange(
        currentPlan.degreePlan.terms,
        proposedSettings.selectedTermId,
        proposedSettings
      );

      return {
        ...current,
        settings: {
          ...proposedSettings,
          ...reconciled.settings,
          selectedTermId: reconciled.selectedTermId
        },
        planVersions: current.planVersions.map((candidate) =>
          candidate.id === currentPlan.id
            ? {
                ...candidate,
                updatedAt: nowIso(),
                degreePlan: { ...candidate.degreePlan, terms: reconciled.terms }
              }
            : candidate
        )
      };
    });
  }

  function selectPlan(planId: string) {
    patchData((current) => ({
      ...current,
      planVersions: current.planVersions.map((candidate) =>
        candidate.type === "long_term_plan"
          ? { ...candidate, active: candidate.id === planId }
          : candidate
      )
    }));
    setPlacementPreviewCourseId(null);
    setCourseQuery("");
    setPlannerSearchOpen(false);
    setEditingPlanName(false);
  }

  function createPlanVersion() {
    patchData((current) => {
      const currentPlan = activePlan(current);
      const createdAt = nowIso();
      const created: PlanVersion = {
        ...currentPlan,
        id: createId("plan"),
        name: nextPlanName(current.planVersions.filter((candidate) => candidate.type === "long_term_plan")),
        type: "long_term_plan",
        parentPlanId: currentPlan.id,
        active: true,
        createdAt,
        updatedAt: createdAt,
        degreePlan: {
          terms: currentPlan.degreePlan.terms.map((term) => ({ ...term, plannedCourseIds: [] })),
          plannedCourses: []
        },
        semesterSchedules: [],
        warningSnapshots: [],
        acknowledgedWarningFingerprints: [],
        requirementProgress: []
      };

      return {
        ...current,
        planVersions: [
          ...current.planVersions.map((candidate) =>
            candidate.type === "long_term_plan" ? { ...candidate, active: false } : candidate
          ),
          created
        ]
      };
    });
    setPlacementPreviewCourseId(null);
    setCourseQuery("");
    setPlannerSearchOpen(false);
    setEditingPlanName(false);
  }

  function togglePlanRename() {
    setEditingPlanName((current) => {
      const next = !current;
      if (!current) {
        window.requestAnimationFrame(() => {
          planNameInputRef.current?.focus();
          planNameInputRef.current?.select();
        });
      }
      return next;
    });
  }

  function deletePlan(planId: string) {
    if (longTermPlans.length <= 1) {
      return;
    }

    const deletingPlan = longTermPlans.find((candidate) => candidate.id === planId);
    if (!deletingPlan) {
      return;
    }

    if (!window.confirm(`Delete ${deletingPlan.name}? This cannot be undone.`)) {
      return;
    }

    patchData((current) => {
      const remainingPlans = current.planVersions.filter(
        (candidate) => candidate.type !== "long_term_plan" || candidate.id !== planId
      );
      const nextActivePlan =
        remainingPlans.find((candidate) => candidate.type === "long_term_plan" && candidate.active) ??
        remainingPlans.find((candidate) => candidate.type === "long_term_plan");

      return {
        ...current,
        planVersions: remainingPlans.map((candidate) =>
          candidate.type === "long_term_plan"
            ? { ...candidate, active: candidate.id === nextActivePlan?.id }
            : candidate
        )
      };
    });
    setPlacementPreviewCourseId(null);
    setCourseQuery("");
    setPlannerSearchOpen(false);
  }

  function movePlannedCourse(plannedCourseId: string, toTermId: TermId) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      updatedAt: nowIso(),
      degreePlan: {
        ...currentPlan.degreePlan,
        plannedCourses: currentPlan.degreePlan.plannedCourses.map((planned) =>
          planned.id === plannedCourseId ? { ...planned, termId: toTermId } : planned
        ),
        terms: currentPlan.degreePlan.terms.map((term) => {
          const withoutCourse = term.plannedCourseIds.filter((id) => id !== plannedCourseId);
          return term.id === toTermId
            ? { ...term, plannedCourseIds: [...withoutCourse, plannedCourseId] }
            : { ...term, plannedCourseIds: withoutCourse };
        })
      }
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) {
      return;
    }

    movePlannedCourse(String(event.active.id), String(event.over.id) as TermId);
  }

  function addCourseToTerm(courseId: string, termId: TermId) {
    const matchingSection = currentData.sections.find(
      (section) => section.courseId === courseId && section.termId === termId
    );
    const plannedCourse: PlannedCourse = {
      id: createId("planned"),
      courseId,
      termId,
      selectedSectionIds: matchingSection ? [matchingSection.id] : []
    };

    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      updatedAt: nowIso(),
      degreePlan: {
        ...currentPlan.degreePlan,
        plannedCourses: [...currentPlan.degreePlan.plannedCourses, plannedCourse],
        terms: currentPlan.degreePlan.terms.map((term) =>
          term.id === termId
            ? { ...term, plannedCourseIds: [...term.plannedCourseIds, plannedCourse.id] }
            : term
        )
      }
    }));
    setPlacementPreviewCourseId(null);
    setCourseQuery("");
    setPlannerSearchOpen(false);
  }

  function addCourseToSelectedTerm(courseId: string) {
    addCourseToTerm(courseId, selectedTerm.id);
  }

  function removePlannedCourse(plannedCourseId: string) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      updatedAt: nowIso(),
      degreePlan: {
        terms: currentPlan.degreePlan.terms.map((term) => ({
          ...term,
          plannedCourseIds: term.plannedCourseIds.filter((id) => id !== plannedCourseId)
        })),
        plannedCourses: currentPlan.degreePlan.plannedCourses.filter(
          (planned) => planned.id !== plannedCourseId
        )
      }
    }));
  }

  function updateProfile(field: string, value: string | number | string[]) {
    patchData((current) => ({
      ...current,
      programProfiles: current.programProfiles.map((profile, index) =>
        index === 0 ? { ...profile, [field]: value } : profile
      )
    }));
  }

  function addProfileCourse(field: "completedCourses" | "remainingCourses", courseId: string) {
    patchData((current) => ({
      ...current,
      programProfiles: current.programProfiles.map((profile, index) => {
        if (index !== 0) {
          return profile;
        }
        const currentCourses = field === "completedCourses"
          ? profile.completedCourses
          : profile.remainingCourses ?? [];
        return { ...profile, [field]: [...new Set([...currentCourses, courseId])] };
      })
    }));
  }

  function removeProfileCourse(field: "completedCourses" | "remainingCourses", courseId: string) {
    patchData((current) => ({
      ...current,
      programProfiles: current.programProfiles.map((profile, index) => {
        if (index !== 0) {
          return profile;
        }
        const currentCourses = field === "completedCourses"
          ? profile.completedCourses
          : profile.remainingCourses ?? [];
        return { ...profile, [field]: currentCourses.filter((candidate) => candidate !== courseId) };
      })
    }));
  }

  function pasteRemainingCourses() {
    const courseIds = extractCourseCodesFromPlainText(remainingPasteText);
    if (courseIds.length === 0) {
      return;
    }

    patchData((current) => ({
      ...current,
      programProfiles: current.programProfiles.map((profile, index) =>
        index === 0
          ? {
              ...profile,
              remainingCourses: [...new Set([...(profile.remainingCourses ?? []), ...courseIds])]
            }
          : profile
      )
    }));
    setRemainingPasteText("");
  }

  function updateRequirementGroup(groupId: string, patch: Partial<RequirementGroup>) {
    patchData((current) => ({
      ...current,
      requirementTemplates: current.requirementTemplates.map((template, index) =>
        index === 0
          ? {
              ...template,
              groups: template.groups.map((group) =>
                group.id === groupId ? { ...group, ...patch } : group
              )
            }
          : template
      )
    }));
  }

  function addRequirementGroup() {
    patchData((current) => ({
      ...current,
      requirementTemplates: current.requirementTemplates.map((template, index) =>
        index === 0
          ? {
              ...template,
              groups: [
                ...template.groups,
                {
                  id: createId("requirement"),
                  type: "required_courses",
                  label: "New required courses",
                  courseIds: [],
                  notes: ""
                }
              ]
            }
          : template
      )
    }));
  }

  function ensureSchedule(termId: TermId): SemesterScheduleVersion {
    const existing = activeSchedule(plan, termId);
    if (existing) {
      return existing;
    }

    const created: SemesterScheduleVersion = {
      id: createId("schedule"),
      termId,
      name: `${termLabel(termId)} Schedule A`,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      selectedSectionIdsByPlannedCourseId: {}
    };

    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      semesterSchedules: [
        ...currentPlan.semesterSchedules.map((schedule) =>
          schedule.termId === termId ? { ...schedule, active: false } : schedule
        ),
        created
      ]
    }));

    return created;
  }

  function updateSchedule(scheduleId: string, patch: Partial<SemesterScheduleVersion>) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      semesterSchedules: currentPlan.semesterSchedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, ...patch, updatedAt: nowIso() } : schedule
      )
    }));
  }

  function duplicateSchedule(schedule: SemesterScheduleVersion) {
    const duplicate: SemesterScheduleVersion = {
      ...schedule,
      id: createId("schedule"),
      name: `${schedule.name} copy`,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      semesterSchedules: [
        ...currentPlan.semesterSchedules.map((candidate) =>
          candidate.termId === schedule.termId ? { ...candidate, active: false } : candidate
        ),
        duplicate
      ]
    }));
  }

  function deleteSchedule(scheduleId: string) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      semesterSchedules: currentPlan.semesterSchedules.filter((schedule) => schedule.id !== scheduleId)
    }));
  }

  function selectSectionForTerm(plannedCourseId: string, termId: TermId, sectionId: string) {
    patchActivePlan((currentPlan) => ({
      ...currentPlan,
      semesterSchedules: (() => {
        const existing = activeSchedule(currentPlan, termId);
        const updatedSelections = {
          ...(existing?.selectedSectionIdsByPlannedCourseId ?? {}),
          [plannedCourseId]: sectionId ? [sectionId] : []
        };
        if (existing) {
          return currentPlan.semesterSchedules.map((schedule) =>
            schedule.id === existing.id
              ? { ...schedule, selectedSectionIdsByPlannedCourseId: updatedSelections, updatedAt: nowIso() }
              : schedule
          );
        }

        const createdAt = nowIso();
        const created: SemesterScheduleVersion = {
          id: createId("schedule"),
          termId,
          name: `${termLabel(termId)} Schedule A`,
          active: true,
          createdAt,
          updatedAt: createdAt,
          selectedSectionIdsByPlannedCourseId: updatedSelections
        };

        return [
          ...currentPlan.semesterSchedules.map((schedule) =>
            schedule.termId === termId ? { ...schedule, active: false } : schedule
          ),
          created
        ];
      })(),
      degreePlan: {
        ...currentPlan.degreePlan,
        plannedCourses: currentPlan.degreePlan.plannedCourses.map((planned) =>
          planned.id === plannedCourseId
            ? { ...planned, selectedSectionIds: sectionId ? [sectionId] : [] }
            : planned
        )
      }
    }));
  }

  function selectSection(plannedCourseId: string, sectionId: string) {
    selectSectionForTerm(plannedCourseId, selectedTerm.id, sectionId);
  }

  function exportJson() {
    const exportData = createPlannerLayoutExport(currentData, plan);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = plannerLayoutExportFilename(plan.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const raw = JSON.parse(await file.text());
      if (
        raw &&
        typeof raw === "object" &&
        "exportType" in raw &&
        raw.exportType === plannerLayoutExportType
      ) {
        const parsed = parseImportedPlannerLayoutExport(raw);
        setData((current) => (current ? normalizeAppData(importPlannerLayoutExport(current, parsed)) : current));
      } else {
        const parsed = parseImportedAppData(raw) as AppData;
        setData(normalizeAppData(parsed));
      }
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid planner JSON.");
    }
  }

  async function resetLocalData() {
    if (!window.confirm("Clear all local planner data? This cannot be undone.")) {
      return;
    }
    setData(normalizeAppData(await clearAllPlannerData()));
  }

  const selectedPlannedCourses = getPlannedCoursesForTerm(plan.degreePlan.plannedCourses, selectedTerm);
  const schedule = activeSchedule(plan, selectedTerm.id) ?? plan.semesterSchedules.find((candidate) => candidate.termId === selectedTerm.id);
  const selectedSections = schedule
    ? Object.values(schedule.selectedSectionIdsByPlannedCourseId)
        .flat()
        .map((sectionId) => data.sections.find((section) => section.id === sectionId))
        .filter(Boolean) as CourseSection[]
    : [];
  const calendarEvents = selectedSections.flatMap((section) =>
    section.meetings.map((meeting) => ({
      id: meeting.id,
      title: `${section.courseId} ${section.label}`,
      daysOfWeek: meeting.days.map((day) => dayIndex[day]),
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      extendedProps: {
        campus: meeting.campus ?? ""
      }
    }))
  );
  const selectedDetailPlannedCourse = selectedDetailPlannedCourseId
    ? plan.degreePlan.plannedCourses.find((planned) => planned.id === selectedDetailPlannedCourseId)
    : undefined;
  const selectedDetailCourse = selectedDetailPlannedCourse
    ? getCourse(data.courses, selectedDetailPlannedCourse.courseId)
    : undefined;
  const selectedDetailModel = selectedDetailPlannedCourse
    ? buildCourseDetailModel(data, selectedDetailPlannedCourse)
    : undefined;
  const selectedDetailLoadingKey = selectedDetailPlannedCourse
    ? `${selectedDetailPlannedCourse.courseId}|${selectedDetailPlannedCourse.termId}`
    : null;

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <div className="brand-block">
          <GraduationCap size={28} />
          <div>
            <h1>SFU Planner</h1>
            <p>Unofficial local degree planning</p>
          </div>
        </div>

        <nav className="view-tabs" aria-label="Planner views">
          {viewTabs.map(({ view, Icon, label }) => (
            <button
              key={view}
              type="button"
              className={classNames(data.settings.activeView === view && "active")}
              onClick={() =>
                patchData((current) => ({ ...current, settings: { ...current.settings, activeView: view } }))
              }
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <section className="panel compact">
          <h2>Current Plan</h2>
          {editingPlanName ? (
            <input
              ref={planNameInputRef}
              aria-label="Plan Name"
              value={plan.name}
              onChange={(event) =>
                patchActivePlan((currentPlan) => ({
                  ...currentPlan,
                  name: event.target.value,
                  updatedAt: nowIso()
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  setEditingPlanName(false);
                  planNameInputRef.current?.blur();
                }
              }}
            />
          ) : (
            <select value={plan.id} onChange={(event) => selectPlan(event.target.value)}>
              {longTermPlans.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="subtle" onClick={togglePlanRename}>
            {editingPlanName ? <Check size={16} /> : <Pencil size={16} />}
            {editingPlanName ? "Done" : "Rename"}
          </button>
          <button type="button" onClick={createPlanVersion}>
            <Plus size={16} />
            New Plan
          </button>
          {longTermPlans.length > 1 ? (
            <button type="button" className="danger" onClick={() => deletePlan(plan.id)}>
              <Trash2 size={16} />
              Delete Plan
            </button>
          ) : null}
        </section>

        <section className="panel compact">
          <h2>Planning Range</h2>
          <label className="stacked-field">
            Current Year
            <input
              type="number"
              value={data.settings.currentYear}
              onChange={(event) => updatePlanningRange({ currentYear: Number(event.target.value) })}
            />
          </label>
          <label className="stacked-field">
            Current Semester
            <select
              value={data.settings.currentSeason}
              onChange={(event) => updatePlanningRange({ currentSeason: event.target.value as TermSeason })}
            >
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="fall">Fall</option>
            </select>
          </label>
          <div className="range-grid">
            <label className="stacked-field">
              Start Year
              <input
                type="number"
                min={data.settings.currentYear - 10}
                max={data.settings.currentYear + 10}
                value={data.settings.rangeStartYear}
                onChange={(event) => updatePlanningRange({ rangeStartYear: Number(event.target.value) })}
              />
            </label>
            <label className="stacked-field">
              End Year
              <input
                type="number"
                min={data.settings.currentYear - 10}
                max={data.settings.currentYear + 10}
                value={data.settings.rangeEndYear}
                onChange={(event) => updatePlanningRange({ rangeEndYear: Number(event.target.value) })}
              />
            </label>
          </div>
          <p className="muted">Range limits: {data.settings.currentYear - 10}-{data.settings.currentYear + 10}</p>
        </section>

        <section className="panel compact">
          <h2>Planner Data</h2>
          <button type="button" onClick={exportJson}>
            <Download size={16} />
            Export JSON
          </button>
          <label className="file-button">
            <Upload size={16} />
            Import JSON
            <input type="file" accept="application/json" onChange={(event) => void importJson(event.target.files?.[0])} />
          </label>
          <button type="button" className="danger" onClick={() => void resetLocalData()}>
            <Trash2 size={16} />
            Clear Local Data
          </button>
          {importError ? <p className="error-text">{importError}</p> : null}
        </section>
      </aside>

      <section className="workspace">
        {data.settings.activeView === "planner" ? (
          <>
            <section className="toolbar">
              <div>
                <h2>Long-Term Degree Board</h2>
                <p className="board-subtitle">Search for a course, preview possible terms, and place it in your plan</p>
              </div>
              <div className="course-combobox" ref={plannerComboboxRef}>
                <div className="search-controls">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search Courses"
                      placeholder="Search any subject"
                      value={courseQuery}
                      onFocus={() => setPlannerSearchOpen(Boolean(courseQuery.trim()))}
                      onChange={(event) => {
                        setCourseQuery(event.target.value);
                        setPlacementPreviewCourseId(null);
                        setPlannerSearchOpen(Boolean(event.target.value.trim()));
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") {
                          return;
                        }
                        const match = exactCourseMatch(courseQuery, data.courses);
                        if (!match || (offeringFilter && !match.historicalOfferings.includes(offeringFilter))) {
                          return;
                        }
                        event.preventDefault();
                        setPlacementPreviewCourseId(match.id);
                        setCourseQuery("");
                        setPlannerSearchOpen(false);
                      }}
                    />
                  </label>
                  <label className="semester-filter">
                    Semester
                    <select
                      aria-label="Semester offering"
                      value={offeringFilter}
                      onChange={(event) => {
                        setOfferingFilter(event.target.value as TermId | "");
                        setPlannerSearchOpen(Boolean(courseQuery.trim()));
                      }}
                    >
                      <option value="">All terms</option>
                      <option value={nextSemesterId}>Next semester ({termLabel(nextSemesterId)})</option>
                      <option value={currentTermId}>This semester ({termLabel(currentTermId)})</option>
                      {extraOfferingTerms.map((term) => (
                        <option key={term.id} value={term.id}>
                          {termLabel(term.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {plannerSearchStatus ? <p className="search-status">{plannerSearchStatus}</p> : null}
                {courseQuery.trim() && plannerSearchOpen ? (
                  <div className="combobox-menu" role="listbox" aria-label="Course Search Results">
                    {plannerSearchResults.map(({ course }) => (
                      <button
                        key={course.id}
                        type="button"
                        role="option"
                        onClick={() => {
                          setPlacementPreviewCourseId(course.id);
                          setCourseQuery("");
                          setPlannerSearchOpen(false);
                        }}
                      >
                        <span>
                          <strong>{course.id}</strong>
                          <small>{course.title}</small>
                        </span>
                        <span className="result-badges">
                          <em>{course.units} Units</em>
                          <em>{course.prerequisitesText ? "Prerequisites" : "Prerequisites Unknown"}</em>
                          <em>
                            {offeringFilter
                              ? termLabel(offeringFilter)
                              : course.historicalOfferings.length
                                ? "Offering Data"
                                : "No Offering Data"}
                          </em>
                        </span>
                      </button>
                    ))}
                    {plannerSearchResults.length === 0 ? (
                      <p className="empty-state">
                        {offeringFilter
                          ? `No Courses Offered In ${termLabel(offeringFilter)} Match This Search.`
                          : "No Matching Courses Yet."}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <DndContext onDragEnd={handleDragEnd}>
              <section className="degree-board">
                {[...plan.degreePlan.terms].sort((a, b) => compareTermIds(a.id, b.id)).map((term) => (
                  <TermColumn
                    key={term.id}
                    data={data}
                    term={term}
                    terms={plan.degreePlan.terms}
                    plannedCourses={getPlannedCoursesForTerm(plan.degreePlan.plannedCourses, term)}
                    onRemoveCourse={removePlannedCourse}
                    onMoveCourse={movePlannedCourse}
                    onSelectSection={selectSectionForTerm}
                    onOpenCourseDetails={openCourseDetails}
                    previewCourse={previewCourse}
                    previewPlacement={previewPlacements.find((placement) => placement.termId === term.id)}
                    onPlacePreview={addCourseToTerm}
                    onUpdateTerm={updateTerm}
                  />
                ))}
              </section>
            </DndContext>
          </>
        ) : null}

        {data.settings.activeView === "schedule" ? (
          <section className="schedule-view">
            <section className="toolbar">
              <div>
                <h2>Semester Schedule Builder</h2>
                <p>Compare timetable versions and detect critical overlaps.</p>
              </div>
              <div className="toolbar-actions">
                <button type="button" onClick={() => ensureSchedule(selectedTerm.id)}>
                  <Plus size={16} />
                  Version
                </button>
                {schedule ? (
                  <button type="button" onClick={() => duplicateSchedule(schedule)}>
                    <Copy size={16} />
                    Duplicate
                  </button>
                ) : null}
              </div>
            </section>

            <div className="schedule-grid">
              <section className="panel">
                <h3>Versions</h3>
                <div className="version-list">
                  {plan.semesterSchedules
                    .filter((candidate) => candidate.termId === selectedTerm.id)
                    .map((candidate) => (
                      <article key={candidate.id} className={classNames("version-card", candidate.active && "active")}>
                        <input
                          value={candidate.name}
                          onChange={(event) => updateSchedule(candidate.id, { name: event.target.value })}
                        />
                        <div className="button-row">
                          <button
                            type="button"
                            onClick={() =>
                              patchActivePlan((currentPlan) => ({
                                ...currentPlan,
                                semesterSchedules: currentPlan.semesterSchedules.map((item) =>
                                  item.termId === candidate.termId
                                    ? { ...item, active: item.id === candidate.id }
                                    : item
                                )
                              }))
                            }
                          >
                            <Check size={15} />
                            Active
                          </button>
                          <button type="button" className="subtle" onClick={() => deleteSchedule(candidate.id)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
                <h3>Sections</h3>
                {selectedPlannedCourses.map((planned) => {
                  const courseSections = data.sections.filter(
                    (section) => section.courseId === planned.courseId && section.termId === selectedTerm.id
                  );
                  const selected = schedule?.selectedSectionIdsByPlannedCourseId[planned.id]?.[0] ?? "";
                  return (
                    <label key={planned.id} className="stacked-field">
                      {planned.courseId}
                      <select value={selected} onChange={(event) => selectSection(planned.id, event.target.value)}>
              <option value="">No Section Selected</option>
                        {courseSections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.label} {section.meetings.length ? "With Meeting Time" : "No Time Data"}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </section>
              <section className="calendar-panel">
                {calendarEvents.length ? (
                  <FullCalendar
                    plugins={[timeGridPlugin]}
                    initialView="timeGridWeek"
                    headerToolbar={false}
                    allDaySlot={false}
                    weekends={false}
                    height="auto"
                    slotMinTime="08:00:00"
                    slotMaxTime="22:00:00"
                    slotEventOverlap={false}
                    events={calendarEvents}
                  />
                ) : (
                  <p className="empty-state">Select Section Times To Populate The Weekly Calendar.</p>
                )}
              </section>
            </div>
          </section>
        ) : null}

        {data.settings.activeView === "requirements" && computed.profile ? (
          <section className="requirements-view">
            <section className="toolbar">
              <div>
                <h2>Academic Courses</h2>
                <p>Track Completed Courses And Optional Remaining Courses For Planning.</p>
              </div>
            </section>

            <div className="requirements-grid">
              <section className="panel profile-form">
                <h3>Program Profile</h3>
                {[
                  ["major", "Major"],
                  ["secondMajor", "Second Major"],
                  ["minor", "Minor"],
                  ["concentration", "Concentration"],
                  ["calendarYear", "Calendar Year"]
                ].map(([field, label]) => (
                  <label key={field} className="stacked-field">
                    {label}
                    <input
                      value={String(computed.profile?.[field as keyof typeof computed.profile] ?? "")}
                      onChange={(event) => updateProfile(field, event.target.value)}
                    />
                  </label>
                ))}
                <label className="stacked-field">
                  Transfer Credits
                  <input
                    type="number"
                    min={0}
                    value={computed.profile.transferCredits}
                    onChange={(event) => updateProfile("transferCredits", Number(event.target.value))}
                  />
                </label>
              </section>

              <section className="panel course-list-panel">
                <h3>Completed Courses</h3>
                <div className="course-combobox inline" ref={completedComboboxRef}>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search Completed Courses"
                      placeholder="Search Courses To Mark Completed"
                      value={completedQuery}
                      onFocus={() => setCompletedSearchOpen(Boolean(completedQuery.trim()))}
                      onChange={(event) => {
                        setCompletedQuery(event.target.value);
                        setCompletedSearchOpen(Boolean(event.target.value.trim()));
                      }}
                    />
                  </label>
                  {completedQuery.trim() && completedSearchOpen ? (
                    <div className="combobox-menu" role="listbox" aria-label="Completed Course Results">
                      {completedSearchResults.map(({ course }) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => {
                            addProfileCourse("completedCourses", course.id);
                            setCompletedQuery("");
                            setCompletedSearchOpen(false);
                          }}
                        >
                          <span>
                            <strong>{course.id}</strong>
                            <small>{course.title}</small>
                          </span>
                        </button>
                      ))}
                      {completedSearchResults.length === 0 ? <p className="empty-state">No Matching Courses Yet.</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="course-token-list">
                  {computed.profile.completedCourses.map((courseId) => (
                    <span key={courseId} className="course-token">
                      {courseId}
                      <button type="button" onClick={() => removeProfileCourse("completedCourses", courseId)} aria-label={`Remove ${courseId}`}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </section>

              <section className="panel course-list-panel">
                <h3>Optional Remaining Courses</h3>
                <div className="course-combobox inline" ref={remainingComboboxRef}>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search Remaining Courses"
                      placeholder="Search Courses To Save As Remaining"
                      value={remainingQuery}
                      onFocus={() => setRemainingSearchOpen(Boolean(remainingQuery.trim()))}
                      onChange={(event) => {
                        setRemainingQuery(event.target.value);
                        setRemainingSearchOpen(Boolean(event.target.value.trim()));
                      }}
                    />
                  </label>
                  {remainingQuery.trim() && remainingSearchOpen ? (
                    <div className="combobox-menu" role="listbox" aria-label="Remaining Course Results">
                      {remainingSearchResults.map(({ course }) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => {
                            addProfileCourse("remainingCourses", course.id);
                            setRemainingQuery("");
                            setRemainingSearchOpen(false);
                          }}
                        >
                          <span>
                            <strong>{course.id}</strong>
                            <small>{course.title}</small>
                          </span>
                        </button>
                      ))}
                      {remainingSearchResults.length === 0 ? <p className="empty-state">No Matching Courses Yet.</p> : null}
                    </div>
                  ) : null}
                </div>
                <label className="stacked-field">
                  Paste Remaining Courses
                  <textarea
                    placeholder="Paste A Plain-Text List Such As MSE 312, CMPT 225, Or One Course Per Line."
                    value={remainingPasteText}
                    onChange={(event) => setRemainingPasteText(event.target.value)}
                  />
                </label>
                <button type="button" onClick={pasteRemainingCourses}>
                  <Plus size={16} />
                  Add Pasted Courses
                </button>
                <div className="course-token-list">
                  {(computed.profile.remainingCourses ?? []).map((courseId) => (
                    <span key={courseId} className="course-token">
                      {courseId}
                      <button type="button" onClick={() => removeProfileCourse("remainingCourses", courseId)} aria-label={`Remove ${courseId}`}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

      </section>
      <CourseDetailPanel
        planned={selectedDetailPlannedCourse}
        course={selectedDetailCourse}
        detail={selectedDetailModel}
        loading={courseDetailLoadingKey === selectedDetailLoadingKey}
        error={courseDetailError}
        onClose={() => {
          setSelectedDetailPlannedCourseId(null);
          setCourseDetailError("");
        }}
        onSelectSection={(sectionId) => {
          if (selectedDetailPlannedCourse) {
            selectSectionForTerm(selectedDetailPlannedCourse.id, selectedDetailPlannedCourse.termId, sectionId);
          }
        }}
      />
    </main>
  );
}
