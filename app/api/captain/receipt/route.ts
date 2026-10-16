import { getActor } from "@/lib/auth";
import { DomainError } from "@/lib/errors";
import { saveImage } from "@/lib/files";
import { errorResponse, guardMutation, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "receipt");
    const actor = await getActor();
    if (!actor) throw new DomainError("Sign in is required.", 401, "unauthorized");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Choose a receipt image. The payment was not submitted.");
    const stored = await saveImage("private", Buffer.from(await file.arrayBuffer()));
    return json({ path: stored });
  } catch (error) {
    return errorResponse(error);
  }
}
