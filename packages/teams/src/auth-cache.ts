/** Runs in the owned Teams profile; invalidates only its selected account's Skype cache. */
export function invalidateSkypeCache(): { invalidated: boolean } {
  if (location.protocol !== "https:" || location.hostname !== "teams.cloud.microsoft") {
    return { invalidated: false };
  }
  try {
    const primary = JSON.parse(
      localStorage.getItem("tmp.react-web-client.cachedPrimaryUser") ?? "null",
    ) as { userId?: string } | null;
    const selected = JSON.parse(
      localStorage.getItem("tmp.auth.v1.GLOBAL.PrimaryUserId.PrimaryUserId") ?? "null",
    ) as { item?: string } | null;
    if (
      !(primary?.userId && selected?.item) ||
      primary.userId.toLowerCase() !== selected.item.toLowerCase()
    ) {
      return { invalidated: false };
    }
    localStorage.removeItem(`tmp.auth.v1.${primary.userId}.Discover.SKYPE-TOKEN`);
    localStorage.removeItem(`tmp.auth.v1.${primary.userId}.Token.HTTPS://API.SPACES.SKYPE.COM`);
    return { invalidated: true };
  } catch {
    return { invalidated: false };
  }
}
