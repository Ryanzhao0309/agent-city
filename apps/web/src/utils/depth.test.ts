import test from "node:test";
import assert from "node:assert/strict";
import { buildingDepth, npcDepth } from "./depth";

test("building in front of an NPC has a higher depth", () => {
  const building = buildingDepth({ x: 2, y: 2, size: [2, 2] });
  const npc = npcDepth({ x: 4, y: 4 });

  assert.ok(building > npc);
});

test("NPC in front of a building has a higher depth", () => {
  const building = buildingDepth({ x: 2, y: 2, size: [2, 2] });
  const npc = npcDepth({ x: 10, y: 10 });

  assert.ok(npc > building);
});
