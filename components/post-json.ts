export class RequestError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string | null) {
    super(message);
    this.name = "RequestError";
    this.code = code ?? null;
  }
}

export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) throw new RequestError(data.error || "The change was not saved.", data.code);
  return data as Record<string, unknown>;
}
