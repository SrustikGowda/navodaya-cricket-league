"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawBoard } from "@/lib/draw/board";
import { buildTimeline } from "@/lib/draw/timeline";
import type { DrawPlan } from "@/lib/draw/types";
import { formatIst } from "@/lib/format";
import { postJson } from "../post-json";
import { DrawStage, type StageMode } from "./draw-stage";
import { RealRunModal } from "./real-run-modal";
import { ScheduleViews, type InitialView } from "./schedule-views";
import { usePrefersReducedMotion } from "./use-motion";

type StageRequest = { mode: StageMode; plan: DrawPlan; revealAt: number; countdown: boolean; drawRef: string | null; key: number };


export function DrawStudio({
  initialBoard,
  isOrganizer,
  passwordConfigured,
  readiness,
  initial,
  about,
  children,
}: {
  initialBoard: DrawBoard;
  isOrganizer: boolean;
  passwordConfigured: boolean;
  readiness: { ready: boolean; message: string | null };
  initial: InitialView;
  /** The "how it works" block (server-rendered). Placed by state: after the draw buttons before the draw, after the fixtures once published. */
  about: React.ReactNode;
  /** Shown under the draw buttons before the official draw: the not-yet-published note, or a schedule published by hand. */
  children?: React.ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const [board, setBoard] = useState<DrawBoard>(initialBoard);
  const [trial, setTrial] = useState<DrawPlan | null>(null);
  const [stage, setStage] = useState<StageRequest | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const skew = useRef(0);
  const knownId = useRef<string | null>(initialBoard.official?.id ?? null);
  const stageOpen = useRef(false);
  const counter = useRef(0);
  const official = board.official;

  useEffect(() => {
    stageOpen.current = Boolean(stage);
  }, [stage]);

  const applyBoard = useCallback((next: DrawBoard) => {
    skew.current = Date.parse(next.serverTime) - Date.now();
    knownId.current = next.official?.id ?? null;
    setBoard(next);
  }, []);

  /** Starts the official reveal for a viewer whose shared start is now or recent, jumping to the right moment. */
  const joinLive = useCallback(
    (next: DrawBoard) => {
      const draw = next.official;
      if (!draw || stageOpen.current) return;
      const revealAt = Date.parse(draw.revealAt) - skew.current;
      const total = buildTimeline(draw.plan, { reduced, countdown: false }).total;
      // Past the end of the shared reveal there is nothing live to join; the visitor simply sees the published result.
      if (Date.now() - revealAt > total) return;
      counter.current += 1;
      setStage({ mode: "official", plan: draw.plan, revealAt, countdown: true, drawRef: draw.ref, key: counter.current });
    },
    [reduced],
  );

  // A visitor who opens the page during the reveal joins it in progress.
  useEffect(() => {
    skew.current = Date.parse(initialBoard.serverTime) - Date.now();
    if (initialBoard.official) joinLive(initialBoard);
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(
    async (live: boolean) => {
      const response = await fetch("/api/draw/official", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as DrawBoard;
      const isNew = next.official && next.official.id !== knownId.current;
      applyBoard(next);
      if (live && isNew) joinLive(next);
    },
    [applyBoard, joinLive],
  );

  // One live stream tells every viewer the moment the official draw is published. Without it, a light poll does the same job.
  useEffect(() => {
    let source: EventSource | null = null;
    let poller = 0;
    let stopped = false;
    const onState = (state: { state: string; id: string | null }) => {
      if (state.state === "published" && state.id !== knownId.current) void refresh(true);
      if (state.state === "none" && knownId.current) void refresh(false);
    };
    const startPolling = () => {
      if (poller || stopped) return;
      poller = window.setInterval(async () => {
        if (document.hidden) return;
        try {
          const response = await fetch("/api/draw/state", { cache: "no-store" });
          if (response.ok) onState((await response.json()) as { state: string; id: string | null });
        } catch {
          // Offline: try again on the next tick.
        }
      }, 5_000);
    };
    if (typeof EventSource === "undefined") startPolling();
    else {
      source = new EventSource("/api/draw/stream");
      source.addEventListener("draw", (event) => onState(JSON.parse((event as MessageEvent<string>).data)));
      source.onerror = () => {
        // The server ends each stream after about a minute and the browser reconnects by itself. Only a refused stream falls back to polling.
        if (source && source.readyState === EventSource.CLOSED) startPolling();
      };
    }
    return () => {
      stopped = true;
      source?.close();
      window.clearInterval(poller);
    };
  }, [refresh]);

  // Results, statuses and standings change while people watch.
  useEffect(() => {
    if (!official) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(false).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [official, refresh]);

  async function startTrial() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = (await postJson("/api/draw/trial", {})) as unknown as { plan: DrawPlan };
      setTrial(data.plan);
      counter.current += 1;
      setStage({ mode: "trial", plan: data.plan, revealAt: Date.now(), countdown: false, drawRef: null, key: counter.current });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trial draw could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function replay() {
    if (!official) return;
    counter.current += 1;
    setStage({ mode: "replay", plan: official.plan, revealAt: Date.now(), countdown: false, drawRef: official.ref, key: counter.current });
  }

  function onPublished(next: DrawBoard) {
    setModal(false);
    applyBoard(next);
    setTrial(null);
    if (next.official) {
      counter.current += 1;
      setStage({
        mode: "official",
        plan: next.official.plan,
        revealAt: Date.parse(next.official.revealAt) - skew.current,
        countdown: true,
        drawRef: next.official.ref,
        key: counter.current,
      });
    }
  }

  async function onAlreadyPublished() {
    setModal(false);
    setNotice("The official draw has already been published. Showing the saved result. It cannot be run again.");
    await refresh(false).catch(() => undefined);
  }

  function closeStage() {
    const mode = stage?.mode;
    setStage(null);
    if (mode === "trial") window.requestAnimationFrame(() => document.getElementById("dr-trial")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (mode === "official" || mode === "replay") window.requestAnimationFrame(() => document.getElementById("schedule")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function backToFormat() {
    setTrial(null);
    window.requestAnimationFrame(() => document.getElementById("format")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const messages = (
    <>
      {!readiness.ready && !official ? (
        <p className="dr-alert" role="alert">
          {readiness.message}
        </p>
      ) : null}
      {notice ? (
        <p className="dr-note" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="dr-alert" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const trialPanel =
    trial && !stage ? (
      <section className="dr-trial" id="dr-trial" aria-label="Trial draw result">
        <div className="dr-trial-bar" role="status">
          <span className="dr-tag dr-tag--trial">Trial</span>
          <p>
            <b>TRIAL / DEMO — NOT OFFICIAL.</b> A practice draw from the real teams. Nothing here is saved or published.
          </p>
          <div className="dr-trial-actions">
            <button type="button" className="dr-btn dr-btn--gold dr-btn--sm" onClick={startTrial} disabled={busy}>
              Try again
            </button>
            <button
              type="button"
              className="dr-btn dr-btn--ghost dr-btn--sm"
              onClick={() => {
                counter.current += 1;
                setStage({ mode: "trial", plan: trial, revealAt: Date.now(), countdown: false, drawRef: null, key: counter.current });
              }}
            >
              Replay this trial
            </button>
            <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" onClick={backToFormat}>
              Back to format
            </button>
          </div>
        </div>
        <ScheduleViews kind="trial" plan={trial} teams={board.teams} />
      </section>
    ) : null;

  const overlays = (
    <>
      {stage ? (
        <DrawStage key={stage.key} plan={stage.plan} mode={stage.mode} teams={board.teams} drawRef={stage.drawRef} revealAt={stage.revealAt} countdown={stage.countdown} onClose={closeStage} onAgain={stage.mode === "trial" ? () => void startTrial() : undefined} />
      ) : null}
      {modal ? <RealRunModal isOrganizer={isOrganizer} passwordConfigured={passwordConfigured} onClose={() => setModal(false)} onPublished={onPublished} onAlreadyPublished={() => void onAlreadyPublished()} /> : null}
    </>
  );

  // After the official draw, the page is about finding matches: status line, fixtures, then the format and a practice draw.
  if (official) {
    return (
      <>
        <div className="dr-status" role="status">
          <span className="dr-status-dot" aria-hidden="true" />
          <p>
            <b>Official draw</b>
            <span className="dr-status-ref">{official.ref}</span>
            <span className="dr-status-when">Published {formatIst(official.publishedAt)}</span>
          </p>
          {isOrganizer ? (
            <a className="dr-status-admin" href="/admin/settings#official-run">
              Redo? Delete this run in Settings
            </a>
          ) : null}
          <button type="button" className="dr-btn dr-btn--ghost dr-btn--sm" onClick={replay}>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="dr-play">
              <path d="M5 3.5v9l7-4.5z" />
            </svg>
            Replay the draw
          </button>
        </div>
        {messages}
        <section className="dr-fixtures" id="schedule" aria-label="Official fixtures">
          <ScheduleViews kind="official" plan={official.plan} fixtures={board.fixtures} qualification={board.qualification} teams={board.teams} drawRef={official.ref} initial={initial} />
        </section>
        <section className="dr-about dr-about--compact" id="format" aria-labelledby="dr-format-title">
          {about}
        </section>
        <section className="dr-practice" id="draw" aria-labelledby="dr-practice-title">
          <div>
            <h2 id="dr-practice-title">Practice draw</h2>
            <p>Run the same draw yourself with the real teams. Nothing is saved or published.</p>
          </div>
          <button type="button" className="dr-btn dr-btn--ghost" onClick={startTrial} disabled={busy}>
            {busy ? "Preparing…" : "TRIAL RUN"}
          </button>
        </section>
        {trialPanel}
        {overlays}
      </>
    );
  }

  // Before the official draw, the page is about the draw itself.
  return (
    <>
      <section className="dr-drawhero" id="draw" aria-labelledby="dr-draw-title">
        <p className="dr-eyebrow">The group draw</p>
        <h2 id="dr-draw-title">Drawn live, in front of every team</h2>
        <ol className="dr-steps">
          <li>
            <b>4</b>
            <span>seeded first: the 2025 semifinalists</span>
          </li>
          <li>
            <b>14</b>
            <span>drawn at random into the open places</span>
          </li>
          <li>
            <b>34</b>
            <span>fixtures and the two-day schedule, made at once</span>
          </li>
        </ol>
        {messages}
        <div className="dr-draw-actions">
          <div>
            <button type="button" className="dr-btn dr-btn--ghost dr-btn--xl" onClick={startTrial} disabled={busy || !readiness.ready}>
              {busy ? "Preparing…" : "TRIAL RUN"}
            </button>
            <small>Practice · nothing is saved</small>
          </div>
          <div>
            <button type="button" className="dr-btn dr-btn--gold dr-btn--xl" onClick={() => setModal(true)} disabled={!readiness.ready}>
              REAL RUN
            </button>
            <small>Organizers only · runs once</small>
          </div>
        </div>
        {children ? <div className="dr-draw-foot">{children}</div> : null}
      </section>
      {trialPanel}
      <section className="dr-about" id="format" aria-labelledby="dr-format-title">
        {about}
      </section>
      {overlays}
    </>
  );
}
