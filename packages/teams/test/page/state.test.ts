// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { readPageState } from "../../src/page/state.js";
import { inPage } from "../helpers.js";

interface HappyDomWindow {
  // biome-ignore lint/style/useNamingConvention: happy-dom's API names.
  happyDOM: { setURL: (url: string) => void };
}

function setUrl(url: string): void {
  (globalThis as unknown as HappyDomWindow).happyDOM.setURL(url);
}

beforeEach(() => {
  document.documentElement.lang = "en-US";
  document.body.innerHTML = "";
});

describe("readPageState", () => {
  it("is ready once the chat list has items", () => {
    setUrl("https://teams.cloud.microsoft/");
    document.body.innerHTML = '<div role="tree"><div role="treeitem"></div></div>';
    expect(inPage(readPageState)()).toMatchObject({
      ready: true,
      signIn: false,
      lang: "en-US",
    });
  });

  it("recognizes the Microsoft sign-in page", () => {
    setUrl("https://login.microsoftonline.com/common/oauth2");
    expect(inPage(readPageState)()).toMatchObject({ ready: false, signIn: true });
  });

  it("reports the thread id of the open chat", () => {
    setUrl("https://teams.cloud.microsoft/");
    document.body.innerHTML = '<div id="chat-header-48:notes"></div>';
    expect(inPage(readPageState)().openChatId).toBe("48:notes");
  });
});
