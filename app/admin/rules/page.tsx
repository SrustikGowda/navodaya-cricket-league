import "./rules-editor.css";
import { RulesEditor } from "@/components/rules-editor";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { RULEBOOK_LIMITS, rulebookEditorState } from "@/lib/rulebook";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rules" };

export default async function AdminRulesPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const state = await rulebookEditorState(await getDb());
  return <RulesEditor initial={state} limits={RULEBOOK_LIMITS} />;
}
