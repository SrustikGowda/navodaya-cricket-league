import { DomainError } from "./errors";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 500_000) throw new DomainError("That request is too large.");
  const text = await request.text();
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object");
    return value as Record<string, unknown>;
  } catch {
    throw new DomainError("The form could not be read. Nothing was saved.");
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return json({ error: error.message, code: error.code, details: error.details ?? null }, error.status);
  }
  console.error(error);
  return json(
    {
      error: "The change was not saved. Refresh to see the last saved version. A registration reference appears only after a successful submit, and it is safe to retry.",
    },
    500,
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new DomainError("Cross-origin request blocked.", 403, "origin");
  }
  if (originHost !== host) throw new DomainError("Cross-origin request blocked.", 403, "origin");
}

export async function guardMutation(request: Request, bucket: string): Promise<void> {
  assertSameOrigin(request);
  const { clientKey, rateLimit } = await import("./rate-limit");
  if (!rateLimit(`${bucket}:${clientKey(request)}`, 30, 60_000)) {
    throw new DomainError("Too many attempts. Wait a minute and try again. Nothing was saved.", 429, "rate_limit");
  }
}
