import Link from "next/link";
import { ScheduleEditor } from "@/components/draw/schedule-editor";
import { getActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadScheduleEditor } from "@/lib/draw/timetable";

export const metadata = { title: "Edit match schedule" };

export default async function ScheduleEditorPage() {
  const actor = await getActor();
  if (actor?.role !== "organizer") return null;
  const schedule = await loadScheduleEditor(await getDb());

  if (!schedule) {
    return (
      <div className="stack">
        <h1>Edit match schedule</h1>
        <p>The two-day schedule is available after the official draw is published.</p>
        <Link className="button secondary" href="/admin/draw">Draw &amp; results</Link>
      </div>
    );
  }
  return <ScheduleEditor key={schedule.drawId} {...schedule} />;
}
