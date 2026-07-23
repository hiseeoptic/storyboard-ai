import assert from "node:assert/strict";
import test from "node:test";
import { isPermanentProviderError, explainProviderError } from "./provider-errors.ts";

// The exact strings the app surfaced to the user, copied from a real run.
const DENIED_403 =
  "Storyboard generation failed after 2 attempts: Gemini text generation failed (403): Your project has been denied access. Please contact support.";
const QUOTA_ZERO =
  "Gemini image generation failed (no available model): gemini-2.5-flash-image (429): You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.5-flash-preview-image";

test("a denied project is permanent — never retried", () => {
  assert.equal(isPermanentProviderError(DENIED_403), true);
  assert.equal(isPermanentProviderError(new Error(DENIED_403)), true);
});

test("a zero-quota 429 is permanent, but ordinary rate limiting is not", () => {
  // "limit: 0" means the plan has no quota at all — retrying cannot help.
  assert.equal(isPermanentProviderError(QUOTA_ZERO), true);
  // A normal rate limit or an overload IS worth retrying.
  assert.equal(
    isPermanentProviderError("Gemini text generation failed (429): rate limit exceeded, retry in 5s"),
    false
  );
  assert.equal(
    isPermanentProviderError("Gemini text generation failed (503): model is overloaded, high demand"),
    false
  );
});

test("a plain timeout stays retryable", () => {
  assert.equal(isPermanentProviderError("Request aborted due to timeout"), false);
  assert.equal(isPermanentProviderError("Empty response from gemini"), false);
});

test("the 403 message names the real cause instead of dumping the API text", () => {
  const msg = explainProviderError(DENIED_403);
  assert.match(msg, /Gemini \(Google\)/);
  assert.match(msg, /403/);
  assert.match(msg, /lỗi tài khoản, không phải lỗi ứng dụng/);
  // The confusing raw English must not be passed through verbatim.
  assert.doesNotMatch(msg, /Please contact support/);
});

test("the zero-quota message tells the user to enable billing", () => {
  const msg = explainProviderError(QUOTA_ZERO);
  assert.match(msg, /hạn mức bằng 0/);
  assert.match(msg, /billing/i);
  assert.doesNotMatch(msg, /generativelanguage\.googleapis\.com/);
});

test("an unrecognised error is passed through unchanged", () => {
  const raw = "Something genuinely unexpected happened in the compiler";
  assert.equal(explainProviderError(raw), raw);
});
