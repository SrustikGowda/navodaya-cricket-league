"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Rule, RuleTable, Rulebook as Book } from "@/lib/rules";

const norm = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

function ruleText(rule: Rule): string {
  return norm([rule.text, ...(rule.items ?? []), rule.note ?? ""].join(" "));
}

function tableText(table: RuleTable): string {
  return norm([table.caption, ...table.head, ...table.rows.flat()].join(" "));
}

/**
 * The rulebook, laid out to be read on a phone at the ground: the key points first, then numbered sections that can be
 * searched. Numbers stay the same while searching, so "rule 6.2" means the same thing to everyone.
 */
export function Rulebook({ book, notes }: { book: Book; notes: string | null }) {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());

  const visible = useMemo(
    () =>
      book.sections.map((section) => ({
        section,
        rules: section.rules.map((rule, index) => ({ rule, number: index + 1, shown: !q || ruleText(rule).includes(q) || norm(section.title).includes(q) })),
        tables: (section.tables ?? []).map((table) => ({ table, shown: !q || tableText(table).includes(q) || norm(section.title).includes(q) })),
      })),
    [book, q],
  );
  const hits = visible.reduce((sum, entry) => sum + entry.rules.filter((rule) => rule.shown).length + entry.tables.filter((table) => table.shown).length, 0);

  return (
    <div className="rb">
      <header className="rb-hero">
        <p className="rb-kicker">{book.edition}</p>
        <h1>Rules</h1>
        <p className="rb-sub">{book.title}</p>
        <dl className="rb-facts">
          {book.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {notes ? (
        <aside className="rb-notes" aria-label="Notes from the organizers">
          <h2>Notes from the organizers</h2>
          <p>{notes}</p>
        </aside>
      ) : null}

      <section className="rb-glance" aria-labelledby="rb-glance-title">
        <h2 id="rb-glance-title">At a glance</h2>
        <ul>
          {book.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <div className="rb-layout">
        <aside className="rb-side">
          <label className="rb-search">
            <span>Find a rule</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="LBW, no-ball, bouncer, toss…" autoComplete="off" />
          </label>
          <nav className="rb-toc" aria-label="Sections">
            <ol>
              {book.sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    <span>{index + 1}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <button type="button" className="rb-print" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </aside>

        <div className="rb-body">
          {q ? (
            <p className="rb-count" role="status">
              {hits === 0 ? `No rule mentions “${query.trim()}”.` : `${hits} ${hits === 1 ? "match" : "matches"} for “${query.trim()}”.`}{" "}
              <button type="button" onClick={() => setQuery("")}>
                Show all rules
              </button>
            </p>
          ) : null}
          {visible.map(({ section, rules, tables }, sectionIndex) => {
            if (q && !rules.some((rule) => rule.shown) && !tables.some((table) => table.shown)) return null;
            return (
              <section key={section.id} id={section.id} className="rb-sec" aria-labelledby={`${section.id}-title`}>
                <header>
                  <span className="rb-num" aria-hidden="true">
                    {sectionIndex + 1}
                  </span>
                  <div>
                    <h2 id={`${section.id}-title`}>{section.title}</h2>
                    <p>{section.summary}</p>
                  </div>
                </header>
                <ol className="rb-rules">
                  {rules.map(({ rule, number, shown }) =>
                    shown ? (
                      <li key={number} id={`${section.id}-${number}`}>
                        <span className="rb-ref">
                          {sectionIndex + 1}.{number}
                        </span>
                        <div>
                          <p>{rule.text}</p>
                          {rule.items ? (
                            <ul>
                              {rule.items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                          {rule.note ? <p className="rb-note">{rule.note}</p> : null}
                        </div>
                      </li>
                    ) : null,
                  )}
                </ol>
                {tables.map(({ table, shown }) =>
                  shown ? (
                    <figure key={table.caption} className="rb-table">
                      <figcaption>{table.caption}</figcaption>
                      <table>
                        <thead>
                          <tr>
                            {table.head.map((cell) => (
                              <th key={cell} scope="col">
                                {cell}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, rowIndex) =>
                            row.length === 2 && row[1] === "" ? (
                              <tr key={rowIndex} className="rb-row-day">
                                <th colSpan={table.head.length} scope="rowgroup">
                                  {row[0]}
                                </th>
                              </tr>
                            ) : (
                              <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (cellIndex === 0 ? <th key={cellIndex} scope="row">{cell}</th> : <td key={cellIndex}>{cell}</td>))}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </figure>
                  ) : null,
                )}
              </section>
            );
          })}
          <p className="rb-foot">
            These rules can be updated by the Organizing Committee before the tournament. The full schedule is on the <Link href="/2026/fixtures">Fixtures page</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
