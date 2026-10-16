export type GreenApiGroupRow = {
  id?: string | null;
  chatId?: string | null;
  groupId?: string | null;
  name?: string | null;
  contactName?: string | null;
  subject?: string | null;
  type?: string | null;
};

export type DiscoveredGreenApiGroup = {
  chatId: string;
  name: string;
};

export function isGreenApiGroupId(value: unknown): value is string;

export function normalizeGreenApiGroupDiscovery(
  chats: readonly GreenApiGroupRow[] | unknown,
  contacts: readonly GreenApiGroupRow[] | unknown,
  maxGroups?: number,
): { groups: DiscoveredGreenApiGroup[]; total: number; truncated: boolean };
