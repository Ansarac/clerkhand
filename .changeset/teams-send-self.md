---

## "@clerkhand/teams": minor

Send plain-text messages to your own self-chat: `draft self --text T` previews the text and a confirmation hash without network access, and `send self --text T --confirm <hash>` sends exactly that text. Other targets are refused. Agent setup allows `draft` and makes `send` ask every time; remove any old deny rules for `draft`/`send` to enable it.
