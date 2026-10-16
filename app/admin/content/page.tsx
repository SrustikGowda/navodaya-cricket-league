import { ContentDesk } from "@/components/content-desk";
import { adminSnapshot } from "@/lib/admin-actions";
import { getActor } from "@/lib/auth";

export default async function ContentPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "organizer") return null;
  const { announcements, sponsors, media, heritage, audit } = await adminSnapshot(actor);
  return (
    <>
      <ContentDesk
        announcements={announcements.map((item) => ({
          id: String(item.id),
          title: String(item.title ?? ""),
          body: String(item.body ?? ""),
          published: item.published === true,
        }))}
        sponsors={sponsors.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          url: String(item.url ?? ""),
          published: item.published === true,
        }))}
        heritage={heritage.map((item) => ({
          id: String(item.id),
          claim: String(item.claim ?? ""),
          status: String(item.status ?? ""),
        }))}
      />
      <h2>Photographs</h2>
      <form className="stack" action="/api/admin/media" method="post" encType="multipart/form-data">
        <label className="field">Photograph<input className="text-input" type="file" name="file" accept="image/png,image/jpeg,image/webp" required /></label>
        <label className="field">Caption<input className="text-input" name="caption" /></label>
        <label><input type="checkbox" name="consent" value="true" required /> People in the photograph consented</label>
        <label><input type="checkbox" name="published" value="true" /> Publish</label>
        <button className="button" type="submit">Upload photograph</button>
      </form>
      {media.length === 0 ? <p>No photographs saved.</p> : <ul>{media.map((item) => <li key={String(item.id)}>{String(item.caption ?? item.path)}</li>)}</ul>}
      <h2>Recent activity</h2>
      {audit.length === 0 ? <p>No activity yet.</p> : <ul>{audit.slice(0, 40).map((item) => <li key={String(item.id)}>{String(item.created_at)} · {String(item.action)} · {String(item.actor_email ?? "system")}</li>)}</ul>}
    </>
  );
}
