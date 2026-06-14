import type { PendingInvite } from "@ytm-party/shared";

type InviteStoragePort = {
  save(inviteCode: string): Promise<PendingInvite>;
};

type PrepareInviteOptions = {
  inviteCode: string;
  storage: InviteStoragePort;
  openPanel: () => Promise<void>;
  notifyPrepared: (invite: PendingInvite) => void;
};

export async function preparePendingInvite({
  inviteCode,
  storage,
  openPanel,
  notifyPrepared,
}: PrepareInviteOptions): Promise<PendingInvite> {
  const panelOpen = openPanel().catch(() => undefined);
  const invite = await storage.save(inviteCode);
  notifyPrepared(invite);
  await panelOpen;
  return invite;
}
