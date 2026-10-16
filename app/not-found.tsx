import { BackButton } from "@/components/back-button";

export default function NotFound() {
  return (
    <main id="content" className="main-wrap">
      <BackButton />
      <h1>That page is not on the card.</h1>
      <p><a className="button" href="/2026">Back to home</a></p>
    </main>
  );
}
