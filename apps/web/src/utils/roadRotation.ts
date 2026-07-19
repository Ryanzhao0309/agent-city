const ROAD_ASSET_MARKERS = ["/megalithic-roads/", "/natural-stone-roads/"];

export function isRoadAssetUrl(url: string): boolean {
  return ROAD_ASSET_MARKERS.some((marker) => url.includes(marker));
}
