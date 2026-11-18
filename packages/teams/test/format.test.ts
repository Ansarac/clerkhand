import { describe, expect, it } from "vitest";
import { mentionProperty, toTeamsHtml } from "../src/format.js";

const people = [
  { name: "Synthetic, Person", mri: "8:orgid:synthetic-1" },
  { name: "Other Person", mri: "8:orgid:synthetic-2" },
];

describe("Teams message formatting", () => {
  it("escapes HTML so text can never inject markup", () => {
    expect(toTeamsHtml('<script>alert("x")</script> & <b>', []).html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;</p>",
    );
  });
  it("turns paragraphs, line breaks, lists, bold, code and links into HTML", () => {
    const text =
      "Hello **team**\nsee `npm test`\n\n- one\n- two\n\n1. first\n2. second\n\nhttps://example.test/a?b=1.";
    expect(toTeamsHtml(text, []).html).toBe(
      "<p>Hello <b>team</b><br>see <code>npm test</code></p>" +
        "<ul><li>one</li><li>two</li></ul>" +
        "<ol><li>first</li><li>second</li></ol>" +
        '<p><a href="https://example.test/a?b=1">https://example.test/a?b=1</a>.</p>',
    );
  });
  it("mentions exactly-named participants, in order, next to links and markup", () => {
    const result = toTeamsHtml(
      "@[Synthetic, Person] see https://example.test @[Other Person]!",
      people,
    );
    expect(result.mentions.map((p) => p.mri)).toEqual([
      "8:orgid:synthetic-1",
      "8:orgid:synthetic-2",
    ]);
    expect(result.html).toBe(
      '<p><span itemtype="http://schema.skype.com/Mention" itemscope="" itemid="0">Synthetic, Person</span>' +
        ' see <a href="https://example.test">https://example.test</a> ' +
        '<span itemtype="http://schema.skype.com/Mention" itemscope="" itemid="1">Other Person</span>!</p>',
    );
    expect(JSON.parse(mentionProperty(result.mentions))).toEqual([
      {
        ["@type"]: "http://schema.skype.com/Mention",
        itemid: "0",
        mri: "8:orgid:synthetic-1",
        mentionType: "person",
        displayName: "Synthetic, Person",
      },
      {
        ["@type"]: "http://schema.skype.com/Mention",
        itemid: "1",
        mri: "8:orgid:synthetic-2",
        mentionType: "person",
        displayName: "Other Person",
      },
    ]);
  });
  it("refuses unknown or ambiguous names and lists the participants", () => {
    expect(() => toTeamsHtml("@[Nobody] hi", people)).toThrow(
      expect.objectContaining({
        code: "mention_unknown",
        details: { participants: ["Synthetic, Person", "Other Person"] },
      }),
    );
    const twins = [...people, { name: "Other Person", mri: "8:orgid:synthetic-3" }];
    expect(() => toTeamsHtml("@[Other Person]", twins)).toThrow(
      expect.objectContaining({ code: "mention_unknown" }),
    );
  });
});
