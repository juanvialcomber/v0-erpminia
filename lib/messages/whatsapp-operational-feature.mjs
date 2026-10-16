// Keep the source-backed WhatsApp review inaccessible in production until
// its additive SQL migration and authenticated admin QA have been validated.
// Preview may exercise the UI without activating its production write paths.
export function whatsappOperationalReviewEnabled(env = process.env) {
  return env.MOTIL_WHATSAPP_REVIEW_ENABLED === 'true' ||
    env.VERCEL_ENV === 'preview';
}
