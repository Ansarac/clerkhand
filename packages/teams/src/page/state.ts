// Page functions are serialized into the browser: no imports, no outer references.

export interface PageState {
  url: string;
  /** On a Microsoft sign-in page instead of Teams. */
  signIn: boolean;
  /** Teams has rendered the chat list. */
  ready: boolean;
  lang: string;
  /** Thread id of the chat open in the main pane, if any. */
  openChatId: string | null;
}

export function readPageState(): PageState {
  const signInHosts = ["login.microsoftonline.com", "login.live.com", "login.microsoft.com"];
  const header = document.querySelector('[id^="chat-header-"]');
  return {
    url: location.href,
    signIn: signInHosts.includes(location.host),
    ready: document.querySelector('[role="tree"] [role="treeitem"]') !== null,
    lang: document.documentElement.lang,
    openChatId: header ? header.id.slice("chat-header-".length) : null,
  };
}
