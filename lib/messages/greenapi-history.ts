type SelectedGroup = { id: string; organization_id: string; chat_id: string };
const clip = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
export function historyMessage(row: any, group: SelectedGroup, now = Date.now()) {
  if (!row || row.type !== 'incoming' || row.chatId !== group.chat_id || row.isDeleted === true) return null;
  const id = typeof row.idMessage === 'string' ? row.idMessage : '';
  const seconds = Number(row.timestamp);
  if (!id || id.length > 255 || !Number.isFinite(seconds) || seconds < 1000000000 || seconds > now / 1000 + 3600) return null;
  const type = clip(row.typeMessage, 64);
  if (!type || type === 'deletedMessage' || type === 'editedMessage') return null;
  const text = [row.textMessage, row.extendedTextMessage?.text, row.fileMessageData?.caption, row.caption].find(value => typeof value === 'string');
  return {
    organization_id: group.organization_id, group_id: group.id, provider_message_id: id,
    sender_chat_id: clip(row.senderId, 128), sender_name: clip(row.senderName, 160),
    body: clip(text, 10000) || null, message_type: type,
    file_name: clip(row.fileMessageData?.fileName || row.fileName, 255) || null,
    quoted_message_id: clip(row.extendedTextMessage?.stanzaId || row.quotedMessage?.stanzaId, 255) || null,
    occurred_at: new Date(seconds * 1000).toISOString(),
  };
}
