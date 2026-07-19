type LayoutShape = {
  buildings?: unknown[];
  placedCustomAssets?: unknown[];
  layoutSchemes?: Array<{ snapshot?: { buildings?: unknown[]; placedCustomAssets?: unknown[] } }>;
};

function hasCityContent(layout: LayoutShape | null | undefined): boolean {
  if (!layout) return false;
  if ((layout.buildings?.length ?? 0) > 0 || (layout.placedCustomAssets?.length ?? 0) > 0) return true;
  return (layout.layoutSchemes ?? []).some((scheme) =>
    (scheme.snapshot?.buildings?.length ?? 0) > 0 ||
    (scheme.snapshot?.placedCustomAssets?.length ?? 0) > 0
  );
}

export function shouldRestorePackagedSeed(
  currentLayout: LayoutShape | null | undefined,
  seedLayout: LayoutShape | null | undefined
): boolean {
  return !hasCityContent(currentLayout) && hasCityContent(seedLayout);
}
