import { assert, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { AgentCreateInput, AgentProfile } from "./agents.ts";
import { ProjectId } from "./baseSchemas.ts";

const decodeProfile = Schema.decodeUnknownSync(AgentProfile);

const profileWithColor = (color: string) => ({
  instructions: "Help with ongoing work.",
  avatar: { preset: "robot", color },
  notificationsEnabled: true,
  archived: false,
});

it("accepts optional create-time browser access and keeps older agent requests valid", () => {
  const decodeCreate = Schema.decodeUnknownSync(AgentCreateInput);
  const input = {
    name: "Alex",
    agentProfile: profileWithColor("#28B4FF"),
    defaultModelSelection: { instanceId: "elysia", model: "native-model" },
  };
  assert.isUndefined(decodeCreate(input).enableAgentBrowserAccess);
  for (const enableAgentBrowserAccess of [true, false]) {
    assert.strictEqual(
      decodeCreate({ ...input, enableAgentBrowserAccess }).enableAgentBrowserAccess,
      enableAgentBrowserAccess,
    );
  }
  assert.throws(() => decodeCreate({ ...input, enableAgentBrowserAccess: "true" }));
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

it("accepts character shapes and preserves saved icon presets", () => {
  for (const preset of [
    "square",
    "triangle",
    "squircle",
    "circle",
    "hex",
    "cloud",
    "pill",
    "drop",
    "square-round-eyes",
    "triangle-round-eyes",
    "pill-round-eyes",
    "squircle-wide-eyes",
    "robot",
    "sparkles",
    "brain",
    "briefcase",
    "code",
    "planet",
  ]) {
    const profile = { ...profileWithColor("#28B4FF"), avatar: { preset, color: "#28B4FF" } };
    assert.strictEqual(decodeProfile(profile).avatar.preset, preset);
  }
  assert.throws(() =>
    decodeProfile({
      ...profileWithColor("#28B4FF"),
      avatar: { preset: "unknown", color: "#28B4FF" },
    }),
  );
});

it("preserves group identity and rejects ambiguous memberships on the public wire", () => {
  const profile = {
    ...profileWithColor("blue"),
    group: {
      memberProjectIds: [ProjectId.make("lead"), ProjectId.make("member")],
      leadProjectId: ProjectId.make("lead"),
    },
  };
  assert.deepEqual(decodeProfile(profile).group, profile.group);
  for (const group of [
    { memberProjectIds: ["lead"], leadProjectId: "lead" },
    { memberProjectIds: ["lead", "lead"], leadProjectId: "lead" },
    { memberProjectIds: ["lead", "member"], leadProjectId: "outsider" },
    {
      memberProjectIds: Array.from({ length: 33 }, (_, index) => String(index)),
      leadProjectId: "0",
    },
  ])
    assert.throws(() => decodeProfile({ ...profile, group }));
  assert.isUndefined(decodeProfile(profileWithColor("blue")).group);
});
