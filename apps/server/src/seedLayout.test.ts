import assert from "node:assert/strict";
import test from "node:test";
import { shouldRestorePackagedSeed } from "./seedLayout.js";

test("packaged seed only restores a genuinely empty desktop city", () => {
  const seed = { buildings: [{ id: "city-hall" }], placedCustomAssets: [] };
  assert.equal(shouldRestorePackagedSeed({ buildings: [], placedCustomAssets: [] }, seed), true);
  assert.equal(shouldRestorePackagedSeed({ buildings: [{ id: "mine" }] }, seed), false);
  assert.equal(
    shouldRestorePackagedSeed({ buildings: [], layoutSchemes: [{ snapshot: { buildings: [{ id: "saved" }] } }] }, seed),
    false
  );
  assert.equal(shouldRestorePackagedSeed({ buildings: [] }, { buildings: [] }), false);
});
