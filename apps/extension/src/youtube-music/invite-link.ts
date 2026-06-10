import { normalizeInviteCode } from "../invite-code";

const INVITE_QUERY_PARAMETER = "ytm_party";

export function readInviteCodeFromLocation(url: string): string | null {
  const parsed = new URL(url);
  const inviteCode = normalizeInviteCode(
    parsed.searchParams.get(INVITE_QUERY_PARAMETER) ?? "",
  );
  return inviteCode || null;
}

export function removeInviteCodeFromLocation(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete(INVITE_QUERY_PARAMETER);
  return parsed.toString();
}
