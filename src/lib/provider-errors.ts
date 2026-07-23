// ─── AI provider error classification ───────────────────────────────────────
// Shared by the server actions, the AI engine and the board-image client so all
// three treat account failures the same way.

/**
 * A provider failure that RETRYING CANNOT FIX: the API key/project is denied or
 * invalid, or the plan has a hard zero quota. These are account problems, not
 * transient ones. Retrying them wastes attempts, wall-clock budget and (in the
 * image path) multi-second backoff sleeps, while delaying the fallback provider
 * that would actually have worked.
 *
 * Deliberately NOT treated as permanent: plain 429 rate limiting and 503
 * overload, which are genuinely transient and worth a retry. The exception is a
 * 429 reporting "limit: 0", which means the plan has no quota for this model at
 * all rather than "you are going too fast".
 */
export function isPermanentProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\((?:401|403)\)/.test(msg) ||
    /denied access|permission denied|api key not valid|invalid api key|api key expired|unregistered callers|billing (?:is )?(?:not|disabled)/i.test(
      msg
    ) ||
    /limit:\s*0\b/.test(msg)
  );
}

/** Best-effort provider name for the message, read from the raw error text. */
function providerLabel(raw: string): string {
  if (/gemini|generativelanguage/i.test(raw)) return "Gemini (Google)";
  if (/openai|gpt/i.test(raw)) return "OpenAI";
  if (/claude|anthropic/i.test(raw)) return "Claude (Anthropic)";
  return "nhà cung cấp AI";
}

/**
 * Turn a raw provider error into something the user can act on.
 *
 * A denied key, an invalid key or a zero quota is an ACCOUNT problem, not an
 * app fault — but the raw English API text ("Your project has been denied
 * access. Please contact support.") reads like the app broke, which sends
 * people hunting for a bug that is not there. Name the real cause instead.
 */
export function explainProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const provider = providerLabel(raw);

  if (/\(403\)|denied access|permission denied/i.test(raw)) {
    return `API key ${provider} bị từ chối quyền truy cập (403). Key hoặc project đang bị chặn, hoặc chưa được bật quyền dùng model này — kiểm tra lại API key và trạng thái project. Đây là lỗi tài khoản, không phải lỗi ứng dụng.`;
  }
  if (/\(401\)|api key not valid|invalid api key|api key expired/i.test(raw)) {
    return `API key ${provider} không hợp lệ hoặc đã hết hạn (401) — cập nhật lại key trong biến môi trường.`;
  }
  if (/limit:\s*0\b/.test(raw)) {
    return `Gói ${provider} đang có hạn mức bằng 0 cho model này (chưa bật thanh toán) — bật billing cho project hoặc chọn model khác. Đây là lỗi tài khoản, không phải lỗi ứng dụng.`;
  }
  if (/\(429\)|exceeded your current quota|rate.?limit/i.test(raw)) {
    return `${provider} báo vượt hạn mức (429) — chờ vài phút rồi thử lại, hoặc nâng hạn mức.`;
  }
  if (/\(503\)|overload|high demand/i.test(raw)) {
    return `${provider} đang quá tải (503) — thử lại sau vài phút.`;
  }
  return raw;
}
