export function cell(row: Record<string, unknown>, names: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
  for (const name of names) {
    const value = row[name] ?? normalized.get(normalizeHeader(name));
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/[\s/_\-（）()：:]/g, "").toLowerCase();
}
