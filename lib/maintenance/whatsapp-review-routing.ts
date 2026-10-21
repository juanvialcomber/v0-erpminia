export type ReviewDestination = 'planta' | 'mina' | 'despacho' | 'mantenimiento' | 'bodega' | 'laboratorio';

export type ReviewRoutingInput = {
  body: string | null;
  group_name: string | null;
  message_type: string | null;
  attachment_count: number | null;
  problematic_attachment_count: number | null;
};

// Advisory only: never changes canonical records, availability or OT state.
// Suggestions are intentionally conservative: operator reviews each item.
export function suggestWhatsappReviewDestinations(input: ReviewRoutingInput) {
  const body = (input.body || '').toLocaleLowerCase('es-CL');
  const group = (input.group_name || '').toLocaleLowerCase('es-CL');
  const destinations = new Set<ReviewDestination>();
  if (/planta patagua/.test(group)) destinations.add('planta');
  if (/grupo 2/.test(group) && /mina|san pedro|peumo|don jaime|sondaje|perforaci[oó]n/.test(body)) destinations.add('mina');
  if (/despacho concentrado/.test(group) || /despacho|viajes a planta|viajes para hoy/.test(body)) destinations.add('despacho');
  if (/manten|repar|falla|f\/s|fuera de servicio|lubric|fuga|neum[aá]tic|hor[oó]metro/.test(body)) destinations.add('mantenimiento');
  if (/stock|bodega|repuestos? pendientes?/.test(body)) destinations.add('bodega');
  if (/ley y humedad|leyes y humedades|muestra|laboratorio/.test(body)) destinations.add('laboratorio');
  if (/mina|san pedro|peumo|don jaime|sondaje|perforaci[oó]n/.test(body)) destinations.add('mina');
  const needsMediaReview = (input.attachment_count || 0) > 0 || (input.problematic_attachment_count || 0) > 0;
  return {
    suggested_destinations: [...destinations],
    needs_media_review: needsMediaReview,
    requires_human_review: true,
    publication_allowed: false,
    classification_basis: 'group_and_text_rules_v1',
  };
}
