import { requireOrganizer } from "@/lib/auth";
import { saveMedia } from "@/lib/content";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { saveImage } from "@/lib/files";
import { errorResponse, guardMutation, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "media");
    const actor = await requireOrganizer();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Choose a photograph.");
    if (form.get("consent") !== "true") throw new DomainError("Confirm consent before saving a photograph.");
    const stored = await saveImage("public", Buffer.from(await file.arrayBuffer()));
    await saveMedia(await getDb(), actor, {
      path: stored,
      caption: String(form.get("caption") ?? ""),
      consent: true,
      published: form.get("published") === "true",
    });
    return json({ path: stored });
  } catch (error) {
    return errorResponse(error);
  }
}
