import { createHmac, timingSafeEqual } from "node:crypto";

type SessionPayload = { uid: string; exp: number };

export function sealSession(userId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 } satisfies SessionPayload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function openSession(token: string, secret: string): SessionPayload | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionPayload;
    if (!data.uid || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET ?? "";
  return secret.length >= 16 ? secret : null;
}
