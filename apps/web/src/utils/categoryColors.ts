export const CATEGORY_COLORS: Record<string, string> = {
  core: "#5b8ad6",
  agents: "#6fbf6f",
  work: "#d69a3a",
  knowledge: "#9b7bd6",
  ops: "#3aa0a0",
  custom: "#d66a6a",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#7a7a8a";
}
