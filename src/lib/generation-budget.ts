// ─── Storyboard generation time budget ──────────────────────────────────────
// Vercel hard-stops the Server Action at 300s (maxDuration). Every AI stage in
// one request shares that wall clock, so the budget must be DIVIDED, not shared
// greedily.
//
// THE BUG THIS FIXES: every stage used to receive the same flat deadline and
// only ever clamped its per-call timeout to the *total* remaining time. Nothing
// stopped an early stage from spending the whole budget. Worst-case demand was
// roughly:
//
//   script chain   3 providers x (2,1,1 attempts) x 60s  ≈ 240s
//   context IR     1 attempt x 45s                       ≈  45s
//   storyboard     2 attempts x 105s                     ≈ 210s
//   rescue         1 attempt x 105s                      ≈ 105s
//                                                  total ≈ 600s
//
// against a 270s budget. So whenever the script model was slow or overloaded it
// consumed the budget and the ONE stage that actually produces the storyboard
// JSON was left with nothing — surfacing to users as the repeated
// "Nhà cung cấp AI không trả lời trong thời gian cho phép" / "time budget
// exhausted" failures.
//
// Each stage now gets a capped share, and the storyboard stage keeps a hard
// floor that earlier stages can never spend.

/** Total wall clock for one plan generation. Vercel stops the action at 300s;
 * this keeps ~30s for JSON validation, prompt assembly and the response. */
export const PLAN_GENERATION_BUDGET_MS = 270_000;

/** Below this, starting another provider attempt is pointless. */
export const MIN_PROVIDER_FALLBACK_BUDGET_MS = 20_000;

/** Script writing, INCLUDING its provider fallback chain, may never exceed this. */
export const SCRIPT_STAGE_BUDGET_MS = 95_000;

/** Context IR is best-effort — it is skipped entirely rather than overrun. */
export const CONTEXT_STAGE_BUDGET_MS = 40_000;

/** Never spend this on earlier stages: it belongs to the storyboard JSON.
 * Sized to guarantee at least one full storyboard attempt (105s cap). */
export const STORYBOARD_STAGE_RESERVE_MS = 130_000;

/** Held back from the primary storyboard attempt so the cross-provider rescue
 * always has room to run instead of dying on an exhausted budget. */
export const STORYBOARD_RESCUE_RESERVE_MS = 70_000;

/**
 * Cap a stage at its own share while never exceeding the global deadline.
 *
 * @param globalDeadlineMs        absolute epoch ms when the whole request dies
 * @param stageBudgetMs           the most this stage may ever consume
 * @param reserveForLaterStagesMs time that must survive for later stages
 * @param nowMs                   injectable clock (tests)
 */
export function stageDeadlineMs(
  globalDeadlineMs: number,
  stageBudgetMs: number,
  reserveForLaterStagesMs: number,
  nowMs: number = Date.now()
): number {
  return Math.min(nowMs + stageBudgetMs, globalDeadlineMs - reserveForLaterStagesMs);
}

/**
 * Deadline for the PRIMARY storyboard attempt. Holds back room for one
 * cross-provider rescue, but only while enough time remains for both — when the
 * budget is already tight a rescue can no longer fit, so the primary attempt
 * gets everything instead of being shortened into a guaranteed timeout.
 */
export function storyboardPrimaryDeadlineMs(
  globalDeadlineMs: number,
  nowMs: number = Date.now()
): number {
  const remainingMs = globalDeadlineMs - nowMs;
  return remainingMs > STORYBOARD_RESCUE_RESERVE_MS * 2
    ? globalDeadlineMs - STORYBOARD_RESCUE_RESERVE_MS
    : globalDeadlineMs;
}

/**
 * Worst-case time the earlier stages can consume before the storyboard stage
 * starts. Used by the contract test to prove the storyboard reserve holds.
 */
export function maxPreStoryboardSpendMs(): number {
  return SCRIPT_STAGE_BUDGET_MS + CONTEXT_STAGE_BUDGET_MS;
}
