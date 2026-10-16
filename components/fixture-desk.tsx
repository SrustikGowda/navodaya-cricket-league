"use client";

import { AdminFeedback, useAdminPost } from "./admin-post";

type Option = { id: string; name: string };
type Match = {
  id: string;
  number: string;
  teams: string;
  when: string;
  status: string;
  version: number;
  needsResolution: boolean;
};
type Version = { id: string; status: string; note: string };

const STATUSES = ["scheduled", "delayed", "in_progress", "completed", "abandoned", "cancelled"];

export function FixtureDesk({
  grounds,
  groups,
  teams,
  matches,
  versions,
}: {
  grounds: Option[];
  groups: Option[];
  teams: Option[];
  matches: Match[];
  versions: Version[];
}) {
  return (
    <div className="stack">
      <h1>Fixtures</h1>
      <p className="quiet">Matches stay in the draft until you publish them. Times are IST.</p>
      <GroundForm />
      {grounds.length > 0 ? <ul>{grounds.map((ground) => <li key={ground.id}>{ground.name}</li>)}</ul> : <p>No grounds yet.</p>}
      <GroupForm groups={groups} teams={teams} grounds={grounds} />
      <MatchForm grounds={grounds} teams={teams} />
      <ImportForm />
      <PublishForm />
      <DelayForm grounds={grounds} />
      <h2>Draft matches</h2>
      {matches.length === 0 ? <p>No draft matches.</p> : matches.map((match) => <MatchCard key={match.id} match={match} />)}
      <h2>Earlier versions</h2>
      {versions.length === 0 ? <p>No saved versions.</p> : versions.map((version) => <VersionRow key={version.id} version={version} />)}
    </div>
  );
}

function GroundForm() {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void form.submit("ground", { name: String(data.get("name") ?? "") });
    }}>
      <h2>Grounds</h2>
      <label className="field">Ground name<input className="text-input" name="name" required /></label>
      <button className="button" type="submit" disabled={form.pending}>Add ground</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function GroupForm({ groups, teams, grounds }: { groups: Option[]; teams: Option[]; grounds: Option[] }) {
  const members = useAdminPost();
  const create = useAdminPost();
  const robin = useAdminPost();
  const knockout = useAdminPost();
  return (
    <div className="stack">
      <h2>Groups</h2>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void create.submit("group", { name: String(data.get("name") ?? "") });
      }}>
        <label className="field">New group<input className="text-input" name="name" required /></label>
        <button className="button" type="submit" disabled={create.pending}>Create group</button>
        <AdminFeedback message={create.message} error={create.error} />
      </form>
      {groups.length === 0 ? <p>Create a group before generating a round robin.</p> : (
        <>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void members.submit("group-members", { groupId: String(data.get("groupId") ?? ""), registrationIds: data.getAll("team").map(String) });
          }}>
            <label className="field">Group
              <select className="text-input" name="groupId" required>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            </label>
            <fieldset className="stack">
              <legend>Approved teams in this group</legend>
              {teams.length === 0 ? <p>No approved teams yet.</p> : teams.map((team) => (
                <label key={team.id}><input type="checkbox" name="team" value={team.id} /> {team.name}</label>
              ))}
            </fieldset>
            <button className="button" type="submit" disabled={members.pending}>Save group</button>
            <AdminFeedback message={members.message} error={members.error} />
          </form>
          <form className="stack" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void robin.submit("round-robin", {
              groupId: String(data.get("groupId") ?? ""),
              durationMinutes: Number(data.get("durationMinutes")),
              replace: data.get("replace") === "on",
            });
          }}>
            <label className="field">Round robin group
              <select className="text-input" name="groupId">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            </label>
            <label className="field">Minutes per match<input className="text-input" name="durationMinutes" type="number" min={1} defaultValue={60} required /></label>
            <label><input type="checkbox" name="replace" /> Replace the current draft</label>
            <button className="button" type="submit" disabled={robin.pending}>Generate round robin</button>
            <AdminFeedback message={robin.message} error={robin.error} />
          </form>
        </>
      )}
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const selected = data.getAll("team").map(String);
        void knockout.submit("knockout", {
          registrationIds: selected,
          groundId: String(data.get("groundId") ?? ""),
          startsAt: String(data.get("startsAt") ?? ""),
          durationMinutes: Number(data.get("durationMinutes")),
          replace: data.get("replace") === "on",
        });
      }}>
        <h2>Knockout</h2>
        <TeamChecks teams={teams} />
        <label className="field">Ground
          <select className="text-input" name="groundId" required>
            {grounds.map((ground) => <option key={ground.id} value={ground.id}>{ground.name}</option>)}
          </select>
        </label>
        <KnockoutFields />
        <AdminFeedback message={knockout.message} error={knockout.error} />
      </form>
    </div>
  );
}

function KnockoutFields() {
  return (
    <>
      <label className="field">First match, IST<input className="text-input" name="startsAt" type="datetime-local" required /></label>
      <label className="field">Minutes per match<input className="text-input" name="durationMinutes" type="number" min={1} defaultValue={60} required /></label>
      <label><input type="checkbox" name="replace" /> Replace the current draft</label>
      <button className="button" type="submit">Generate knockout</button>
    </>
  );
}

function TeamChecks({ teams }: { teams: Option[] }) {
  if (teams.length === 0) return <p>Approve teams before generating a knockout.</p>;
  return (
    <fieldset className="stack">
      <legend>Teams</legend>
      {teams.map((team) => <label key={team.id}><input type="checkbox" name="team" value={team.id} defaultChecked /> {team.name}</label>)}
    </fieldset>
  );
}

function MatchForm({ grounds, teams }: { grounds: Option[]; teams: Option[] }) {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const number = String(data.get("matchNumber") ?? "").trim();
      void form.submit("fixture", {
        groundId: String(data.get("groundId") ?? ""),
        teamA: String(data.get("teamA") ?? ""),
        teamB: String(data.get("teamB") ?? ""),
        startsAt: String(data.get("startsAt") ?? ""),
        durationMinutes: Number(data.get("durationMinutes")),
        stage: String(data.get("stage") ?? "league"),
        matchNumber: number ? Number(number) : null,
        reportingMinutesBefore: blankNumber(data.get("reportingMinutesBefore")),
      });
    }}>
      <h2>Add a match</h2>
      {grounds.length === 0 ? <p>Add a ground before adding a match.</p> : (
        <>
          <label className="field">Ground
            <select className="text-input" name="groundId" required>{grounds.map((ground) => <option key={ground.id} value={ground.id}>{ground.name}</option>)}</select>
          </label>
          <TeamField name="teamA" label="Team A" />
          <TeamField name="teamB" label="Team B" />
          <datalist id="approved-teams">{teams.map((team) => <option key={team.id} value={team.name} />)}</datalist>
          <label className="field">Start, IST<input className="text-input" name="startsAt" type="datetime-local" required /></label>
          <label className="field">Duration in minutes<input className="text-input" name="durationMinutes" type="number" min={1} defaultValue={70} required /></label>
          <label className="field">Stage
            <select className="text-input" name="stage"><option>league</option><option>quarterfinal</option><option>semifinal</option><option>final</option></select>
          </label>
          <label className="field">Match number<input className="text-input" name="matchNumber" type="number" min={1} /></label>
          <label className="field">Report this many minutes before<input className="text-input" name="reportingMinutesBefore" type="number" min={0} /></label>
          <button className="button" type="submit" disabled={form.pending}>Add match</button>
        </>
      )}
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function TeamField({ name, label }: { name: string; label: string }) {
  return (
    <label className="field">{label}
      <input className="text-input" name={name} list="approved-teams" required placeholder="Team name, or Winner QF1" />
    </label>
  );
}

function ImportForm() {
  const form = useAdminPost();
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void form.submit("import-fixtures", { csv: String(data.get("csv") ?? ""), replace: data.get("replace") === "on" });
    }}>
      <h2>Import matches</h2>
      <label className="field">CSV
        <textarea name="csv" placeholder={"match_number,stage,ground,team_a,team_b,starts_at,duration_minutes\n1,league,Main ground,Team A,Team B,2026-11-15 09:30,70"} />
      </label>
      <label><input type="checkbox" name="replace" /> Replace the current draft</label>
      <button className="button" type="submit" disabled={form.pending}>Import</button>
      <AdminFeedback message={form.message} error={form.error} />
    </form>
  );
}

function PublishForm() {
  const check = useAdminPost();
  const publish = useAdminPost();
  return (
    <div className="stack">
      <h2>Publish</h2>
      <button className="button secondary" type="button" disabled={check.pending} onClick={() => void check.submit("check-schedule", {})}>Check draft</button>
      <AdminFeedback message={check.message} error={check.error} />
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void publish.submit("publish-schedule", { note: String(data.get("note") ?? "") });
      }}>
        <label className="field">Note<input className="text-input" name="note" /></label>
        <button className="button" type="submit" disabled={publish.pending}>Publish draft</button>
        <AdminFeedback message={publish.message} error={publish.error} />
      </form>
    </div>
  );
}

function DelayForm({ grounds }: { grounds: Option[] }) {
  const preview = useAdminPost();
  const publish = useAdminPost();
  function body(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      groundId: String(data.get("groundId") ?? ""),
      from: String(data.get("from") ?? ""),
      delayMinutes: Number(data.get("delayMinutes")),
      note: String(data.get("note") ?? ""),
    };
  }
  return (
    <form className="stack" onSubmit={(event) => event.preventDefault()}>
      <h2>Delay published matches</h2>
      {grounds.length === 0 ? <p>Add a ground first.</p> : (
        <>
          <label className="field">Ground
            <select className="text-input" name="groundId">{grounds.map((ground) => <option key={ground.id} value={ground.id}>{ground.name}</option>)}</select>
          </label>
          <label className="field">From, IST<input className="text-input" name="from" type="datetime-local" required /></label>
          <label className="field">Delay in minutes<input className="text-input" name="delayMinutes" type="number" min={1} defaultValue={30} required /></label>
          <label className="field">Note<input className="text-input" name="note" /></label>
          <div className="review-row">
            <button className="button secondary" type="button" disabled={preview.pending} onClick={(event) => void preview.submit("preview-delay", body(event.currentTarget.form!))}>Preview</button>
            <button className="button" type="button" disabled={publish.pending} onClick={(event) => void publish.submit("publish-delay", body(event.currentTarget.form!))}>Publish delay</button>
          </div>
        </>
      )}
      <AdminFeedback message={preview.message || publish.message} error={preview.error || publish.error} />
    </form>
  );
}

function MatchCard({ match }: { match: Match }) {
  const status = useAdminPost();
  const result = useAdminPost();
  const resolve = useAdminPost();
  return (
    <article className="section">
      <h2>#{match.number} {match.teams}</h2>
      <p>{match.when} · {match.status}</p>
      <form className="review-row" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void status.submit("status", { fixtureId: match.id, status: String(data.get("status") ?? ""), version: match.version });
      }}>
        <label className="field">Status
          <select className="text-input" name="status" defaultValue={match.status}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <button className="button" type="submit" disabled={status.pending}>Update status</button>
      </form>
      <AdminFeedback message={status.message} error={status.error} />
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void result.submit("result", {
          fixtureId: match.id,
          summary: String(data.get("summary") ?? ""),
          source: "manual",
          winnerLabel: String(data.get("winnerLabel") ?? ""),
          scorecardUrl: String(data.get("scorecardUrl") ?? ""),
        });
      }}>
        <label className="field">Result summary<textarea name="summary" required minLength={3} /></label>
        <label className="field">Winner<input className="text-input" name="winnerLabel" /></label>
        <label className="field">Scorecard link<input className="text-input" name="scorecardUrl" type="url" /></label>
        <button className="button" type="submit" disabled={result.pending}>Save result</button>
        <AdminFeedback message={result.message} error={result.error} />
      </form>
      {match.needsResolution ? (
        <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void resolve.submit("resolve", { fixtureId: match.id, note: String(data.get("note") ?? "") });
        }}>
          <label className="field">Resolution note<input className="text-input" name="note" required /></label>
          <button className="button secondary" type="submit" disabled={resolve.pending}>Clear the resolution flag</button>
          <AdminFeedback message={resolve.message} error={resolve.error} />
        </form>
      ) : null}
    </article>
  );
}

function VersionRow({ version }: { version: Version }) {
  const form = useAdminPost();
  return (
    <div>
      <p>{version.status}{version.note ? ` · ${version.note}` : ""}</p>
      {version.status !== "draft" ? (
        <>
          <button className="button secondary" type="button" disabled={form.pending} onClick={() => void form.submit("restore-schedule", { versionId: version.id })}>Restore this version</button>
          <AdminFeedback message={form.message} error={form.error} />
        </>
      ) : null}
    </div>
  );
}

function blankNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}
