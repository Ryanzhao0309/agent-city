const BASELINE_MARGIN_RATIO = 0.02;
const MAX_BASELINE_SHIFT = 18;

/**
 * Transparent space below the visible artwork in each built-in building PNG.
 * Values are measured from the alpha bounds against the source canvas height.
 */
const BUILDING_BOTTOM_PADDING_RATIO: Record<string, number> = {
  "/buildings/megalithic-single-pack/01-city-hall.png": 0.0454545,
  "/buildings/megalithic-single-pack/02-agent-cottage.png": 0.0980861,
  "/buildings/megalithic-single-pack/03-skill-shrine.png": 0.099681,
  "/buildings/megalithic-single-pack/04-archive-library.png": 0.0845295,
  "/buildings/megalithic-single-pack/05-server-ops-observatory.png": 0.0837321,
  "/buildings/megalithic-single-pack/06-data-rune-tower.png": 0.0598086,
  "/buildings/megalithic-single-pack/07-bookmark-hall.png": 0.0669856,
  "/buildings/megalithic-single-pack/08-ancient-custom-workshop.png": 0.053429,
  "/buildings/changan-pack/01-city-hall.png": 0.123047,
  "/buildings/changan-pack/02-agent-courtyard.png": 0.117188,
  "/buildings/changan-pack/03-task-notice-hall.png": 0.0761719,
  "/buildings/changan-pack/04-skill-academy.png": 0.119141,
  "/buildings/changan-pack/05-archive-pagoda.png": 0.0527344,
  "/buildings/changan-pack/06-data-observatory.png": 0.0332031,
  "/buildings/changan-pack/07-server-ops-fort.png": 0.103516,
  "/buildings/changan-pack/08-lantern-theme-hall.png": 0.0683594,
  "/buildings/changan-pack/09-custom-workshop.png": 0.0859375,
  "/buildings/sky-observatory-pack/01-city-hall.png": 0.117188,
  "/buildings/sky-observatory-pack/02-agent-home.png": 0.171875,
  "/buildings/sky-observatory-pack/03-task-hall.png": 0.126953,
  "/buildings/sky-observatory-pack/04-skill-academy.png": 0.103516,
  "/buildings/sky-observatory-pack/05-archive-rotunda.png": 0.115234,
  "/buildings/sky-observatory-pack/06-data-crystal-tower.png": 0.0507812,
  "/buildings/sky-observatory-pack/07-server-observatory.png": 0.0820312,
  "/buildings/sky-observatory-pack/08-theme-gallery.png": 0.150391,
  "/buildings/sky-observatory-pack/09-custom-workshop.png": 0.113281,
  "/buildings/custom/todo-hall.png": 0.1425,
};

function builtInBuildingPath(imageUrl: string): string | null {
  const path = imageUrl.split(/[?#]/, 1)[0];
  const match = path.match(/\/buildings\/[^?#]+\.(?:png|webp)$/i);
  return match?.[0] ?? null;
}

export function getBuildingBaselineShift(
  imageUrl: string | undefined,
  visualHeight: number
): number {
  if (!imageUrl || !Number.isFinite(visualHeight) || visualHeight <= 0) return 0;
  const path = builtInBuildingPath(imageUrl);
  const bottomPaddingRatio = path ? BUILDING_BOTTOM_PADDING_RATIO[path] : undefined;
  if (bottomPaddingRatio === undefined) return 0;
  const shift = (bottomPaddingRatio - BASELINE_MARGIN_RATIO) * visualHeight;
  return Math.min(MAX_BASELINE_SHIFT, Math.max(0, Math.round(shift)));
}
