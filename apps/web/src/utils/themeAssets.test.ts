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
};

test("downloaded remote theme skins become project building assets", () => {
  const [asset] = getThemePackAssets(remotePack);
  assert.equal(asset.kind, "building");
  assert.equal(getAssetThemePackId(asset), remotePack.id);
  assert.deepEqual(filterAvailableProjectAssets([asset], []), []);
  assert.deepEqual(filterAvailableProjectAssets([asset], [{ ...remotePack, installedAt: new Date(0).toISOString() }]), [asset]);
});
