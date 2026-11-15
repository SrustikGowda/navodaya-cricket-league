"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RULEBOOK_LIMITS, RulebookContent, RulebookEditorState } from "@/lib/rulebook";
import { postJson, RequestError } from "./post-json";

type Limits = typeof RULEBOOK_LIMITS;

type EdPoint = { key: string; text: string };
type EdRule = { key: string; text: string; items: string; note: string; showItems: boolean; showNote: boolean };
type EdTable = { key: string; caption: string; head: string[]; rows: string[][] };
type EdSection = { key: string; id: string; title: string; summary: string; rules: EdRule[]; tables: EdTable[] };
type Draft = { highlights: EdPoint[]; sections: EdSection[] };

let seq = 0;
const nextKey = () => `k${(seq += 1)}`;

const emptyRule = (): EdRule => ({ key: nextKey(), text: "", items: "", note: "", showItems: false, showNote: false });

/** Editor rows for a rulebook. Keys are reused by position, so open sections stay open after a save. */
function toDraft(content: RulebookContent, previous?: Draft): Draft {
  return {
    highlights: content.highlights.map((text, index) => ({ key: previous?.highlights[index]?.key ?? nextKey(), text })),
    sections: content.sections.map((section, index) => {
      const before = previous?.sections[index];
      return {
        key: before?.key ?? nextKey(),
        id: section.id,
        title: section.title,
        summary: section.summary,
        rules: section.rules.map((rule, ruleIndex) => ({
          key: before?.rules[ruleIndex]?.key ?? nextKey(),
          text: rule.text,
          items: (rule.items ?? []).join("\n"),
          note: rule.note ?? "",
          showItems: Boolean(rule.items?.length),
          showNote: Boolean(rule.note),
        })),
        tables: (section.tables ?? []).map((table, tableIndex) => ({
          key: before?.tables[tableIndex]?.key ?? nextKey(),
          caption: table.caption,
          head: [...table.head],
          rows: table.rows.map((row) => [...row]),
        })),
      };
    }),
  };
}

function toContent(draft: Draft): RulebookContent {
  return {
    highlights: draft.highlights.map((point) => point.text),
    sections: draft.sections.map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      rules: section.rules.map((rule) => {
        const items = rule.items
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        return { text: rule.text, ...(items.length > 0 ? { items } : {}), ...(rule.note.trim() ? { note: rule.note } : {}) };
      }),
      ...(section.tables.length > 0 ? { tables: section.tables.map(({ caption, head, rows }) => ({ caption, head, rows })) } : {}),
    })),
  };
}

const snapshot = (draft: Draft) => JSON.stringify(toContent(draft));

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

function Tools({ label, onUp, onDown, onDelete }: { label: string; onUp?: () => void; onDown?: () => void; onDelete: () => void }) {
  return (
    <span className="re-tools">
      <button type="button" className="re-tool" onClick={onUp} disabled={!onUp} aria-label={`Move ${label} up`} title="Move up">
        ↑
      </button>
      <button type="button" className="re-tool" onClick={onDown} disabled={!onDown} aria-label={`Move ${label} down`} title="Move down">
        ↓
      </button>
      <button type="button" className="re-tool is-danger" onClick={onDelete} aria-label={`Delete ${label}`} title="Delete">
        ✕
      </button>
    </span>
  );
}

/**
 * Admin › Rules. Every part of the rulebook can be changed: the "At a glance" points, each section's title and summary,
 * every rule (with its points and note), and the tables. Nothing goes live until Save; the rule numbers follow the order.
 */
export function RulesEditor({ initial, limits }: { initial: RulebookEditorState; limits: Limits }) {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial.content));
  const [baseline, setBaseline] = useState(() => snapshot(toDraft(initial.content)));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; reload?: boolean } | null>(null);
  const dirty = snapshot(draft) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (change: (draft: Draft) => Draft) => {
    setMessage(null);
    setDraft(change);
  };
  const editSections = (change: (sections: EdSection[]) => EdSection[]) => edit((current) => ({ ...current, sections: change(current.sections) }));
  const editSection = (si: number, change: (section: EdSection) => EdSection) => editSections((list) => list.map((section, index) => (index === si ? change(section) : section)));
  const editRule = (si: number, ri: number, patch: Partial<EdRule>) =>
    editSection(si, (section) => ({ ...section, rules: section.rules.map((rule, index) => (index === ri ? { ...rule, ...patch } : rule)) }));
  const editTable = (si: number, ti: number, change: (table: EdTable) => EdTable) =>
    editSection(si, (section) => ({ ...section, tables: section.tables.map((table, index) => (index === ti ? change(table) : table)) }));
  const toggle = (key: string, value?: boolean) =>
    setOpen((current) => {
      const next = new Set(current);
      if (value ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await postJson("/api/admin", { action: "rules-save", version: state.version, content: toContent(draft) });
      const next = data.rules as RulebookEditorState;
      const fresh = toDraft(next.content, draft);
      setState(next);
      setDraft(fresh);
      setBaseline(snapshot(fresh));
      setMessage({
        kind: "ok",
        text: next.edited
          ? "Saved. The Rules page now shows your changes."
          : "Saved. The Rules page shows the standard rules, and their dates and times follow the timetable again.",
      });
    } catch (caught) {
      const conflict = caught instanceof RequestError && caught.code === "version_conflict";
      setMessage({ kind: "error", text: caught instanceof Error ? caught.message : "The rules were not saved.", reload: conflict });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (!window.confirm("Undo every change since the last save?")) return;
    setDraft((current) => toDraft(state.content, current));
    setMessage(null);
  }

  function startFromStandard() {
    if (!window.confirm("Replace everything in the editor with the standard rules? Nothing changes on the website until you press Save.")) return;
    setDraft((current) => toDraft(state.standard, current));
    setMessage({ kind: "ok", text: "The standard rules are in the editor. Press Save to put them on the website." });
  }

  const ruleCount = draft.sections.reduce((sum, section) => sum + section.rules.length, 0);
  const allOpen = draft.sections.length > 0 && draft.sections.every((section) => open.has(section.key));

  return (
    <div className="re">
      <header className="re-head">
        <div>
          <h1>Rules</h1>
          <p className="quiet">
            {state.edited
              ? `Your wording is on the website${state.updatedLabel ? ` · saved ${state.updatedLabel}` : ""}${state.updatedBy ? ` by ${state.updatedBy}` : ""}.`
              : "The website shows the standard rules. Their dates and times follow the season settings and the timetable."}
          </p>
        </div>
        <Link className="button secondary" href="/2026/rules" target="_blank" rel="noopener">
          View the rules page
        </Link>
      </header>

      {state.edited && state.stale ? (
        <p className="re-warn" role="note">
          The season details or the match timetable have changed since these rules were saved. Check the dates, times and team numbers below, then press Save. You can also start
          again from the standard rules at the bottom of this page.
        </p>
      ) : null}

      <p className="re-help">
        Change any text, move or delete rules, then press <b>Save</b>. Rule numbers such as 8.3 follow the order. The dates, venue and organizers at the top of the page come from{" "}
        <Link href="/admin/settings">Settings</Link>, along with the organizers&apos; notes.
      </p>

      <section className="set-card" aria-labelledby="re-glance">
        <div className="set-head">
          <h2 id="re-glance">At a glance</h2>
          <span className="set-count">
            {draft.highlights.length} of {limits.highlights}
          </span>
        </div>
        <p className="quiet">The most important points, shown first in short.</p>
        <ol className="re-points">
          {draft.highlights.map((point, index) => (
            <li key={point.key}>
              <textarea
                rows={1}
                className="re-grow"
                aria-label={`At a glance point ${index + 1}`}
                value={point.text}
                maxLength={limits.highlight}
                onChange={(event) =>
                  edit((current) => ({ ...current, highlights: current.highlights.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)) }))
                }
              />
              <Tools
                label={`point ${index + 1}`}
                onUp={index > 0 ? () => edit((current) => ({ ...current, highlights: move(current.highlights, index, index - 1) })) : undefined}
                onDown={index < draft.highlights.length - 1 ? () => edit((current) => ({ ...current, highlights: move(current.highlights, index, index + 1) })) : undefined}
                onDelete={() => edit((current) => ({ ...current, highlights: current.highlights.filter((_, i) => i !== index) }))}
              />
            </li>
          ))}
        </ol>
        {draft.highlights.length < limits.highlights ? (
          <button type="button" className="re-add" onClick={() => edit((current) => ({ ...current, highlights: [...current.highlights, { key: nextKey(), text: "" }] }))}>
            + Add a point
          </button>
        ) : null}
      </section>

      <div className="re-sections-head">
        <h2>
          Sections{" "}
          <span>
            {draft.sections.length} sections · {ruleCount} rules
          </span>
        </h2>
        <button type="button" className="re-link" onClick={() => setOpen(allOpen ? new Set() : new Set(draft.sections.map((section) => section.key)))}>
          {allOpen ? "Close all" : "Open all"}
        </button>
      </div>

      <ol className="re-sections">
        {draft.sections.map((section, si) => {
          const isOpen = open.has(section.key);
          const n = si + 1;
          return (
            <li key={section.key} className={isOpen ? "re-sec is-open" : "re-sec"}>
              <div className="re-sec-bar">
                <button type="button" className="re-sec-toggle" aria-expanded={isOpen} onClick={() => toggle(section.key)}>
                  <span className="re-num">{n}</span>
                  <span className="re-sec-name">
                    {section.title.trim() || "Untitled section"}
                    <small>
                      {section.rules.length} {section.rules.length === 1 ? "rule" : "rules"}
                      {section.tables.length > 0 ? ` · ${section.tables.length} ${section.tables.length === 1 ? "table" : "tables"}` : ""}
                    </small>
                  </span>
                  <span className="re-chev" aria-hidden="true" />
                </button>
                <Tools
                  label={`section ${n}`}
                  onUp={si > 0 ? () => editSections((list) => move(list, si, si - 1)) : undefined}
                  onDown={si < draft.sections.length - 1 ? () => editSections((list) => move(list, si, si + 1)) : undefined}
                  onDelete={() => {
                    if (window.confirm(`Delete section ${n}, "${section.title.trim() || "Untitled section"}", with all its rules and tables?`))
                      editSections((list) => list.filter((_, i) => i !== si));
                  }}
                />
              </div>

              {isOpen ? (
                <div className="re-sec-body">
                  <div className="set-grid">
                    <label className="field">
                      Section title
                      <input
                        className="text-input"
                        value={section.title}
                        maxLength={limits.title}
                        onChange={(event) => editSection(si, (s) => ({ ...s, title: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>
                        What it covers <span className="optional">one line</span>
                      </span>
                      <input
                        className="text-input"
                        value={section.summary}
                        maxLength={limits.summary}
                        onChange={(event) => editSection(si, (s) => ({ ...s, summary: event.target.value }))}
                      />
                    </label>
                  </div>

                  <ol className="re-rules">
                    {section.rules.map((rule, ri) => {
                      const ref = `${n}.${ri + 1}`;
                      return (
                        <li key={rule.key} className="re-rule">
                          <div className="re-rule-top">
                            <span className="re-ref">{ref}</span>
                            <Tools
                              label={`rule ${ref}`}
                              onUp={ri > 0 ? () => editSection(si, (s) => ({ ...s, rules: move(s.rules, ri, ri - 1) })) : undefined}
                              onDown={ri < section.rules.length - 1 ? () => editSection(si, (s) => ({ ...s, rules: move(s.rules, ri, ri + 1) })) : undefined}
                              onDelete={() => editSection(si, (s) => ({ ...s, rules: s.rules.filter((_, i) => i !== ri) }))}
                            />
                          </div>
                          <textarea
                            aria-label={`Rule ${ref}`}
                            rows={3}
                            value={rule.text}
                            maxLength={limits.text}
                            onChange={(event) => editRule(si, ri, { text: event.target.value })}
                          />
                          {rule.showItems ? (
                            <label className="field">
                              <span>
                                Points under this rule <span className="optional">one per line</span>
                              </span>
                              <textarea
                                rows={Math.max(2, rule.items.split("\n").length)}
                                value={rule.items}
                                onChange={(event) => editRule(si, ri, { items: event.target.value })}
                              />
                            </label>
                          ) : null}
                          {rule.showNote ? (
                            <label className="field">
                              <span>
                                Small note <span className="optional">an exception or an explanation, shown smaller</span>
                              </span>
                              <input className="text-input" value={rule.note} maxLength={limits.note} onChange={(event) => editRule(si, ri, { note: event.target.value })} />
                            </label>
                          ) : null}
                          {!rule.showItems || !rule.showNote ? (
                            <div className="re-rule-more">
                              {!rule.showItems ? (
                                <button type="button" className="re-link" onClick={() => editRule(si, ri, { showItems: true })}>
                                  + Points under this rule
                                </button>
                              ) : null}
                              {!rule.showNote ? (
                                <button type="button" className="re-link" onClick={() => editRule(si, ri, { showNote: true })}>
                                  + Small note
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {section.rules.length < limits.rules ? (
                    <button type="button" className="re-add" onClick={() => editSection(si, (s) => ({ ...s, rules: [...s.rules, emptyRule()] }))}>
                      + Add a rule
                    </button>
                  ) : null}

                  {section.tables.map((table, ti) => (
                    <div key={table.key} className="re-table">
                      <div className="re-table-top">
                        <label className="field">
                          Table title
                          <input
                            className="text-input"
                            value={table.caption}
                            maxLength={limits.caption}
                            onChange={(event) => editTable(si, ti, (t) => ({ ...t, caption: event.target.value }))}
                          />
                        </label>
                        <Tools
                          label={`table ${ti + 1} in section ${n}`}
                          onUp={ti > 0 ? () => editSection(si, (s) => ({ ...s, tables: move(s.tables, ti, ti - 1) })) : undefined}
                          onDown={ti < section.tables.length - 1 ? () => editSection(si, (s) => ({ ...s, tables: move(s.tables, ti, ti + 1) })) : undefined}
                          onDelete={() => {
                            if (window.confirm(`Delete the table "${table.caption.trim() || "Untitled"}"?`))
                              editSection(si, (s) => ({ ...s, tables: s.tables.filter((_, i) => i !== ti) }));
                          }}
                        />
                      </div>
                      <div className="re-grid-wrap">
                        <div className="re-grid" style={{ ["--cols" as string]: table.head.length }}>
                          <div className="re-grid-row is-head">
                            {table.head.map((cell, c) => (
                              <textarea
                                key={`h${c}`}
                                rows={1}
                                className="re-grow re-cell is-head"
                                aria-label={`Column ${c + 1} heading`}
                                value={cell}
                                maxLength={limits.cell}
                                onChange={(event) => editTable(si, ti, (t) => ({ ...t, head: t.head.map((value, i) => (i === c ? event.target.value : value)) }))}
                              />
                            ))}
                            <span aria-hidden="true" />
                          </div>
                          {table.rows.map((row, r) => (
                            <div key={r} className="re-grid-row">
                              {row.map((cell, c) => (
                                <textarea
                                  key={c}
                                  rows={1}
                                  className="re-grow re-cell"
                                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                                  value={cell}
                                  maxLength={limits.cell}
                                  onChange={(event) =>
                                    editTable(si, ti, (t) => ({
                                      ...t,
                                      rows: t.rows.map((cells, i) => (i === r ? cells.map((value, j) => (j === c ? event.target.value : value)) : cells)),
                                    }))
                                  }
                                />
                              ))}
                              <button
                                type="button"
                                className="re-tool is-danger"
                                aria-label={`Delete row ${r + 1}`}
                                title="Delete row"
                                onClick={() => editTable(si, ti, (t) => ({ ...t, rows: t.rows.filter((_, i) => i !== r) }))}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="re-hint">To make a row a heading, such as a day, fill in only its first cell.</p>
                      <div className="re-table-actions">
                        {table.rows.length < limits.rows ? (
                          <button type="button" className="re-link" onClick={() => editTable(si, ti, (t) => ({ ...t, rows: [...t.rows, t.head.map(() => "")] }))}>
                            + Add a row
                          </button>
                        ) : null}
                        {table.head.length < limits.columns ? (
                          <button
                            type="button"
                            className="re-link"
                            onClick={() => editTable(si, ti, (t) => ({ ...t, head: [...t.head, ""], rows: t.rows.map((row) => [...row, ""]) }))}
                          >
                            + Add a column
                          </button>
                        ) : null}
                        {table.head.length > 1 ? (
                          <button
                            type="button"
                            className="re-link"
                            onClick={() => {
                              if (window.confirm("Remove the last column and everything in it?"))
                                editTable(si, ti, (t) => ({ ...t, head: t.head.slice(0, -1), rows: t.rows.map((row) => row.slice(0, -1)) }));
                            }}
                          >
                            − Remove the last column
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {section.tables.length < limits.tables ? (
                    <button
                      type="button"
                      className="re-add is-quiet"
                      onClick={() => editSection(si, (s) => ({ ...s, tables: [...s.tables, { key: nextKey(), caption: "", head: ["", ""], rows: [["", ""]] }] }))}
                    >
                      + Add a table
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {draft.sections.length < limits.sections ? (
        <button
          type="button"
          className="re-add"
          onClick={() => {
            const section: EdSection = { key: nextKey(), id: "", title: "", summary: "", rules: [emptyRule()], tables: [] };
            editSections((list) => [...list, section]);
            toggle(section.key, true);
          }}
        >
          + Add a section
        </button>
      ) : null}

      <section className="set-card re-reset" aria-labelledby="re-reset">
        <h2 id="re-reset">Start again from the standard rules</h2>
        <p className="quiet">
          Puts the standard rules back in the editor, with this season&apos;s dates and the current timetable. Your wording stays on the website until you press Save.
        </p>
        <div>
          <button type="button" className="button secondary" onClick={startFromStandard} disabled={busy}>
            Use the standard rules
          </button>
        </div>
      </section>

      <div className={dirty ? "re-bar is-dirty" : "re-bar"}>
        <p role="status" className={message?.kind === "error" ? "is-error" : undefined}>
          {message ? message.text : dirty ? "You have changes that are not saved yet." : "Everything is saved."}
          {message?.reload ? (
            <>
              {" "}
              <button type="button" className="re-link" onClick={() => window.location.reload()}>
                Reload
              </button>
            </>
          ) : null}
        </p>
        <div className="re-bar-actions">
          <button type="button" className="button secondary" onClick={discard} disabled={!dirty || busy}>
            Undo changes
          </button>
          <button type="button" className="button" onClick={save} disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
