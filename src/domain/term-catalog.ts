import { createPlaceholderCourse } from "./course-search";
import type { Course, TermId } from "./types";

export interface CatalogListItem {
  text?: string;
  value?: string;
  title?: string;
}

export interface TermCatalogProgress {
  done: number;
  total: number;
}

export function departmentCode(item: CatalogListItem): string | undefined {
  const code = (item.value || item.text || "").trim();
  return code ? code.toUpperCase() : undefined;
}

export function courseNumberFromListItem(item: CatalogListItem): string | undefined {
  const value = item.value ?? item.text ?? item.title;
  return value?.match(/[0-9]{3}[A-Z]?/i)?.[0]?.toUpperCase();
}

function courseTitle(item: CatalogListItem, number: string): string {
  const title = item.title ?? item.text ?? "";
  return title.replace(new RegExp(number, "ig"), "").replace(/^[-:\s]+/, "").trim();
}

export function coursesFromDepartmentItems(
  subject: string,
  items: CatalogListItem[],
  termId: TermId
): Course[] {
  return items.flatMap((item) => {
    const number = courseNumberFromListItem(item);
    if (!number) {
      return [];
    }
    return [createPlaceholderCourse(subject, number, courseTitle(item, number), termId)];
  });
}

export async function collectTermCatalogCourses(
  departments: CatalogListItem[],
  loadNumbers: (department: string) => Promise<CatalogListItem[]>,
  termId: TermId,
  options?: {
    prioritySubject?: string;
    concurrency?: number;
    onBatch?: (courses: Course[], progress: TermCatalogProgress) => void;
    isCancelled?: () => boolean;
  }
): Promise<Course[]> {
  const unique = [...new Set(departments.map(departmentCode).filter((code): code is string => Boolean(code)))];
  const priority = options?.prioritySubject?.toUpperCase();
  if (priority) {
    const index = unique.indexOf(priority);
    if (index >= 0) {
      unique.splice(index, 1);
    }
    unique.unshift(priority);
  }

  const total = unique.length;
  if (total === 0) {
    options?.onBatch?.([], { done: 0, total: 0 });
    return [];
  }

  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 6, total));
  let next = 0;
  let done = 0;
  let pending: Course[] = [];
  let sinceFlush = 0;
  const all: Course[] = [];

  const flush = (force = false) => {
    if (!force && sinceFlush < 8 && done < total) {
      return;
    }
    const batch = pending;
    pending = [];
    sinceFlush = 0;
    options?.onBatch?.(batch, { done, total });
  };

  async function worker() {
    while (next < total) {
      if (options?.isCancelled?.()) {
        return;
      }
      const code = unique[next];
      next += 1;
      let batch: Course[] = [];
      try {
        const items = await loadNumbers(code);
        if (!options?.isCancelled?.()) {
          batch = coursesFromDepartmentItems(code, items, termId);
        }
      } catch {
        batch = [];
      }
      done += 1;
      sinceFlush += 1;
      pending.push(...batch);
      all.push(...batch);
      flush(done === total);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return all;
}
