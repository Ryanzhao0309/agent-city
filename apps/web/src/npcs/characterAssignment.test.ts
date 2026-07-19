import test from "node:test";
import assert from "node:assert/strict";
import { assignUniqueResident } from "./characterAssignment";

test("assignUniqueResident removes a character from the previous building", () => {
  const result = assignUniqueResident(
    {
      "agent-home-1": "hermes",
      "skill-market-1": "guild-keeper",
    },
    "skill-market-1",
    "hermes"
  );

  assert.deepEqual(result, {
    "skill-market-1": "hermes",
  });
});

test("assignUniqueResident can clear a building resident", () => {
  const result = assignUniqueResident(
    {
      "agent-home-1": "hermes",
      "skill-market-1": "guild-keeper",
    },
    "skill-market-1",
    null
  );

  assert.deepEqual(result, {
    "agent-home-1": "hermes",
  });
});
