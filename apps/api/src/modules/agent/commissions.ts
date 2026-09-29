// Commission = annualized premium × carrier rate. This basis (and the rates
// themselves) are placeholders until real commission tables exist — CLAUDE.md
// lists them as unresolved. Keep the formula here so it changes in one place.
export function commissionAmountCents(monthlyPremiumCents: number, rateBps: number): number {
  return Math.round((monthlyPremiumCents * 12 * rateBps) / 10_000);
}
