import { submitHeritage } from "@/lib/content";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "heritage");
    const body = await readJson(request);
    await submitHeritage(await import("@/lib/db").then((module) => module.getDb()), {
      editionNumber: body.editionNumber ? Number(body.editionNumber) : null,
      year: body.year ? Number(body.year) : null,
      claim: String(body.claim ?? ""),
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      name: typeof body.name === "string" ? body.name : null,
      email: typeof body.email === "string" ? body.email : null,
    });
    return json({ ok: true, message: "Sent to the organizers for review. It is not published yet." });
  } catch (error) {
    return errorResponse(error);
  }
}
