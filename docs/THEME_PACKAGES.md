# Theme packages

The reviewed source of truth for public themes is
[agent-city-themes](https://github.com/Ryanzhao0309/agent-city-themes). Theme art does not belong in
an application pull request unless it is intentionally retained as a built-in/offline fallback.

## Registry layout

```text
agent-city-themes/
└── themes/
    └── theme-id/
        ├── theme.json
        └── assets/
            ├── preview.png
            ├── buildings/
            ├── ground/
            └── decorations/
```

`theme.json` declares presentation and license metadata, system-building skins, the map base, and
an `assets` array. Each downloadable asset has a stable `id`, `kind` (`building`, `terrain`, or
`decoration`), public `name`, and local `path`. The registry build converts local paths into raw
GitHub URLs in `catalog.json`.

The complete contributor-facing contract lives in the registry's
[theme package format](https://github.com/Ryanzhao0309/agent-city-themes/blob/main/docs/theme-package-format.md).

## Application flow

1. The server fetches only the generated catalog on the registry's protected `main` branch.
2. It validates metadata and accepts images only from the matching reviewed theme directory.
3. The Theme Hall downloads and stores the normalized manifest without changing the active map.
4. Declared building, terrain, and decoration assets become available in Build Mode.
5. The user may later apply downloaded building artwork or switch to the theme from the other
   relevant controls.

Bundled copies in `apps/web/public/` support the built-in themes and offline operation. A reviewed
community package remains self-contained in the registry; it must never rely on those copies.
