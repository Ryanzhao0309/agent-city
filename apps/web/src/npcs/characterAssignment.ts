export function assignUniqueResident(
  residents: Record<string, string>,
  buildingId: string,
  characterId: string | null
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [id, assignedCharacterId] of Object.entries(residents)) {
    if (id === buildingId) continue;
    if (characterId && assignedCharacterId === characterId) continue;
    next[id] = assignedCharacterId;
  }
  if (characterId) next[buildingId] = characterId;
  return next;
}
