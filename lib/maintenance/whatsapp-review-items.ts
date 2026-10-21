import { inferEventTimeKind } from './whatsapp-event-time';
import { suggestWhatsappReviewDestinations, type ReviewDestination } from './whatsapp-review-routing';

export type WhatsappReviewItem = {
  message_id: number;
  item_index: number;
  source_excerpt: string;
  event_time_kind: ReturnType<typeof inferEventTimeKind>;
  suggested_destinations: ReviewDestination[];
  requires_human_review: true;
  publication_allowed: false;
};

// Explicit line-based breakdown only. Never infer a completed action from media or
// invent an asset mapping. Splits sections at visible line boundaries.
export function splitWhatsappReviewItems(message: {
  message_id: number;
  body: string | null;
  group_name: string | null;
  message_type: string | null;
  attachment_count: number | null;
  problematic_attachment_count: number | null;
}): WhatsappReviewItem[] {
  const lines = (message.body || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const sectionHeading = /^(trabajos realizados|trabajos para hoy|reporte de equipos|estado de los equipos|sondaje|sondas|preventiva|recuperativa|viajes para hoy|compresores y generadores|generadores|turno [ab])\b/i.test(line.replace(/^[*\s-]+/, ''));
    if (sectionHeading && current) { chunks.push(current); current = ''; }
    current = current ? current + '\n' + line : line;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 40).map((chunk, item_index) => ({
    message_id: message.message_id,
    item_index,
    source_excerpt: chunk.slice(0, 2400),
    event_time_kind: inferEventTimeKind(chunk),
    suggested_destinations: suggestWhatsappReviewDestinations({ ...message, body: chunk }).suggested_destinations,
    requires_human_review: true,
    publication_allowed: false,
  }));
}
