import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { readStoredFile } from "@/lib/files";
import { errorResponse } from "@/lib/http";
import { assertReceiptAccess } from "@/lib/payments";
import { DomainError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!actor) throw new DomainError("Sign in is required.", 401, "unauthorized");
    const { id } = await context.params;
    const payment = await assertReceiptAccess(await getDb(), actor, id);
    if (!payment.receiptPath) throw new DomainError("No receipt was stored for this attempt.", 404, "not_found");
    const file = await readStoredFile(payment.receiptPath);
    if (!file) throw new DomainError("The receipt file is no longer available.", 404, "not_found");
    return new Response(new Uint8Array(file.bytes), {
      headers: { "content-type": file.contentType, "cache-control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
