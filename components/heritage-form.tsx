"use client";

import { useState } from "react";
import { postJson } from "./post-json";

export function HeritageClient() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [claim, setClaim] = useState("");
  const [edition, setEdition] = useState("");
  const [source, setSource] = useState("");
  const [name, setName] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await postJson("/api/heritage", {
        editionNumber: edition ? Number(edition) : null,
        claim,
        sourceUrl: source,
        name,
      });
      setMessage(String(data.message ?? "Sent for review."));
      setClaim("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The note was not sent.");
    }
  }

  return (
    <details className="archive-contribute">
      <summary>
        <span>Have a result or photo from an earlier edition?</span>
        <span className="archive-action">Contribute to the archive</span>
      </summary>
      <form className="stack" onSubmit={submit}>
        <label className="field">Edition number<input className="text-input" inputMode="numeric" value={edition} onChange={(event) => setEdition(event.target.value)} /></label>
        <label className="field">What can you source?<textarea value={claim} onChange={(event) => setClaim(event.target.value)} required /></label>
        <label className="field">Source link<input className="text-input" value={source} onChange={(event) => setSource(event.target.value)} /></label>
        <label className="field">Your name, optional<input className="text-input" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <button className="button archive-submit" type="submit">Send for review</button>
        {message ? <p className="note" role="status">{message}</p> : null}
        {error ? <p className="alert" role="alert">{error}</p> : null}
      </form>
    </details>
  );
}
