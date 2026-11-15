import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { siteUrl } from "../lib/site-url";

const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

test("the site address is read forgivingly and never crashes the build", () => {
  const read = (value: string | undefined) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = value;
    return siteUrl("http://fallback.test");
  };
  assert.equal(read("https://navodaya-cricket-league.up.railway.app"), "https://navodaya-cricket-league.up.railway.app");
  assert.equal(read("navodaya-cricket-league.up.railway.app"), "https://navodaya-cricket-league.up.railway.app", "a bare host is read as https");
  assert.equal(read("  https://example.org/  "), "https://example.org", "spaces and a trailing slash are dropped");
  assert.equal(read("https://example.org/some/path?x=1"), "https://example.org");
  assert.equal(read("http://127.0.0.1:3458"), "http://127.0.0.1:3458");
  assert.equal(read(undefined), "http://fallback.test");
  assert.equal(read(""), "http://fallback.test");
  assert.equal(read("https://"), "http://fallback.test", "an unusable value falls back");
  assert.equal(read("not a url at all"), "http://fallback.test");
});
