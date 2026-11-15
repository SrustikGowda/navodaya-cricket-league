// Bringing new standard rules into the organizers' own wording. Client-safe: no database or Node imports.

import type { Rule, RuleSection } from "./rules";

type Book = { highlights: string[]; sections: RuleSection[] };

export type MissingRule = {
  /** The standard section the rule belongs to. */
  sectionId: string;
  sectionTitle: string;
  /** Its number in the standard rules, such as "2.4". */
  ref: string;
  /** Its place in the standard section, used to put it back in the same place. */
  index: number;
  rule: Rule;
};

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Standard rules whose wording appears nowhere in the organizers' copy: new rules, or ones the organizers reworded or removed. */
export function missingStandardRules(standard: Book, copy: Book): MissingRule[] {
  const have = new Set(copy.sections.flatMap((section) => section.rules.map((rule) => norm(rule.text))));
  return standard.sections.flatMap((section, si) =>
    section.rules.flatMap((rule, ri) => (have.has(norm(rule.text)) ? [] : [{ sectionId: section.id, sectionTitle: section.title, ref: `${si + 1}.${ri + 1}`, index: ri, rule }])),
  );
}

/**
 * Where a standard rule goes in the organizers' copy: the section with the same link, at the same place as in the
 * standard rules (or at the end if that section is now shorter). Null when the copy no longer has that section.
 */
export function placeFor(copy: Book, missing: MissingRule): { sectionIndex: number; ruleIndex: number } | null {
  const sectionIndex = copy.sections.findIndex((section) => section.id === missing.sectionId);
  if (sectionIndex < 0) return null;
  const length = copy.sections[sectionIndex]?.rules.length ?? 0;
  return { sectionIndex, ruleIndex: Math.min(missing.index, length) };
}
