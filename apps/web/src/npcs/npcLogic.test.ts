import test from "node:test";
import assert from "node:assert/strict";
import { clampNpcPosition, createNpcSpawn, getNpcWalkDirection, nextNpcWalkPosition } from "./npcLogic";

const grid = { cols: 14, rows: 9 };

function screenDelta(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    x: dx - dy,
    y: dx + dy,
  };
}

function assertScreenAlignedMove(from: { x: number; y: number }, to: { x: number; y: number }) {
  const delta = screenDelta(from, to);
  assert.ok(delta.x === 0 || delta.y === 0, `expected screen-aligned move, got ${JSON.stringify(delta)}`);
}

test("createNpcSpawn places an NPC near the lower edge of its home building", () => {
  const spawn = createNpcSpawn({ x: 6, y: 3 }, [2, 2], grid);

  assert.deepEqual(spawn, { x: 7, y: 5 });
});

test("createNpcSpawn picks the nearest walkable path around the building", () => {
  const spawn = createNpcSpawn(
    { x: 6, y: 3 },
    [2, 2],
    grid,
    (point) => point.x === 8 && point.y === 5
  );

  assert.deepEqual(spawn, { x: 8, y: 5 });
});

test("clampNpcPosition keeps NPCs inside the city grid", () => {
  assert.deepEqual(clampNpcPosition({ x: -2, y: 99 }, grid), { x: 0, y: 8 });
});

test("nextNpcWalkPosition stays within home radius and city bounds", () => {
  const current = { x: 9, y: 7 };
  const next = nextNpcWalkPosition(
    current,
    { x: 6, y: 3 },
    [2, 2],
    grid,
    () => 0.99
  );

  assert.deepEqual(next, { x: 8, y: 6 });
  assertScreenAlignedMove(current, next);
});

test("nextNpcWalkPosition can roam beyond the home radius when unconstrained", () => {
  const current = { x: 10, y: 7 };
  const next = nextNpcWalkPosition(
    current,
    { x: 6, y: 3 },
    [2, 2],
    grid,
    () => 0,
    undefined,
    { homeRadius: null }
  );

  assert.deepEqual(next, { x: 11, y: 6 });
  assertScreenAlignedMove(current, next);
});

test("getNpcWalkDirection maps screen-aligned isometric steps to sprite rows", () => {
  assert.equal(getNpcWalkDirection({ x: 4, y: 4 }, { x: 5, y: 3 }), "right");
  assert.equal(getNpcWalkDirection({ x: 4, y: 4 }, { x: 3, y: 5 }), "left");
  assert.equal(getNpcWalkDirection({ x: 4, y: 4 }, { x: 5, y: 5 }), "down");
  assert.equal(getNpcWalkDirection({ x: 4, y: 4 }, { x: 3, y: 3 }), "up");
});

test("nextNpcWalkPosition only returns horizontal or vertical screen movement", () => {
  const current = { x: 6, y: 4 };
  const starts = [0, 0.26, 0.51, 0.76];

  for (const start of starts) {
    const next = nextNpcWalkPosition(
      current,
      { x: 4, y: 2 },
      [2, 2],
      grid,
      () => start,
      undefined,
      { homeRadius: null }
    );
    assertScreenAlignedMove(current, next);
    assert.equal(Math.abs(next.x - current.x), 1);
    assert.equal(Math.abs(next.y - current.y), 1);
  }
});

test("nextNpcWalkPosition skips out-of-bounds directions instead of clamping into a diagonal slide", () => {
  const current = { x: 13, y: 0 };
  const next = nextNpcWalkPosition(
    current,
    { x: 11, y: 0 },
    [2, 2],
    grid,
    () => 0,
    undefined,
    { homeRadius: null }
  );

  assert.deepEqual(next, { x: 12, y: 1 });
  assertScreenAlignedMove(current, next);
});

test("nextNpcWalkPosition skips home-radius-clipped directions instead of flattening a step", () => {
  const current = { x: 10, y: 7 };
  const next = nextNpcWalkPosition(
    current,
    { x: 6, y: 3 },
    [2, 2],
    grid,
    () => 0
  );

  assert.deepEqual(next, { x: 9, y: 6 });
  assertScreenAlignedMove(current, next);
});

test("nextNpcWalkPosition stays put when the next directions are not path tiles", () => {
  const next = nextNpcWalkPosition(
    { x: 7, y: 5 },
    { x: 6, y: 3 },
    [2, 2],
    grid,
    () => 0,
    (point) => point.x === 7 && point.y === 5
  );

  assert.deepEqual(next, { x: 7, y: 5 });
});
