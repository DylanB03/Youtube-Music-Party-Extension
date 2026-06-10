export function normalizeInviteCode(inviteCode: string): string {
  const trimmedCode = inviteCode.trim().toUpperCase();
  const alphanumericCode = trimmedCode.replace(/[^A-Z0-9]/g, "");
  return alphanumericCode;
}
