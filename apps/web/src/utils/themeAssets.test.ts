import assert from "node:assert/strict";
import test from "node:test";
import { filterAvailableProjectAssets, getAssetThemePackId, getThemePackAssets } from "../data/localAssets";
import type { ThemePackDefinition } from "../types";

const remotePack: ThemePackDefinition = {
  id: "theme-community-test",
  name: "Community Test",
  kind: "skin",
  icon: "🎨",
  summary: "A reviewed community theme.",
  previewUrl: "https://raw.githubusercontent.com/example/preview.png",
  remote: true,
  buildingSkins: {
    "city-hall": "https://raw.githubusercontent.com/example/city-hall.png",
  },
  assets: [
    {
      id: "terrain-stone-path",
      kind: "terrain",
      name: "Community Test · Stone Path",
      url: "https://raw.githubusercontent.com/example/stone-path.png",
    },
    {
      id: "decoration-lantern",
      kind: "decoration",
      name: "Community Test · Lantern",
      url: "https://raw.githubusercontent.com/example/lantern.png",
    },
    {
      id: "building-city-hall",
      kind: "building",
      name: "Community Test · City Hall",
      url: "https://raw.githubusercontent.com/example/city-hall.png",
    },
  ],
};

test("downloaded remote themes expose terrain, decorations, and buildings", () => {
  const assets = getThemePackAssets(remotePack);
  assert.deepEqual(assets.map((asset) => asset.kind), ["terrain", "decoration", "building"]);
  assert.ok(assets.every((asset) => getAssetThemePackId(asset) === remotePack.id));
  assert.deepEqual(filterAvailableProjectAssets(assets, []), []);
  assert.deepEqual(filterAvailableProjectAssets(assets, [{ ...remotePack, installedAt: new Date(0).toISOString() }]), assets);
});
