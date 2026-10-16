# NCL 2026 — Cursor build prompt

Paste the following prompt into Cursor Agent, or attach this file and ask Cursor to implement it. Add the original JNV logo and the approved poster to the repository as visual references. The event must remain usable without the poster.

---

You are the lead product designer and full-stack engineer building the permanent website for the JNVCKM Alumni Group's Navodaya Cricket League. Build a polished, working application with a real database, captain portal and organizer dashboard. This is an alumni cricket tournament with strong batch identity, pride and reunion value. It must work especially well on phones, including WhatsApp's browser.

First inspect the existing repository and its instructions. Reuse a suitable existing stack and preserve unrelated work. If empty, use Next.js App Router, TypeScript, Tailwind CSS, accessible UI primitives, Supabase Postgres/Auth/Storage, Zod validation, and Playwright for critical user journeys. Verify current compatible versions against official documentation and pin dependencies. Keep it a single deployable application. No microservices, Kubernetes or custom authentication framework. Support standard Node hosting such as Railway; document the chosen deployment path without publishing automatically.

Work in milestones below and implement them in order. Do not stop after a landing page, mockups or a plan. Maintain IMPLEMENTATION_STATUS.md so completed functionality, missing credentials and optional extensions are clear. Use safe configurable defaults and do not block development on missing tournament decisions. Do not claim an external service works without testing it.

## 1. Event facts and unknowns

Confirmed facts, supplied by the organizer:
- Name: Navodaya Cricket League 2026.
- Short name: NCL 2026.
- Edition: 15th edition.
- Community: JNVCKM Alumni Group.
- Organizer credit: Organized by Alumni Batch 2005–2012.
- The organizing batch is NOT a participant eligibility restriction.
- Dates: 28 and 29 November 2026, Asia/Kolkata timezone.
- Venue: Loyala School Ground.
- Address: Kothnur Main Rd, Kothnur, Kalena Agrahara, Bengaluru, 560076.
- Initial registration status: Registration opens soon.

Preserve the supplied venue spelling until the organizer changes it. Keep the venue name and a separately verified Maps link editable. Do not invent map coordinates.

Unknown: registration opening/closing dates, fee, payee/UPI account, refund policy, team cap, squad limits, eligibility rules, ball type, playing XI size, overs by stage, grounds available in 2026, daily operating hours, fixture format, points/tiebreak rules, prizes, contacts, sponsors, livestream and 2026 CricHeroes tournament URL.

Store these as nullable configuration. Never publish invented values. Show useful 'To be announced' states. Validate required settings before an admin opens registrations or publishes a schedule; provide an organizer checklist explaining what is missing. Historical 2025 rules are not 2026 rules. Registration deadline, roster lock and event start are separate settings. If start time is unset, display the dates rather than a fabricated hour-level countdown.

## 2. Visual direction

Make it look like a premium sports editorial website celebrating a 15th edition. Use deep charcoal/forest green, restrained brushed champagne-gold accents, warm ivory reading surfaces and strong typography. Draw inspiration from the approved embossed poster but interpret it subtly for the web.

- A dimensional NCL 15 medallion or shallow embossed numeral in the hero; static optimized imagery and CSS shadows are sufficient.
- Preserve the official JNV logo; do not redraw or distort its lettering.
- Spacious asymmetrical hero, elegant editorial headlines, readable body text, fine dividers and deliberate page rhythm.
- Use real supplied alumni cricket photography when available. Never present generated people as actual participants.
- Avoid full-page gold texture, excessive beveling, generic glowing stadium art, a grid of identical cards, purple gradients, fake counters and unrelated stock photos.
- Use real HTML text for all event information, not text baked into the poster.
- Responsive from 360px mobile to wide desktop; keyboard navigation, clear focus, good contrast, 44px touch targets, reduced-motion support.
- No autoplay audio, mandatory WebGL or heavy animation. Optimize assets and lazy-load the gallery.
- Mobile navigation: Home, Fixtures, Teams, More. Keep the registration/captain action accessible without covering content.

## 3. Public website

Use season-specific URLs, such as /2026, /2026/register, /2026/teams, /2026/teams/[slug], /2026/fixtures, /2026/matches/[id], /2026/standings and /history. Redirect the root to the active season or a compact permanent NCL home.

Homepage order:
1. Compact community navigation and JNV logo.
2. Hero with title, 15th edition, dates, venue, organizer credit and registration state.
3. Primary action appropriate to state: registration opens soon / register team / manage registration / view fixtures. A voluntary interest form is optional and must not count as registration.
4. Approved team count derived from actual data; omit capacity messaging if cap is unknown.
5. Current announcements and a relevant next-match section once fixtures are published.
6. Batch/team identity area, selected approved photographs and verified heritage highlights.
7. Sponsors only when actual sponsors are entered.
8. Venue, rules/FAQ, organizer contact when configured, privacy information.

Spectators need no login. Hide unpublished schedules and private application data. Public teams appear only when approved. Each team page includes its edition-specific name, batch, approved logo/photo, consenting public squad names and roles, schedule, results and scorecard links.

Allow a spectator to select 'My team' without authentication, stored locally. Surface that team's next match, ground, reporting time, opponent and recent result. Add user-initiated WhatsApp sharing, copy-link and downloadable calendar events in IST. Calendar exports must handle rescheduled events with stable identifiers and updated sequence numbers.

## 4. Captain registration and portal

Use Supabase email OTP or magic-link authentication for captains, with clear return-to-form behavior. Phone/SMS OTP is a future optional provider, not a fake working feature. Public browsing requires no account.

Registration wizard:
1. Team name, batch admission and leaving year, optional team logo and optional existing CricHeroes team URL.
2. Captain name, verified email and private mobile/WhatsApp number; optional vice-captain name and contact.
3. Squad editor: player name, batch, cricket role, optional jersey number and optional CricHeroes profile URL. Support save-and-resume and simple CSV upload with preview/validation. Only enforce minimum/maximum players once configured.
4. Versioned rules acknowledgement and publication consent for names/photos. Explain what information is public. No Aadhaar, PAN or unnecessary personal documents.
5. Review and submit. Present a durable registration reference only after the database transaction succeeds.

Create persistent drafts tied to the authenticated captain. Server-side validation is authoritative. Idempotent submission must prevent duplicates from retries, slow mobile connections and double clicks. Handle capacity atomically. If waitlisting is enabled, explain its status clearly and do not take a registration fee from waitlisted teams by default.

Registration states: draft, submitted, changes_requested, approved, waitlisted, rejected, withdrawn. Record reasons and the actor for review actions. Keep payment state independent. Allow captain edits before roster lock, with approved public changes subject to organizer review. After lock, use a documented admin override with an audit reason.

Detect duplicate CricHeroes player IDs within a season if supplied. Name matches should trigger review rather than automatically merging people or rejecting them. Do not assume one team per batch unless the organizer explicitly configures that rule. Stable batch identity is separate from each year's team name.

Captain dashboard: application checklist, review messages, squad, payment status, upcoming fixtures, reporting details and a downloadable team registration card. Public cards must not expose captain contact details or payment references.

## 5. Payment review

V1: organizer-configured manual UPI payment instructions with QR/deep link, amount, payee and reference guidance. If no fee/payee is configured, do not show a fake QR or enable payment collection. A configured zero fee means free registration.

Captain submits transaction reference and optional receipt. Payment states: not_required, awaiting_payment, submitted, verified, rejected, refund_pending, refunded. A screenshot or UPI-app return is never proof of settlement. Only an authorized admin can verify after checking the receiving account. Store amount in integer paise. Prevent duplicate use of a verified reference and require a reason for reversals.

Keep receipts in private storage with short-lived authorized access. Record attempts/history rather than overwriting evidence. Add CSV export for reconciliation. Record refunds and their references; do not imply the app transfers money automatically. A payment gateway may be added later with server-side order creation, signature checks, webhook verification and idempotency, but is not required for v1.

## 6. Fixtures and match day

Public fixtures must filter by day, team, stage and ground. Offer a mobile chronological list and a desktop ground-by-time schedule. Show scheduled time, updated time where applicable, reporting time if configured, match number, teams, overs if known, stage, ground and status.

Statuses: scheduled, delayed, in_progress, completed, abandoned, cancelled. Also support TBD opponents such as 'Winner QF1' and 'Group A rank 1'; do not create fictional teams for these.

Organizer schedule editor:
- Manual entry and validated CSV import are required in v1.
- Optional round-robin generation within organizer-created small groups and a seeded knockout bracket.
- Explicitly support selected-opponent league schedules entered manually. Do not silently assume every team plays all teams in its group.
- Configure venues/grounds, opening/closing times, breaks, duration per stage, transition buffer and minimum team rest.
- Detect simultaneous bookings of the same ground, overlapping team matches, insufficient rest and knockout dependency violations.
- Report infeasible schedules with reasons; never silently drop games or compress below configured constraints.
- Draft, preview and publish a version atomically. Never expose half-published changes.
- Display scheduling assumptions before generation. Do not recreate last year's format automatically.
- Delay controls preview proposed changes for affected future matches on a ground, then rerun cross-ground team and knockout checks. Admin publishes changes explicitly.
- Show 'Last updated' and a short change note after rescheduling. Keep a revision history.

Match-day page: NOW / NEXT / LATER per configured ground, selected team's next match, announcements, delays and scorecard/livestream links. In-progress status is organizer-maintained, not a claim of ball-by-ball scoring. Use modest polling with backoff/visibility handling; show offline or stale state. Provide a clean full-screen display mode for a venue TV.

When a knockout result is corrected, flag or invalidate affected downstream draft slots. Never silently change participants in a match already underway or completed; require explicit organizer resolution.

## 7. CricHeroes and standings

CricHeroes remains the scoring source in the proposed v1. Store an external tournament URL and per-match scorecard URL and render 'View scorecard on CricHeroes'. Match summaries may be entered or imported by organizers, with source and update timestamp. Do not label manually entered scores as a live feed.

No automatic scraping, private endpoints, invented APIs or assumed iframe embedding. If approved integration documentation and credentials become available later, implement a provider adapter without changing public page components. The application must work with no CricHeroes API.

V1 standings: authorized organizer entry or CSV import of a complete table, including played/won/lost/tied/no-result/points/NRR/rank. Validate data, preserve source and audit changes, preview and publish atomically. Support 'Awaiting results'. Do not invent NRR from winning margins or from incomplete innings data. Keep table updates distinct from fixture updates and flag standings as needing review after a relevant result correction.

If automatic points/NRR is implemented later, it requires configured competition rules and accurate innings data. Store legal balls as integers: 5.3 overs means 33 balls, never 5.3 decimal overs. Cover all-out allocation rules, revised overs, ties, no-results and walkovers explicitly. Publish no calculated rank or qualification when the required rule or data is missing.

## 8. Heritage and identity

Provide a multi-edition archive with edition number, year, dates when verified, champions, runners-up, organizer batch, photos and source links. Separate long-lived batch identity from edition-specific teams. Support admin-confirmed aliases; do not automatically equate differently named teams because their batch matches.

Research notes below are useful background, not permission to populate missing facts. Seed only clearly sourced archive records and store their source URLs plus a verification status. Do not populate 2026 registrations with historical teams. Unknown edition histories should say 'Help us complete this edition' and allow submissions to an organizer moderation queue. Keep Navodaya Premier League (NPL) and other schools' Navodaya tournaments separate.

Minimal heritage seeds may use the verified 2023/2024/2025 final results below. Earlier missing champion fields remain null. Do not claim 15 years of continuous play merely because this is the 15th edition.

## 9. Organizer dashboard and data model

V1 roles: visitor, captain and organizer/admin. Enforce permissions on the server and through database row-level security; hiding UI is not authorization. Bootstrap admin access through documented owner setup, never by allowing a user to select the admin role. Optional restricted finance/scheduler/volunteer roles are phase two.

Dashboard manages event configuration, registration reviews, squad locks, payments, fixtures, match status/results, standings, announcements, sponsors, photos and archive entries. Include search/filter, CSV exports and audit history. Every visible action must work or explain its prerequisite.

Suggested relational entities: seasons, batches, teams, team_aliases, registrations, registration_players, captain_memberships, payment_attempts, grounds, groups, group_memberships, fixtures, fixture_dependencies, schedule_versions, match_results, standings_versions, standings_rows, announcements, sponsors, media_assets, archive_entries and audit_events. Simplify where appropriate, but keep season-specific state separate from permanent identities and private contacts separate from public projections.

Use UUIDs, timestamps, foreign keys, uniqueness constraints and indexes for actual queries. Use transactions for application submission, capacity approval and schedule/standings publication. Store times consistently and display Asia/Kolkata explicitly. Use concurrency/version checks for competing organizer edits. Keep audit events server-created and protected from client modification.

Public read policies expose only approved/published fields. Captains can access only their own drafts/receipts/squads. Use separate safe public views for squads. Private contacts, emails, receipts, transaction references and audit records must never leak through public responses, cached pages, analytics or generated share images. Service credentials stay server-side. Validate file size/type/content and store private files in private buckets. Rate-limit anonymous and authenticated mutations appropriately.

## 10. Sharing, performance and reliability

- Generate consistent share images for approved teams, published fixtures and final results using deterministic templates. Use no private information.
- Share/copy actions are initiated by users. Do not implement automatic bulk WhatsApp messages in v1.
- Add installable PWA metadata and a carefully scoped offline fallback. Cache only public published fixtures with a conspicuous last-synced timestamp; never cache authenticated pages or receipts.
- Navigation and public fixtures remain usable on slow mobile networks. Don't block the hero on a 3D renderer.
- No mocked success responses in production. Failed writes preserve form values and explain whether retry is safe.
- Local development may use an explicit DEMO_MODE with clearly labeled fictional fixtures. Demo data must never appear in production or be passed off as actual registrations.
- Document database backups, how to export registrations and fixtures before the event, and how to restore a previous published schedule.

## 11. Milestones and acceptance checks

Milestone 1 — Design system, responsive public pages, season configuration, schema/migrations, auth and registration draft/submission flow.
Milestone 2 — Captain portal, review/payment workflow, private storage, organizer controls, exports.
Milestone 3 — Fixtures, conflict checks, versioned publication, match-day mode, external scorecard links and manual/imported standings.
Milestone 4 — Team share cards, basic verified history, sponsor/gallery management, PWA/offline behavior and final polish.

For each milestone, build working vertical flows instead of disconnected UI placeholders. Produce .env.example, migrations, safe development seeds and a README covering setup, admin bootstrap and deployment. Never commit actual secrets.

Test critical behavior:
1. Captain A cannot read/edit Captain B's registration or receipt, including direct API/database requests.
2. Double submission creates one application; simultaneous approvals cannot exceed a configured cap.
3. Submitted payment evidence remains unverified until an admin verifies it.
4. Registration dates and roster locks are checked server-side in IST.
5. Same-ground and same-team schedule overlaps are rejected; insufficient rest and dependency conflicts are reported.
6. Unpublished fixtures and private contacts are never public.
7. A reschedule updates the public fixture and calendar metadata together; stale clients are shown update state.
8. A failed save does not display a successful registration reference or lose the draft.
9. Production without integration credentials clearly disables unavailable actions rather than faking them.
10. The main journey works at 360px width and with keyboard navigation.

Run type checking, lint, production build and the meaningful tests above. Inspect screenshots of the home, registration, fixtures and captain dashboard at mobile and desktop widths. Fix layout/overflow issues. Report exactly what works, what was tested and which credentials/settings remain before launch. Do not deploy publicly or send real messages merely to test.

## 12. Optional phase-two enhancements

Only after the above works: auditable draw-reveal screen (draw calculated and saved before animation), authenticated QR team check-in, volunteer/umpire assignments, Kannada translations reviewed by an organizer, optional jersey/meal counts, moderated reunion photos, verified historical player records, and approved CricHeroes integration. Do not add betting, fantasy money games, AI chatbots or a custom ball-by-ball scorer to the initial scope.

Start by inspecting the repository, writing a short implementation plan and then implementing milestone 1 immediately. Continue through the milestones with checkpoints and report concrete blockers only.

---

# Research notes for the human owner and Cursor

Reviewed public/indexed records on 6 October 2026. Direct profile retrieval and several detailed pages were unavailable or limited; this is not a complete audit of all matches or all 14 past editions. Some scorecard metadata dates differ from their displayed match dates, so retain provenance and confirm archival dates before publication.

| Edition | Evidence located | Safe takeaway |
| --- | --- | --- |
| 1–4 | No reliable edition-specific record located in this pass | Request old posters, photos and results from alumni; do not infer years or champions. |
| 5 | JNVCKM association archive describes the 2010 batch as champions | Basic heritage entry only; do not infer a full admission-to-leaving batch range. |
| 6 | JNVCKM archive identifies the sixth edition at RNS grounds | Basic heritage existence; detailed results unverified. |
| 7 | Association page identifies the 2017 edition as a two-day event at RNS grounds | Basic heritage entry; champion not verified. |
| 8–10 | No reliable edition-specific record located in this pass | Leave results/year assignments unconfirmed. |
| 11 / 2022 | Indexed CricHeroes scorecard shows 12 Nov 2022 at SJBIT, including a five-over league match | Match lengths varied historically; do not hard-code six overs globally. |
| 12 / 2023 | CricHeroes tournament 788869 lists 18 teams and 24 matches; indexed final shows Royal Challengers Balehonnur (1997–04) beating GTR (2012–2019) by seven wickets | Supports a recent archive entry; listed counts are not an independently reconciled fixture total. |
| 13 / 2024 | Association social result identifies NCL 13; player match histories show TWENTY SIXers (2012–2019) beating The Elite (2002–09) by 15 runs in the 24 Nov final | Verify the dedicated tournament record when supplied; do not invent its tournament ID. |
| 14 / 2025 | Tournament 1648642 lists 20 teams, 36 matches, Ground A/B; indexed final shows 4s-11 (2004–2011) beating RCB United by ten wickets | Recent-format reference only; 2026 format remains undecided. |

The indexed NCL 14 table shows three league appearances per displayed team even though groups have many more teams. This is insufficient evidence for a full round robin. Its header counts and visible rows also should not be treated as a reconciled dataset. Manual/imported selected-opponent fixtures must be supported.

Source links:
- User profile attempted: https://cricheroes.com/player-profile/13765777/srustik/matches
- NCL 14 matches: https://cricheroes.com/tournament/1648642/navodaya-cricket-league-14/matches/past-matches
- NCL 14 standings: https://cricheroes.com/tournament/1648642/navodaya-cricket-league-14/point-table
- NCL 12 tournament: https://cricheroes.com/tournament/788869/jnv-ckm-ncl-2023%2812th-edition%29/matches/live-matches
- 2024 match history/final: https://cricheroes.com/player-profile/8702295/karthik-ramesh/matches
- NCL 11 scorecard: https://cricheroes.com/scorecard/4758049/jnvckm-ncl-11th-edition/4s-11-vs-royal-challengers-balehonnur%281997-04%29/summary
- Association heritage: https://jnvckm.org/programs/ncl
- Season 7: https://jnvckm.org/events/ncl-7
- Older association archive: https://jnvckm.netlify.app/events/
- CricHeroes branded website product: https://cricheroes.com/your-web
- Next.js documentation: https://nextjs.org/docs/app
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security

CricHeroes advertises its own branded website product with match-centre integration. This does not establish that an open API or embeddable widget is available for a custom website. Confirm integration terms with CricHeroes before adding automatic score synchronization. Manual links and organizer-maintained summaries are the initial design.
