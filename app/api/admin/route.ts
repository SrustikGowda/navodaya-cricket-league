import { requireOrganizer } from "@/lib/auth";
import { adminAction } from "@/lib/admin-actions";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "admin");
    const actor = await requireOrganizer();
    return json(await adminAction(actor, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
