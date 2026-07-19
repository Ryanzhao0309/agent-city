import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubJsonContent, parseLikeCount, parseThemeCatalog } from "./themeCatalogService.js";

function validCatalog() {
  return {
    schemaVersion: 1,
    repository: "https://github.com/Ryanzhao0309/agent-city-themes",
    themes: [{
      id: "theme-test", name: "Test", version: "1.0.0", kind: "skin", icon: "🎨",
      summary: "A safe reviewed test theme.", creatorName: "Agent City",
      creatorUrl: "https://github.com/Ryanzhao0309/agent-city",
      license: "AGPL-3.0-only", minAgentCityVersion: "0.1.2",
      previewUrl: "https://raw.githubusercontent.com/Ryanzhao0309/agent-city-themes/main/themes/theme-test/assets/preview.png",
      sourceUrl: "https://github.com/Ryanzhao0309/agent-city-themes/tree/main/themes/theme-test",
      mapSurrounding: "plain",
      buildingSkins: {
        "city-hall": "https://raw.githubusercontent.com/Ryanzhao0309/agent-city-themes/main/themes/theme-test/assets/city-hall.png",
      },
      assets: [
        {
          id: "terrain-stone-path",
          kind: "terrain",
          name: "Test · Stone Path",
          url: "https://raw.githubusercontent.com/Ryanzhao0309/agent-city-themes/main/themes/theme-test/assets/ground/stone-path.png",
        },
        {
          id: "decoration-lantern",
          kind: "decoration",
          name: "Test · Lantern",
          url: "https://raw.githubusercontent.com/Ryanzhao0309/agent-city-themes/main/themes/theme-test/assets/decorations/lantern.png",
        },
      ],
      likeIssueNumber: 7,
      likeUrl: "https://github.com/Ryanzhao0309/agent-city-themes/issues/7",
    }],
  };
}

test("parseThemeCatalog accepts repository-scoped assets", () => {
  const parsed = parseThemeCatalog(validCatalog());
  assert.equal(parsed.themes[0].id, "theme-test");
  assert.equal(parsed.themes[0].likeIssueNumber, 7);
  assert.deepEqual(parsed.themes[0].assets.map((asset) => asset.kind), ["terrain", "decoration"]);
});

test("parseThemeCatalog rejects assets from an unreviewed host", () => {
  const catalog = validCatalog();
  catalog.themes[0].previewUrl = "https://example.com/tracker.png";
  assert.throws(() => parseThemeCatalog(catalog), /invalid URLs/);
});

test("parseThemeCatalog rejects duplicate ids", () => {
  const catalog = validCatalog();
  catalog.themes.push({ ...catalog.themes[0] });
  assert.throws(() => parseThemeCatalog(catalog), /duplicate id/);
});

test("parseThemeCatalog rejects unreviewed or duplicate theme assets", () => {
  const external = validCatalog();
  external.themes[0].assets[0].url = "https://example.com/tracker.png";
  assert.throws(() => parseThemeCatalog(external), /invalid asset/);

  const duplicate = validCatalog();
  duplicate.themes[0].assets.push({ ...duplicate.themes[0].assets[0] });
  assert.throws(() => parseThemeCatalog(duplicate), /invalid asset/);
});

test("parseLikeCount reads only a safe thumbs-up count", () => {
  assert.equal(parseLikeCount({ reactions: { "+1": 12 } }), 12);
  assert.equal(parseLikeCount({ reactions: { "+1": -1 } }), 0);
  assert.equal(parseLikeCount({ reactions: { "+1": "12" } }), 0);
});

test("parseGitHubJsonContent decodes the GitHub contents API envelope", () => {
  const source = JSON.stringify(validCatalog());
  assert.deepEqual(parseGitHubJsonContent({ type: "file", encoding: "base64", content: Buffer.from(source).toString("base64") }), validCatalog());
  assert.throws(() => parseGitHubJsonContent({ type: "dir" }), /invalid/);
});
