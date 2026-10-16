# Implementation status

Checked against the build prompt on 6 October 2026. The approved poster file was not in the repository. The official JNV emblem is used unchanged, and the page direction follows the written poster notes: forest, ivory, a restrained champagne edge, and a shallow embossed 15.

## Milestone 1

- [x] Design system, mobile navigation, and season pages
- [x] Confirmed 2026 facts only; unknowns stay blank
- [x] Registration is open from 6 October 2026 through 21 November 2026, 23:59 IST. Entry is free (fee 0). Version 2026.1 covers entry only, not match rules. Change the close time in organizer settings if needed.
- [x] Postgres schema, row-level security, and startup migrations
- [x] Embedded Postgres for local development; `DATABASE_URL` for Supabase or Railway
- [x] Supabase magic-link sign-in when configured; development sign-in refused in production
- [x] Captain draft, save, CSV preview, and idempotent submit

## Milestone 2

- [x] Captain desk, registration card without contact or payment details
- [x] Manual UPI instructions and QR only after fee, payee and VPA are saved
- [x] Payment evidence stays unverified until an organizer verifies it
- [x] Duplicate verified references rejected; refunds recorded, not transferred
- [x] Private receipt storage and authorized download
- [x] Organizer review, squad publish, lock override, and CSV exports
- [x] Audit log written by the server

## Milestone 3

- [x] Manual fixtures, CSV import, explicit round robin, and power-of-two knockout
- [x] Selected opponents are not expanded into a full league
- [x] Ground overlap, team overlap, rest, hours, breaks, and knockout order are reported
- [x] Infeasible generation saves nothing
- [x] Draft publish and schedule restore are transactional
- [x] Delay preview, then an explicit publish that bumps the calendar sequence
- [x] Match status, organizer summaries, CricHeroes links
- [x] Downstream matches flagged, not rewritten, when a winner changes
- [x] Manual or imported standings; NRR is not calculated
- [x] Match-day board with polling, backoff, and a venue display

## Milestone 4

- [x] Share cards for teams and matches, with no private fields
- [x] WhatsApp and copy-link actions started by the person
- [x] Calendar files in IST with a stable id and sequence
- [x] Sourced archive for editions 5, 6, 7, 11, 12, 13 and 14; other editions ask for help
- [x] Sponsor and consented gallery management; both stay hidden until something is published
- [x] PWA manifest and a service worker limited to public fixtures, match day and the offline page
- [x] Local "my team" choice

## Not in this version

- Phone or SMS OTP
- A payment gateway
- CricHeroes synchronization, scraping, or an embedded widget
- Automatic points or NRR
- Betting, fantasy, an AI chatbot, or a ball-by-ball scorer
- Kannada copy, QR check-in, volunteer assignments, jersey or meal counts
- A public deploy was not part of the first build. The live site is now on Railway: https://navodaya-cricket-league-production.up.railway.app

## Before launch

The public site is https://navodaya-cricket-league-production.up.railway.app. `DATABASE_URL` is the Neon database. Receipts on Railway are stored on a 1 GB volume at `/data`. Local `.env.local` still uses `http://localhost:3000` and `.data/uploads`.

Supabase URL, anon key, and service role are still empty. Authorize the Supabase MCP, then those can be filled in. Replace `ADMIN_EMAILS` with the organizer's real inbox before using magic-link sign-in. The current value is the GitHub noreply address for SrustikGowda.

Registration is open through 21 November 2026, 23:59 IST. Entry is free. Match rules are still unpublished.
