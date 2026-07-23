// Shared interaction styling.
//
// Every button must acknowledge a click the instant it happens — a press
// state (scale-down + slight dim) that fires in the same frame, long before
// any network response. Without it a button feels inert and people click it
// again, unsure whether it registered. Pair this with a *pending* label on
// the control itself ("Approving…") so the acknowledgement survives the whole
// round-trip, not just the press.
//
// Also includes a visible keyboard focus ring, which the raw Tailwind classes
// these buttons previously used had dropped entirely.
export const PRESSABLE =
  "transition-all duration-150 ease-out active:scale-[0.97] active:brightness-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand2)] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
