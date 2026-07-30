// Weight units travel in two forms: the symbol the scale sends over RS-232 ("g")
// and the word the server stores ("GRAM"). Both directions live here so the two
// maps can never drift apart.

const UNIT_WEIGHT_MAP: Record<string, string> = {
  g: 'GRAM',
  kg: 'KILOGRAM',
  mg: 'MILLIGRAM',
  lb: 'POUND',
  oz: 'OUNCE',
};

/** Scale symbol → server storage form. Unknown units go up as-is, uppercased. */
export function toUnitWeight(unit: string | null): string {
  if (!unit) {
    return 'GRAM';
  }
  return UNIT_WEIGHT_MAP[unit.toLowerCase()] ?? unit.toUpperCase();
}

/**
 * Server storage form → the symbol the operator reads on the scale. Anything we
 * don't recognise is shown lowercase rather than hidden.
 */
export function toUnitSymbol(unitWeight: string): string {
  const symbol = Object.keys(UNIT_WEIGHT_MAP).find((key) => UNIT_WEIGHT_MAP[key] === unitWeight);
  return symbol ?? unitWeight.toLowerCase();
}
