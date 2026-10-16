"use client";

import { AdminFeedback, useAdminPost } from "./admin-post";

type Announcement = { id: string; title: string; body: string; published: boolean };
type Sponsor = { id: string; name: string; url: string; published: boolean };
type Heritage = { id: string; claim: string; status: string };

export function ContentDesk({
  announcements,
  sponsors,
  heritage,
}: {
  announcements: Announcement[];
  sponsors: Sponsor[];
  heritage: Heritage[];
}) {
  return (
    <div className="stack">
      <h1>Content</h1>
      <AnnouncementForm />
      {announcements.map((item) => <AnnouncementForm key={item.id} item={item} />)}
      <SponsorForm />
      {sponsors.map((item) => <SponsorForm key={item.id} item={item} />)}
      <ArchiveForm />
      <AliasForm />
      <h2>Heritage queue</h2>
      {heritage.length === 0 ? <p>No submissions waiting.</p> : heritage.map((item) => <HeritageReview key={item.id} item={item} />)}
    </div>
  );
}

function AnnouncementForm({ item }: { item?: Announcement }) {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void form.submit("announcement", {
        id: item?.id,
        title: String(data.get("title") ?? ""),
        body: String(data.get("body") ?? ""),
        published: data.get("published") === "on",
      });
    }}>
      {item ? null : <h2>Announcement</h2>}
      <label className="field">Title<input className="text-input" name="title" required defaultValue={item?.title ?? ""} /></label>
      <label className="field">Message<textarea name="body" required defaultValue={item?.body ?? ""} /></label>
      <label><input type="checkbox" name="published" defaultChecked={item?.published ?? false} /> Publish</label>
      <button className="button" type="submit" disabled={form.pending}>{item ? "Update announcement" : "Save announcement"}</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function SponsorForm({ item }: { item?: Sponsor }) {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void form.submit("sponsor", {
        id: item?.id,
        name: String(data.get("name") ?? ""),
        url: String(data.get("url") ?? ""),
        published: data.get("published") === "on",
      });
    }}>
      {item ? null : <h2>Sponsor</h2>}
      <label className="field">Name<input className="text-input" name="name" required defaultValue={item?.name ?? ""} /></label>
      <label className="field">Website<input className="text-input" name="url" type="url" defaultValue={item?.url ?? ""} /></label>
      <label><input type="checkbox" name="published" defaultChecked={item?.published ?? false} /> Publish</label>
      <button className="button" type="submit" disabled={form.pending}>{item ? "Update sponsor" : "Save sponsor"}</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function ArchiveForm() {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const year = String(data.get("year") ?? "").trim();
      void form.submit("archive", {
        editionNumber: Number(data.get("editionNumber")),
        year: year ? Number(year) : null,
        champion: String(data.get("champion") ?? ""),
        runnerUp: String(data.get("runnerUp") ?? ""),
        venueNote: String(data.get("venueNote") ?? ""),
        notes: String(data.get("notes") ?? ""),
        sourceUrl: String(data.get("sourceUrl") ?? ""),
        verificationStatus: String(data.get("verificationStatus") ?? "unverified"),
      });
    }}>
      <h2>Archive entry</h2>
      <label className="field">Edition number<input className="text-input" name="editionNumber" type="number" min={1} required /></label>
      <label className="field">Year<input className="text-input" name="year" type="number" min={1960} max={2100} /></label>
      <label className="field">Champion<input className="text-input" name="champion" /></label>
      <label className="field">Runner-up<input className="text-input" name="runnerUp" /></label>
      <label className="field">Venue note<input className="text-input" name="venueNote" /></label>
      <label className="field">Notes<textarea name="notes" /></label>
      <label className="field">Source URL<input className="text-input" name="sourceUrl" type="url" /></label>
      <label className="field">Verification
        <select className="text-input" name="verificationStatus">
          <option value="unverified">Unverified</option>
          <option value="partial">Partial</option>
          <option value="verified">Verified</option>
        </select>
      </label>
      <button className="button" type="submit" disabled={form.pending}>Save archive entry</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function AliasForm() {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void form.submit("alias", {
        alias: String(data.get("alias") ?? ""),
        admissionYear: blankYear(data.get("admissionYear")),
        leavingYear: blankYear(data.get("leavingYear")),
        seasonYear: blankYear(data.get("seasonYear")),
        notes: String(data.get("notes") ?? ""),
      });
    }}>
      <h2>Batch alias</h2>
      <label className="field">Alias<input className="text-input" name="alias" required /></label>
      <label className="field">Admission year<input className="text-input" name="admissionYear" type="number" /></label>
      <label className="field">Leaving year<input className="text-input" name="leavingYear" type="number" /></label>
      <label className="field">Season year<input className="text-input" name="seasonYear" type="number" defaultValue={2026} /></label>
      <label className="field">Notes<textarea name="notes" defaultValue="Confirmed by the organizer." /></label>
      <button className="button" type="submit" disabled={form.pending}>Save alias</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function HeritageReview({ item }: { item: Heritage }) {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => event.preventDefault()}>
      <p>{item.claim}</p>
      <p className="quiet">{item.status}</p>
      {item.status === "pending" ? (
        <>
          <label className="field">Note<input className="text-input" name="note" /></label>
          <div className="review-row">
            <button className="button" type="button" disabled={form.pending} onClick={(event) => void form.submit("heritage", { id: item.id, status: "accepted", note: String(new FormData(event.currentTarget.form ?? undefined).get("note") ?? "") })}>Accept</button>
            <button className="button secondary" type="button" disabled={form.pending} onClick={(event) => void form.submit("heritage", { id: item.id, status: "rejected", note: String(new FormData(event.currentTarget.form ?? undefined).get("note") ?? "") })}>Reject</button>
          </div>
        </>
      ) : null}
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function blankYear(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}
