/**
 * The closure button must reflect server-owned actor permission and photo
 * evidence. The mechanic's API and photo requirements remain authoritative.
 * @param {{canEdit:boolean,canDeclare:boolean,fluidReady:boolean,evidenceReady:boolean,evidenceCount:number,hasError:boolean}} state
 * @returns {'view_only'|'error'|'loading'|'add_photo'|'ready'}
 */
export function classifyCloseAction(state) {
  if (!state.canEdit) return 'view_only';
  if (state.hasError) return 'error';
  if (!state.fluidReady) return 'loading';
  if (!state.canDeclare) return 'view_only';
  if (!state.evidenceReady) return 'loading';
  if (!Number.isInteger(state.evidenceCount) || state.evidenceCount < 1) return 'add_photo';
  return 'ready';
}
