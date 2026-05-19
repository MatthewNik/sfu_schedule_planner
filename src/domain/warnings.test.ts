import { describe, expect, it } from "vitest";
import { createInitialAppData } from "./fixtures";
import { generateWarnings } from "./warnings";

describe("warning engine", () => {
  it("emits severity-ranked prerequisite and overlap warnings", () => {
    const data = createInitialAppData();
    const plan = data.planVersions[0];
    const warnings = generateWarnings(data, plan);

    expect(warnings.some((warning) => warning.severity === "critical" && warning.source === "schedule")).toBe(true);
    expect(warnings.some((warning) => warning.severity === "high" && warning.source === "prerequisite")).toBe(true);
    expect(warnings[0].severity).toBe("critical");
  });

  it("marks acknowledged warnings from stable fingerprints", () => {
    const data = createInitialAppData();
    const plan = data.planVersions[0];
    const firstPass = generateWarnings(data, plan);
    const acknowledged = {
      ...plan,
      acknowledgedWarningFingerprints: [firstPass[0].fingerprint]
    };

    expect(generateWarnings(data, acknowledged)[0].acknowledged).toBe(true);
  });
});
