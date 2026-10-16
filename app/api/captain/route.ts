import { getActor } from "@/lib/auth";
import { captainAction } from "@/lib/captain-actions";
import { DomainError } from "@/lib/errors";
import { errorResponse, guardMutation, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await guardMutation(request, "captain");
    const actor = await getActor();
    if (!actor) throw new DomainError("Sign in is required.", 401, "unauthorized");
    return json(await captainAction(actor, await readJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
