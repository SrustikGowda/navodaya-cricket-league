// The NCL 2026 rulebook: last year's rules and guidelines (NCL 14), brought up to date for NCL 15.
// Anything that depends on the season or the draw (dates, venue, fee, times, knockout pairings) is filled in from the
// site's own data, so the rules can never disagree with the Fixtures page.

import { QF_PAIRINGS, SF_PAIRINGS } from "./draw/bracket";
import {
  ACTUAL_MATCHES,
  BYE_POSITION,
  GROUP_TEAMS,
  KNOCKOUT_TIE_RULE,
  LEAGUE_MATCHES,
  LEAGUE_MATCHES_BY_GROUP,
  OVERS,
  POINTS,
  QUALIFIERS_PER_GROUP,
  SEED_SPECS,
  TEAM_COUNT,
  type Timetable,
} from "./draw/config";
import { groundShareText } from "./draw/grounds";
import { leagueSlotStarts } from "./draw/schedule";
import { FEE_FREE_FROM_YEAR } from "./fee-state";
import { clock } from "./draw/validate";

/** Each day is announced as ending at 6:00 PM, which leaves a buffer after the last scheduled match. */
const ANNOUNCED_DAY_END = 18 * 60;
const announcedEnd = (scheduledEnd: number) => Math.max(ANNOUNCED_DAY_END, Math.ceil(scheduledEnd / 30) * 30);

export type Rule = {
  text: string;
  /** Sub-points, shown as a list under the rule. */
  items?: string[];
  /** A smaller line under the rule: an exception or an explanation. */
  note?: string;
};

export type RuleTable = { caption: string; head: string[]; rows: string[][] };

export type RuleSection = {
  id: string;
  title: string;
  /** One line under the heading saying what the section covers. */
  summary: string;
  rules: Rule[];
  tables?: RuleTable[];
};

export type Rulebook = {
  title: string;
  edition: string;
  facts: { label: string; value: string }[];
  highlights: string[];
  sections: RuleSection[];
};

export type RulebookInput = {
  editionNumber: number;
  dates: string;
  days: [string, string];
  venue: string;
  organizer: string | null;
  fee: string | null;
  ball: string | null;
  timetable: Timetable;
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00+05:30`));

const seed = (key: string) => SEED_SPECS.find((spec) => spec.key === key)?.label ?? key;

export function buildRulebook(input: RulebookInput): Rulebook {
  const t = input.timetable;
  const saturday = leagueSlotStarts(1, t);
  const sunday = leagueSlotStarts(2, t);
  const satEnd = (saturday.at(-1) ?? t.saturdayStart) + t.leagueMinutes;
  const sunLeagueEnd = (sunday.at(-1) ?? t.sundayStart) + t.leagueMinutes;
  const finalEnd = t.final + t.finalMinutes;
  const breakStart = (saturday[t.breakAfterSlots - 1] ?? t.saturdayStart) + t.slotMinutes;
  const breakEnd = saturday[t.breakAfterSlots] ?? breakStart;
  const ball = input.ball?.trim() || "Vicky cricket tennis balls";
  const rank = (group: string, position: number) => `Group ${group} #${position}`;

  const sections: RuleSection[] = [
    {
      id: "general",
      title: "General",
      summary: "Who can play, the entry fee, the ball, scoring and conduct.",
      rules: [
        { text: "The tournament is only for JNV Chikkamagaluru alumni." },
        {
          text: input.fee ? `Each team pays an entry fee of ${input.fee}.` : "Each team pays an entry fee, announced by the Organizing Committee before the tournament.",
          note: `Batches that passed out of JNV in ${FEE_FREE_FROM_YEAR} or later, who are still studying, do not pay the fee.`,
        },
        { text: `Matches are played with ${ball}, under the standard laws of cricket and these tournament rules.` },
        { text: "All scoring is done on the CricHeroes app. If the app has technical problems, manual scoring is the backup." },
        { text: "Only 11 players may be on the field at a time. A runner is allowed only for an injury, with the approval of the umpire and the opposing captain." },
        {
          text: "Everyone must uphold the spirit of the game and alumni camaraderie. Abusive language, aggressive behaviour or misconduct will not be tolerated.",
          note: "The Organizing Committee may suspend or disqualify players or teams for misconduct.",
        },
        {
          text: "The umpires' decisions on the field are final and binding. Any dispute about the rules, their interpretation or conduct is referred to the Organizing Committee, whose decision is final.",
        },
        {
          text: "The Organizing Committee handles all administrative, disciplinary and dispute decisions. A Tournament Referee appointed by the committee helps keep matches on time and in the right spirit.",
        },
      ],
    },
    {
      id: "format",
      title: "Format and schedule",
      summary: `${TEAM_COUNT} teams, two groups, then knockouts, over two days.`,
      rules: [
        {
          text: `The tournament is played over two days: ${dayLabel(input.days[0])}, from ${clock(t.saturdayStart)} to ${clock(announcedEnd(satEnd))}, and ${dayLabel(input.days[1])}, from ${clock(t.sundayStart)} to ${clock(announcedEnd(finalEnd))}.`,
          note: "The end time leaves a buffer for delays. Matches are scheduled to finish earlier.",
        },
        {
          text: `There is a group stage and then a knockout stage. The ${TEAM_COUNT} teams are drawn into two groups: Group A has ${GROUP_TEAMS.A} teams and one BYE, and Group B has ${GROUP_TEAMS.B} teams.`,
        },
        {
          text: "Every team gets three league fixtures. The draw places each team in a position (A1 to A9, B1 to B10), and every position always plays the same three opponents.",
        },
        { text: groundShareText() },
        {
          text: `As per NCL tradition, the defending champions, ${seed("champion")}, play the first match of the tournament. They are placed at A1, and the opening match is A1 v A2.`,
          items: [
            `The 2025 runners-up, ${seed("runner_up")}, are placed in Group B.`,
            `The other two 2025 semifinalists, ${seed("semifinalist_1")} and ${seed("semifinalist_2")}, go one to each group.`,
            "Every other position is drawn at random.",
          ],
        },
        {
          text: `One team in Group A, at position ${BYE_POSITION}, has a BYE instead of a third match. It is drawn from the unseeded teams.`,
          note: `A BYE is a walkover worth ${POINTS.bye} points. It is not a match played, and it has no runs, overs or net run rate.`,
        },
        { text: "If a team withdraws after the schedule is final, each of its opponents is awarded that match and its points." },
        {
          text: `${ACTUAL_MATCHES} matches are played in all: ${LEAGUE_MATCHES} league matches (${LEAGUE_MATCHES_BY_GROUP.A} in Group A and ${LEAGUE_MATCHES_BY_GROUP.B} in Group B), 4 quarterfinals, 2 semifinals and the final.`,
        },
      ],
      tables: [
        {
          caption: "The two days at a glance",
          head: ["Time", "What happens"],
          rows: [
            [dayLabel(input.days[0]), ""],
            [`${clock(t.saturdayStart)} – ${clock(breakStart)}`, "League matches on Ground A and Ground B"],
            [`${clock(breakStart)} – ${clock(breakEnd)}`, "Official inauguration of NCL 2026"],
            [`${clock(breakEnd)} – ${clock(satEnd)}`, "League matches on both grounds"],
            [dayLabel(input.days[1]), ""],
            [`${clock(t.sundayStart)} – ${clock(sunLeagueEnd)}`, "The last league matches"],
            [clock(t.qf1), "Quarterfinals 1 and 2"],
            [clock(t.qf2), "Quarterfinals 3 and 4"],
            [clock(t.sf), "Semifinals 1 and 2"],
            [clock(t.final), "The final, on Ground A"],
          ],
        },
      ],
    },
    {
      id: "points",
      title: "Points and qualification",
      summary: "How the group tables are ranked and who reaches the knockouts.",
      rules: [
        {
          text: "Group tables are ranked by points, then by net run rate.",
          note: "In net run rate, an all-out innings counts as the full quota of overs.",
        },
        { text: "If teams are still level on points and net run rate, a Super Over is played to decide." },
        {
          text: `The top ${QUALIFIERS_PER_GROUP} teams of each group reach the quarterfinals: ${QUALIFIERS_PER_GROUP * 2} teams in all.`,
          note: "The organizers confirm the final group tables before the quarterfinal teams are filled in.",
        },
        {
          text: "Quarterfinals:",
          items: QF_PAIRINGS.map((pairing) => `${pairing.code}: ${rank(pairing.a.group, pairing.a.rank)} v ${rank(pairing.b.group, pairing.b.rank)}`),
        },
        {
          text: "Semifinals:",
          items: SF_PAIRINGS.map((pairing) => `${pairing.code}: winner of ${pairing.from[0]} v winner of ${pairing.from[1]}`),
        },
        { text: `Final: the winners of the two semifinals play for the title of Champions of NCL ${input.editionNumber}.` },
        { text: KNOCKOUT_TIE_RULE },
      ],
      tables: [
        {
          caption: "Points for a league match",
          head: ["Result", "Points"],
          rows: [
            ["Win", String(POINTS.win)],
            ["Tie or no result", `${POINTS.tie} each`],
            ["Loss", String(POINTS.loss)],
            ["BYE (Group A, one team)", String(POINTS.bye)],
          ],
        },
      ],
    },
    {
      id: "match",
      title: "Match format",
      summary: "Overs, time allowed and bowling quotas.",
      rules: [
        {
          text: "All teams must keep to the published schedule of opponents, times and grounds.",
          note: "Delays have consequences, because a late league match pushes back the knockouts.",
        },
        {
          text: `League matches are ${OVERS.league} overs an innings, with a maximum of 55 minutes for the match, including a 5-minute innings break.`,
        },
        {
          text: `Quarterfinals, semifinals and the final are ${OVERS.quarterfinal} overs an innings, with a maximum of 60 minutes for the match, including a 5-minute innings break.`,
          note: `Playing ${OVERS.quarterfinal} overs in the knockouts depends on the time and light available, as decided by the Organizing Committee and the umpires.`,
        },
        {
          text: "In every match, each team must use at least 5 bowlers in an innings.",
          note: `Recommended split: 2–1–1–1–1 in a ${OVERS.league}-over innings, and 2–2–2–1–1 in an ${OVERS.quarterfinal}-over innings.`,
        },
      ],
      tables: [
        {
          caption: "Overs and time by stage",
          head: ["Stage", "Overs an innings", "Most time for the match", "Bowlers needed"],
          rows: [
            ["League", String(OVERS.league), "55 minutes", "At least 5"],
            ["Quarterfinals, semifinals and final", String(OVERS.quarterfinal), "60 minutes", "At least 5"],
          ],
        },
      ],
    },
    {
      id: "fielding",
      title: "Fielding restrictions",
      summary: "Powerplay and where fielders may stand.",
      rules: [
        {
          text: "Powerplay: at the start of each innings, no more than 2 fielders may be outside the 30-yard circle, not counting the bowler and the wicketkeeper.",
          note: "The powerplay lasts for the first 11 balls of a 6-over innings and the first 14 balls of an 8-over innings, which is how the ICC shortens the T20 powerplay for reduced innings. Only legal balls count.",
        },
        { text: "After the powerplay, no more than 5 fielders may be outside the 30-yard circle, not counting the bowler and the wicketkeeper." },
        {
          text: "No more than 5 fielders may be on the leg side at any time, counting the bowler.",
          note: "When the bowler bowls around the wicket to a right-handed batter, only 4 fielders apart from the bowler may be on the leg side, so the bowler and 4 fielders make up the limit of 5.",
        },
      ],
    },
    {
      id: "bowling",
      title: "No-balls and wides",
      summary: "Illegal deliveries and what they cost.",
      rules: [
        {
          text: "Underarm bowling and chucking (throwing the ball, an illegal or suspect action) are not allowed. The square-leg umpire watches the bowler's action and calls it.",
          items: [
            "If the square-leg umpire has not called the ball, the batter, striker or non-striker, may leave the ball and appeal to the umpires to check the action.",
            "A ball the umpire judges to be thrown is a no-ball. The bowler gets a first and final warning for the rest of that innings, and the captain of the fielding side is told.",
            "If the same bowler throws another ball in that innings, it is a no-ball and the bowler may not bowl again in that innings. The over is finished by another bowler.",
          ],
          note: "These steps follow Law 21 of the laws of cricket. The umpires report the matter to the Organizing Committee after the match.",
        },
        {
          text: "A free hit is given for every no-ball. A delivery is a no-ball when:",
          items: [
            "it reaches the batter above waist height without bouncing;",
            "the bowler oversteps the front-foot line;",
            "any fielding restriction is broken;",
            "the bowler does not tell the umpire whether they are bowling over or around the wicket at the start of an over;",
            "it is the third or later bouncer (above shoulder height) in the same over: two are allowed per over;",
            "it pitches outside the side edges of the pitch;",
            "the fielding side chirps, makes a noise or distracts the batter between the start of the bowler's run-up and the delivery;",
            "the fielding side changes the wicketkeeper without telling the umpire;",
            "the umpire judges the ball to have been thrown.",
          ],
        },
        {
          text: "Wides:",
          items: [
            "Wides are judged by the standard laws of cricket.",
            "A bouncer above head height is a wide, and it also counts toward the two-bouncers-an-over limit.",
          ],
        },
      ],
    },
    {
      id: "runs",
      title: "Overthrows, byes and leg-byes",
      summary: "Which extra runs count.",
      rules: [
        { text: "All runs from overthrows count toward the team's total." },
        { text: "There are no leg-byes. Runs that come off any part of the batter's body, other than the hand or wrist holding the bat, do not count." },
        { text: "Byes that do not involve the batter's body count as per the standard laws of cricket." },
      ],
    },
    {
      id: "timing",
      title: "Timing and penalties",
      summary: "Reporting time, late starts, slow over rates and delays.",
      rules: [
        { text: "Teams must be at the ground and ready to play at least 30 minutes before their scheduled match time." },
        { text: "The toss takes place 30 minutes before the scheduled start." },
        {
          text: "Late start: a team that is not ready at the scheduled start is penalised as in the table below. These rules apply to every team equally, with no exceptions.",
        },
        {
          text: "Each innings must be finished within its time. A team that falls behind is penalised as in the slow over-rate table below.",
          note: "Justified delays, such as an injury or a ball replacement, are not counted.",
        },
        { text: "The second innings must start within 5 minutes of the first innings ending. A longer gap is treated as a slow over rate and penalised the same way." },
        {
          text: "Any unnecessary delay by a batter, in reaching the crease after a wicket falls or in taking strike, can be penalised with 5 runs, at the umpires' and organizers' discretion.",
          note: "A batter who keeps doing this can be given out Timed Out.",
        },
        {
          text: "Delays caused by disputes, time-wasting or unnecessary argument are penalised. The umpires decide what is deliberate, and it can also lead to disciplinary action.",
        },
        { text: "If rain, a wet outfield or anything else unavoidable gets in the way, the Organizing Committee may reduce the overs or the time allowed so that the day's schedule is finished." },
        {
          text: "The Tournament Referee keeps the official time for all matches: match length, over rates and innings breaks. The referee decides time penalties together with the umpires, and that decision is final.",
        },
      ],
      tables: [
        {
          caption: "Late start",
          head: ["Team not ready for", "What happens"],
          rows: [
            ["Up to 5 minutes", "A formal warning to the team"],
            ["5 to 10 minutes", "5 runs added to the opponent's score"],
            ["10 to 15 minutes", "10 runs added to the opponent's score"],
            ["More than 15 minutes", "The match and its points are awarded to the opponent"],
          ],
        },
        {
          caption: "Slow over rate",
          head: ["Behind schedule by", "What happens"],
          rows: [
            ["5 minutes", "An official warning to the captain"],
            ["5 to 10 minutes", "One more fielder must stay inside the 30-yard circle for the rest of the innings"],
            ["Repeated or excessive delay", "A 5-run penalty and/or fewer overs, at the umpires' and referee's discretion"],
          ],
        },
      ],
    },
    {
      id: "dismissals",
      title: "Dismissals",
      summary: "How a batter can be out, and what does not apply.",
      rules: [
        { text: "All the standard ways of getting out apply, as per the laws of cricket, except LBW: there is no LBW in this tournament." },
        { text: "Mankading, running out the non-striker before the ball is delivered, is allowed without any warning." },
        { text: "A batter who keeps delaying, in reaching the crease or taking strike, can be given out Timed Out, as per the laws of cricket." },
        { text: "A batter who wilfully obstructs the fielding side in any way can be given out. The on-field umpire's decision is final." },
        { text: "Leg-byes are not scored, but a run out during such a delivery is still a valid dismissal." },
        { text: "When a wicket falls, the new batter always takes strike, whether or not the batters crossed." },
      ],
    },
    {
      id: "awards",
      title: "Awards",
      summary: "Trophies for teams and players.",
      rules: [
        { text: "There is no cash prize. Trophies are presented to the winners, the runners-up and the individual award winners." },
        {
          text: "Awards:",
          items: [
            "Champions' trophy: the winning team.",
            "Runners-up trophy: the runner-up team.",
            "Individual awards: Best Batter, Best Bowler and Player of the Tournament.",
            "Player of the Match in every match.",
          ],
          note: "Any further individual categories are decided by the Organizing Committee.",
        },
      ],
    },
  ];

  return {
    title: "Tournament rules and guidelines",
    edition: `Navodaya Cricket League ${input.editionNumber} · NCL ${ROMAN[input.editionNumber] ?? input.editionNumber}`,
    facts: [
      { label: "Dates", value: input.dates },
      { label: "Venue", value: input.venue },
      ...(input.organizer ? [{ label: "Organized by", value: input.organizer }] : []),
      { label: "Teams", value: `${TEAM_COUNT} teams · 2 groups` },
    ],
    highlights: [
      `${OVERS.league} overs a side in league matches; ${OVERS.quarterfinal} in the quarterfinals, semifinals and final`,
      "A free hit for every no-ball",
      "No LBW",
      "No leg-byes",
      "Mankading allowed without a warning",
      "Two bouncers an over",
      "Powerplay: 2 fielders outside the circle, then 5",
      "At least 5 bowlers in every innings",
      "Report 30 minutes before your match; the toss is 30 minutes before the start",
    ],
    sections,
  };
}
