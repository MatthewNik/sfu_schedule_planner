import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createInitialAppData } from "./domain/fixtures";

const mocks = vi.hoisted(() => ({
  loadAppData: vi.fn(),
  saveAppData: vi.fn(),
  clearAllPlannerData: vi.fn(),
  fetchSfuCourseWithSections: vi.fn(),
  fetchSfuCourseNumbersForSubject: vi.fn()
}));

vi.mock("./storage/database", () => ({
  loadAppData: mocks.loadAppData,
  saveAppData: mocks.saveAppData,
  clearAllPlannerData: mocks.clearAllPlannerData
}));

vi.mock("./services/sfuApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./services/sfuApi")>();
  return {
    ...actual,
    fetchSfuCourseWithSections: mocks.fetchSfuCourseWithSections,
    fetchSfuCourseNumbersForSubject: mocks.fetchSfuCourseNumbersForSubject
  };
});

describe("planner course detail panel", () => {
  beforeEach(() => {
    mocks.loadAppData.mockResolvedValue(createInitialAppData());
    mocks.saveAppData.mockResolvedValue(undefined);
    mocks.clearAllPlannerData.mockResolvedValue(createInitialAppData());
    mocks.fetchSfuCourseNumbersForSubject.mockResolvedValue([]);
    mocks.fetchSfuCourseWithSections.mockResolvedValue({
      course: {
        id: "CMPT 225",
        subject: "CMPT",
        number: "225",
        title: "Data Structures and Programming",
        units: 3,
        description: "Abstract data types and algorithms.",
        prerequisitesText: "CMPT 125 and MACM 101.",
        source: "sfu",
        historicalOfferings: ["2026-fall"],
        lastFetchedAt: "2026-05-19T00:00:00.000Z"
      },
      sections: [
        {
          id: "CMPT 225-2026-fall-D200",
          courseId: "CMPT 225",
          termId: "2026-fall",
          label: "D200",
          title: "Data Structures and Programming",
          classType: "enrollment",
          instructors: [{ name: "Official Instructor" }],
          meetings: [
            {
              id: "CMPT225-D200-LEC",
              days: ["MO"],
              startTime: "10:30",
              endTime: "12:20",
              campus: "Burnaby",
              sectionCode: "LEC"
            }
          ],
          lastFetchedAt: "2026-05-19T00:00:00.000Z",
          raw: {}
        }
      ]
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens from the card body but not from card controls", async () => {
    render(<App />);

    const moveSelect = await screen.findByLabelText("Move CMPT 225 To Term");
    fireEvent.click(moveSelect);
    expect(screen.queryByLabelText("Course Details")).not.toBeInTheDocument();

    const card = screen.getByText("Data Structures and Programming").closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(card as HTMLElement);

    expect(await screen.findByLabelText("Course Details")).toBeInTheDocument();
    expect(await screen.findByText("Official SFU data")).toBeInTheDocument();
    expect(await screen.findByText("Official Instructor")).toBeInTheDocument();
  });

  it("selects a confirmed section from the detail panel", async () => {
    render(<App />);

    const card = (await screen.findByText("Data Structures and Programming")).closest("article");
    fireEvent.click(card as HTMLElement);

    const sectionSelect = await screen.findByLabelText("Selected Section");
    fireEvent.change(sectionSelect, { target: { value: "CMPT 225-2026-fall-D200" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Selected Section")).toHaveValue("CMPT 225-2026-fall-D200");
    });
    expect(screen.getByLabelText("Select CMPT 225 Section")).toHaveValue("CMPT 225-2026-fall-D200");
  });
});
