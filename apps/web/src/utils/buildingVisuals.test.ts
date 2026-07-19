import assert from "node:assert/strict";
import test from "node:test";
import { getBuildingBaselineShift } from "./buildingVisuals";

test("normalizes built-in building baselines across theme packs", () => {
  assert.equal(
    getBuildingBaselineShift("/buildings/sky-observatory-pack/06-data-crystal-tower.png", 150),
    5
  );
  assert.equal(
    getBuildingBaselineShift("/buildings/changan-pack/06-data-observatory.png", 150),
    2
  );
  assert.equal(
    getBuildingBaselineShift("/buildings/megalithic-single-pack/01-city-hall.png", 150),
    4
  );
});

test("caps large baseline corrections and supports absolute asset URLs", () => {
  assert.equal(
    getBuildingBaselineShift("http://127.0.0.1:5174/buildings/sky-observatory-pack/02-agent-home.png?v=2", 220),
    18
  );
});

test("does not move unknown, uploaded, or invalid assets", () => {
  assert.equal(getBuildingBaselineShift("/buildings/uploaded/custom-home.png", 180), 0);
  assert.equal(getBuildingBaselineShift("data:image/png;base64,abc", 180), 0);
  assert.equal(getBuildingBaselineShift(undefined, 180), 0);
  assert.equal(getBuildingBaselineShift("/buildings/changan-pack/01-city-hall.png", 0), 0);
});
