import { describe, expect, it } from "vitest";
import { createInitialAppData } from "./fixtures";
import { createGraduationForecast } from "./forecast";
import { evaluateRequirementProgress } from "./requirements";

describe("graduation forecast", () => {
  it("returns estimate notes and remaining editable requirements", () => {
    const data = createInitialAppData();
    const plan = data.planVersions[0];
    const progress = evaluateRequirementProgress(
      data,
      data.programProfiles[0],
      data.requirementTemplates[0],
      plan
    );
    const forecast = createGraduationForecast(data, plan, progress);

    expect(forecast.activePlanId).toBe(plan.id);
    expect(forecast.notes[0]).toContain("not official advising");
    expect(forecast.remainingRequirements.length).toBeGreaterThan(0);
  });
});
