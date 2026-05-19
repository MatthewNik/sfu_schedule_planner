export function createId(prefix: string): string {
  const cryptoId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${prefix}_${cryptoId}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
