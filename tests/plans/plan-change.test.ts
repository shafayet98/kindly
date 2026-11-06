import { describe, expect, it } from "vitest";
import { describePlanChange, retitleForTime } from "@/lib/plans/describe";

describe("goal time changes", () => {
  const bedtime = { title: "In bed by 10:30 on weeknights", target: { nightsPerWeek: 5, time: "22:30" } };

  it("describes a bedtime change in plain words", () => {
    expect(describePlanChange(bedtime, { time: "22:00" })).toBe("time 10:30 PM → 10:00 PM");
    expect(describePlanChange(bedtime, { time: "22:30" })).toBe("no change");
  });

  it("keeps the title in step with the new time", () => {
    expect(retitleForTime(bedtime.title, "22:30", "22:00")).toBe("In bed by 10:00 on weeknights");
    expect(retitleForTime("Lights out at 22:30", "22:30", "21:45")).toBe("Lights out at 9:45");
    expect(retitleForTime("Sleep earlier", "22:30", "22:00")).toBe("Sleep earlier");
    expect(retitleForTime("In bed by 10:30", undefined, "22:00")).toBe("In bed by 10:30");
  });
});
