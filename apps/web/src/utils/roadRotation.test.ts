import assert from "node:assert/strict";
import test from "node:test";
import { isRoadAssetUrl } from "./roadRotation";

test("recognizes legacy and natural stone road assets", () => {
  assert.equal(isRoadAssetUrl("/ground/walkable/tileable/megalithic-roads/path-corner.png"), true);
  assert.equal(isRoadAssetUrl("/ground/walkable/tileable/natural-stone-roads/corner.png"), true);
  assert.equal(isRoadAssetUrl("/ground/walkable/tileable/megalithic-decor/small-plaza-patch.png"), false);
  assert.equal(isRoadAssetUrl("/ground/walkable/tileable/lush-grass.png"), false);
});
