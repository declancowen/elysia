import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { AgentProfile } from "./orchestration.ts";

const decodeProfile = Schema.decodeUnknownSync(AgentProfile);

const profileWithColor = (color: string) => ({
  instructions: "Help with ongoing work.",
  avatar: { preset: "robot", color },
  notificationsEnabled: true,
  archived: false,
});

it("accepts each approved agent avatar colour", () => {
  for (const color of [
    "#003CB2",
    "#28B4FF",
    "#AAE6FF",
    "#C9FCED",
    "#33D7C8",
    "#00786E",
    "#D8AFFF",
    "#9423FC",
    "#551491",
    "#FFB2C1",
    "#FF547C",
    "#BF1B4F",
    "#F5E669",
    "#EEAF00",
    "#B05223",
  ]) {
    assert.strictEqual(decodeProfile(profileWithColor(color)).avatar.color, color);
  }
});

it("keeps saved named agent avatar colours readable", () => {
  for (const color of ["blue", "violet", "green", "orange", "rose", "cyan"]) {
    assert.strictEqual(decodeProfile(profileWithColor(color)).avatar.color, color);
  }
});

it("rejects arbitrary hex and unrecognised agent avatar colours", () => {
  for (const color of ["#FFFFFF", "#28b4ff", "#123456", "red", "", "28B4FF"]) {
    assert.throws(() => decodeProfile(profileWithColor(color)));
  }
});
