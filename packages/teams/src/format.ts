import { ClerkhandError } from "@clerkhand/core";

/** Someone who can be mentioned: display name and Teams ID ("8:orgid:..."). */
export interface Person {
  name: string;
  mri: string;
}

export interface Formatted {
  html: string;
  mentions: Person[];
}

const MENTION = /@\[(?<name>[^\]\n]{1,128})\]/gu;
const BULLET = /^[-*] +/u;
const NUMBERED = /^\d+[.)] +/u;
const BOLD = /\*\*(?<inner>[^*\n]+)\*\*/gu;
const CODE = /`(?<inner>[^`\n]+)`/gu;
const URL_TEXT = /\bhttps?:\/\/[^\s<\uE000]+[^\s<\uE000.,;:!?)\]'"]/gu;
const PLACEHOLDER = /\uE000(?<index>\d+)\uE000/gu;
const CRLF = /\r\n?/gu;
const BLANK_LINES = /\n{2,}/u;
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/gu, (c) => ESCAPES[c] ?? c);
}

/**
 * A small Markdown subset to Teams HTML: paragraphs, line breaks, `-`/`1.` lists, **bold**,
 * `code`, links, and `@[Display Name]` mentions of people in `people`. All other text is escaped.
 */
export function toTeamsHtml(text: string, people: readonly Person[]): Formatted {
  const mentions: Person[] = [];
  const tokens: string[] = [];
  const withTokens = text.replace(MENTION, (_match, name: string) => {
    const matches = people.filter((p) => p.name === name);
    if (matches.length !== 1) {
      throw new ClerkhandError(
        "mention_unknown",
        `@[${name}] must be exactly one name from the draft's participants.`,
        { details: { participants: [...new Set(people.map((p) => p.name))] } },
      );
    }
    const person = matches[0] as Person;
    const itemid = mentions.length;
    mentions.push(person);
    tokens.push(
      `<span itemtype="http://schema.skype.com/Mention" itemscope="" itemid="${itemid}">${escapeHtml(person.name)}</span>`,
    );
    return `\uE000${tokens.length - 1}\uE000`;
  });
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(BOLD, (_m, inner: string) => `<b>${inner}</b>`)
      .replace(CODE, (_m, inner: string) => `<code>${inner}</code>`)
      .replace(URL_TEXT, (url) => `<a href="${url}">${url}</a>`);
  const blocks = withTokens
    .replace(CRLF, "\n")
    .split(BLANK_LINES)
    .map((block) => block.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      if (lines.every((line) => BULLET.test(line))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(BULLET, ""))}</li>`).join("")}</ul>`;
      }
      if (lines.every((line) => NUMBERED.test(line))) {
        return `<ol>${lines.map((l) => `<li>${inline(l.replace(NUMBERED, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    });
  const html = blocks
    .join("")
    .replace(PLACEHOLDER, (_m, index: string) => tokens[Number(index)] ?? "");
  return { html, mentions };
}

/** The `properties.mentions` value Teams expects alongside the HTML. */
export function mentionProperty(mentions: readonly Person[]): string {
  return JSON.stringify(
    mentions.map((person, itemid) => ({
      ["@type"]: "http://schema.skype.com/Mention",
      itemid: String(itemid),
      mri: person.mri,
      mentionType: "person",
      displayName: person.name,
    })),
  );
}
