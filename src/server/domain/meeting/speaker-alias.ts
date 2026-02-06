export function speakerAliasArrayToMap(
  aliases: Array<{ speaker: number; displayName: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const alias of aliases) {
    if (!Number.isInteger(alias.speaker) || alias.speaker < 0) continue;
    const displayName = alias.displayName.trim();
    if (!displayName) continue;
    result[String(alias.speaker)] = displayName;
  }
  return result;
}
