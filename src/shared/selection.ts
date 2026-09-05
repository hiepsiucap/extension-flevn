export function normalizeSelection(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isSavableWord(value: string) {
  const normalized = normalizeSelection(value);
  return (
    normalized.length > 0 &&
    normalized.length <= 100 &&
    /^[\p{L}]+(?:['’\-][\p{L}]+)*$/u.test(normalized)
  );
}

