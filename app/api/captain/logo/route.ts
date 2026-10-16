import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { saveImage } from "@/lib/files";
import { errorResponse, guardMutation, json } from "@/lib/http";
import { setLogoPath } from "@/lib/registration";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "logo");
    const actor = await getActor();
    if (!actor) throw new DomainError("Sign in is required.", 401, "unauthorized");
    const form = await request.formData();
    const file = form.get("file");
    const id = String(form.get("id") ?? "");
    if (!(file instanceof File)) throw new DomainError("Choose an image. Nothing was saved.");
    const stored = await saveImage("public", Buffer.from(await file.arrayBuffer()));
    await setLogoPath(await getDb(), actor, id, stored);
    return json({ path: stored });
  } catch (error) {
    return errorResponse(error);
  }
}
