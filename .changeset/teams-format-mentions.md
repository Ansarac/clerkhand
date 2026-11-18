---
"@clerkhand/teams": minor
---

Sent messages support paragraphs, line breaks, lists, bold, inline code, links and `@[Exact Name]` mentions of recent participants. Text is HTML-escaped first; the confirmation hash also binds the mentioned people.

Sent messages now carry the sender display name, taken from the sign-in token at login; `whoami` shows that name instead of `orgid:...`. Plain-text reading keeps list items as `- ` lines.
