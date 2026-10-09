import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { validateInitData } from "../src/server/auth";
const token = "test-token-not-a-secret";
const now = 2000000000;
function sign(overrides: Record<string, string> = {}) {
  const p = new URLSearchParams({
    auth_date: String(now),
    query_id: "query",
    user: JSON.stringify({ id: 450000000001, first_name: "Тест" }),
    ...overrides,
  });
  const s = [...p]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", key).update(s).digest("hex"));
  return p.toString();
}
describe("Telegram HMAC validation", () => {
  it("validates signature and preserves Telegram ID", () =>
    expect(validateInitData(sign(), token, now).telegramId).toBe(
      450000000001n,
    ));
  it("rejects tampering", () =>
    expect(() =>
      validateInitData(
        sign().replace("query_id=query", "query_id=forged"),
        token,
        now,
      ),
    ).toThrow());
  it("rejects an incorrect bot token", () =>
    expect(() => validateInitData(sign(), "other-token", now)).toThrow());
  it("rejects expired data", () =>
    expect(() =>
      validateInitData(sign({ auth_date: String(now - 301) }), token, now),
    ).toThrow());
  it("rejects future data", () =>
    expect(() =>
      validateInitData(sign({ auth_date: String(now + 31) }), token, now),
    ).toThrow());
  it("rejects duplicate fields", () =>
    expect(() =>
      validateInitData(`${sign()}&auth_date=${now}`, token, now),
    ).toThrow());
  it("rejects unsigned user data", () =>
    expect(() => validateInitData('user={"id":1}', token, now)).toThrow());
  it("rejects ID precision loss", () =>
    expect(() =>
      validateInitData(
        sign({ user: '{"id":9007199254740992,"first_name":"test"}' }),
        token,
        now,
      ),
    ).toThrow());
  it("canonicalizes replay identity across reordered parameters", () => {
    const raw = sign();
    const reordered = [...new URLSearchParams(raw)].reverse();
    expect(
      validateInitData(new URLSearchParams(reordered).toString(), token, now)
        .hash,
    ).toBe(validateInitData(raw, token, now).hash);
  });
});
