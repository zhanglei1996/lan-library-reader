import { randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function createReadableAccessCode() {
  const value = randomBytes(4).readUInt32BE();
  return String(value % 100_000_000).padStart(8, "0");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(request, name) {
  const header = request.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function createAccessController(accessCode) {
  const expectedCode = typeof accessCode === "string" ? accessCode.trim() : "";
  const enabled = expectedCode.length > 0;
  const sessions = new Map();
  const attempts = new Map();
  const cookieName = "lan_reader_session";

  function cleanup(now = Date.now()) {
    for (const [token, expiresAt] of sessions) {
      if (expiresAt <= now) sessions.delete(token);
    }
    for (const [address, record] of attempts) {
      if (record.startedAt + ATTEMPT_WINDOW_MS <= now) attempts.delete(address);
    }
  }

  function clientAddress(request) {
    return request.socket.remoteAddress ?? "unknown";
  }

  function isAuthenticated(request) {
    if (!enabled) return true;
    cleanup();
    const token = cookieValue(request, cookieName);
    const expiresAt = token ? sessions.get(token) : undefined;
    return Boolean(expiresAt && expiresAt > Date.now());
  }

  function login(request, providedCode) {
    if (!enabled) return { ok: true, cookie: null };
    cleanup();
    const address = clientAddress(request);
    const current = attempts.get(address);
    if (current && current.count >= MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.startedAt + ATTEMPT_WINDOW_MS - Date.now()) / 1000),
      );
      return { ok: false, rateLimited: true, retryAfterSeconds };
    }
    if (!safeEqual(providedCode ?? "", expectedCode)) {
      attempts.set(address, current
        ? { ...current, count: current.count + 1 }
        : { count: 1, startedAt: Date.now() });
      return { ok: false, rateLimited: false };
    }
    attempts.delete(address);
    const token = randomBytes(32).toString("base64url");
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return {
      ok: true,
      cookie: `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    };
  }

  function logout(request) {
    const token = cookieValue(request, cookieName);
    if (token) sessions.delete(token);
    return `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  }

  return {
    enabled,
    isAuthenticated,
    login,
    logout,
  };
}
