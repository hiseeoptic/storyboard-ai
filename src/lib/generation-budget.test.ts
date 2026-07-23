import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_GENERATION_BUDGET_MS,
  SCRIPT_STAGE_BUDGET_MS,
  CONTEXT_STAGE_BUDGET_MS,
  STORYBOARD_STAGE_RESERVE_MS,
  STORYBOARD_RESCUE_RESERVE_MS,
  stageDeadlineMs,
  storyboardPrimaryDeadlineMs,
  maxPreStoryboardSpendMs,
} from "./generation-budget.ts";

// The per-call cap on one Gemini storyboard attempt (ai-engine.ts). The reserve
// is worthless if it cannot fund at least one complete attempt.
const STORYBOARD_CALL_CAP_MS = 105_000;

test("the storyboard stage always keeps room for one full attempt", () => {
  // Even if EVERY earlier stage burns its entire share, the storyboard stage
  // must still be able to run one complete 105s attempt. This is the invariant
  // whose absence produced the repeated provider-timeout errors.
  const spent = maxPreStoryboardSpendMs();
  const remaining = PLAN_GENERATION_BUDGET_MS - spent;

  assert.ok(
    remaining >= STORYBOARD_STAGE_RESERVE_MS,
    `earlier stages may spend ${spent}ms, leaving ${remaining}ms — below the ${STORYBOARD_STAGE_RESERVE_MS}ms reserve`
  );
  assert.ok(
    remaining >= STORYBOARD_CALL_CAP_MS,
    `remaining ${remaining}ms cannot fund one ${STORYBOARD_CALL_CAP_MS}ms storyboard attempt`
  );
});

test("a stalled script stage cannot spend the storyboard reserve", () => {
  const start = 1_000_000;
  const deadline = start + PLAN_GENERATION_BUDGET_MS;

  const scriptDeadline = stageDeadlineMs(
    deadline,
    SCRIPT_STAGE_BUDGET_MS,
    STORYBOARD_STAGE_RESERVE_MS,
    start
  );

  // The whole fallback chain shares this one capped deadline.
  assert.equal(scriptDeadline - start, SCRIPT_STAGE_BUDGET_MS);
  assert.ok(deadline - scriptDeadline >= STORYBOARD_STAGE_RESERVE_MS);
});

test("context IR is skipped rather than eating the storyboard reserve", () => {
  const start = 1_000_000;
  const deadline = start + PLAN_GENERATION_BUDGET_MS;
  // Pretend the script stage already consumed its full share.
  const now = start + SCRIPT_STAGE_BUDGET_MS;

  const contextDeadline = stageDeadlineMs(
    deadline,
    CONTEXT_STAGE_BUDGET_MS,
    STORYBOARD_STAGE_RESERVE_MS,
    now
  );

  assert.ok(
    contextDeadline <= deadline - STORYBOARD_STAGE_RESERVE_MS,
    "context IR must never cross into the storyboard reserve"
  );
  // And what survives still funds a full storyboard attempt.
  assert.ok(deadline - contextDeadline >= STORYBOARD_CALL_CAP_MS);
});

test("the rescue reserve is held back only while both attempts still fit", () => {
  const deadline = 1_000_000 + PLAN_GENERATION_BUDGET_MS;

  // Plenty of time left → hold back room for the cross-provider rescue.
  const roomy = deadline - STORYBOARD_RESCUE_RESERVE_MS * 3;
  assert.equal(
    storyboardPrimaryDeadlineMs(deadline, roomy),
    deadline - STORYBOARD_RESCUE_RESERVE_MS
  );

  // Tight budget → a rescue can no longer fit, so the primary attempt gets
  // everything instead of being shortened into a guaranteed timeout.
  const tight = deadline - STORYBOARD_RESCUE_RESERVE_MS;
  assert.equal(storyboardPrimaryDeadlineMs(deadline, tight), deadline);
});
