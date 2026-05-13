const underlyingSymbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeUnderlyingSymbol(value: string): string | null {
  const symbol = value.trim().toUpperCase();

  if (!underlyingSymbolPattern.test(symbol)) {
    return null;
  }

  return symbol;
}
