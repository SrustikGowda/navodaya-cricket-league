"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DrawBoard } from "@/lib/draw/board";
import { postJson, RequestError } from "../post-json";

type Step = "password" | "confirm" | "running" | "error";

export const CONFIRMATION_TEXT =
  "This will generate and publish the official NCL 2026 groups and fixtures. This action cannot be repeated without an organizer-authorized reset.";

/**
 * Real run, in two deliberate steps. The password is checked on the server (and checked again with the final request),
 * the confirmation text is shown only after that, and one request id is kept for the whole session so a retry after a
 * dropped connection can never create a second draw.
 */
export function RealRunModal({
  isOrganizer,
  passwordConfigured,
  onClose,
  onPublished,
  onAlreadyPublished,
}: {
  isOrganizer: boolean;
  passwordConfigured: boolean;
  onClose: () => void;
  onPublished: (board: DrawBoard) => void;
  onAlreadyPublished: () => void;
}) {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(`draw-${crypto.randomUUID()}`);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (inputRef.current ?? headingRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && step !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/draw/real/authorize", { password });
      setStep("confirm");
    } catch (caught) {
      if (caught instanceof RequestError && caught.code === "draw_exists") {
        onAlreadyPublished();
        return;
      }
      setError(caught instanceof Error ? caught.message : "The password could not be checked.");
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (busy || !understood) return;
    setBusy(true);
    setError("");
    setStep("running");
    try {
      const result = (await postJson("/api/draw/real", { password, requestId: requestId.current })) as unknown as { board: DrawBoard };
      onPublished(result.board);
    } catch (caught) {
      if (caught instanceof RequestError && caught.code === "draw_exists") {
        onAlreadyPublished();
        return;
      }
      setError(caught instanceof Error ? caught.message : "The connection dropped. It is safe to try again: a repeat cannot create a second draw.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dr-modal-back" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && step !== "running" && onClose()}>
      <div className="dr-modal" role="dialog" aria-modal="true" aria-labelledby="dr-modal-title">
        <p className="dr-eyebrow">Official draw</p>
        <h2 id="dr-modal-title" tabIndex={-1} ref={headingRef}>
          Real run
        </h2>

        {!isOrganizer ? (
          <>
            <p>The official draw can only be started by a signed-in organizer.</p>
            <div className="dr-modal-actions">
              <Link className="dr-btn dr-btn--gold" href="/admin/login">
                Organizer sign-in
              </Link>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : !passwordConfigured ? (
          <>
            <p className="dr-alert" role="alert">
              The draw password is not set on the server, so the official draw is switched off. Ask whoever deploys the site to set <code>NCL_FIXTURE_RUN_PASSWORD</code>.
            </p>
            <div className="dr-modal-actions">
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : step === "password" ? (
          <form onSubmit={verify}>
            <p>Enter the draw password to continue. Nothing is drawn yet.</p>
            <label className="dr-field">
              <span>Draw password</span>
              <input ref={inputRef} type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "dr-modal-error" : undefined} />
            </label>
            {error ? (
              <p id="dr-modal-error" className="dr-alert" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dr-modal-actions">
              <button type="submit" className="dr-btn dr-btn--gold" disabled={!password || busy}>
                {busy ? "Checking…" : "Continue"}
              </button>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        ) : step === "confirm" ? (
          <>
            <p className="dr-confirm-text">{CONFIRMATION_TEXT}</p>
            <label className="dr-check-row">
              <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
              <span>I understand. The draw happens once and is shown to everyone.</span>
            </label>
            <div className="dr-modal-actions">
              <button type="button" className="dr-btn dr-btn--gold" disabled={!understood || busy} onClick={run}>
                Generate and publish the official draw
              </button>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : step === "running" ? (
          <div className="dr-running" role="status">
            <span className="dr-spinner" aria-hidden="true" />
            <p>Running the draw on the server and saving it. Do not close this page.</p>
          </div>
        ) : (
          <>
            <p className="dr-alert" role="alert">
              {error}
            </p>
            <p>If the draw was already saved, trying again returns that same draw. It never makes a new one.</p>
            <div className="dr-modal-actions">
              <button type="button" className="dr-btn dr-btn--gold" onClick={run} disabled={busy}>
                Try again
              </button>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
