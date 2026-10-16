export type WhatsappRouteSuggestion = {
  id:string;label:string;reason:string;scope:string;category:string;
  confidence:'low'|'medium'|'high'|string;reportedState:string;
  needsMediaReview:boolean;safetyReview:boolean;mixedClaim:boolean;
};
export type WhatsappTriageMessage = {
  id:number;group_name?:string;body?:string;message_type?:string;occurred_at?:string;
};
export type WhatsappTriageFinding = {
  detail?:string;source_ids?:number[];review_status?:string;
};
export function suggestWhatsappSection(input?:{
  groupName?:string;text?:string;messageType?:string;
}):WhatsappRouteSuggestion;
export function declaredMineHint(text:string):string|null;
export type WhatsappTriageSection = {
  lineStart:number;lineEnd:number;title:string;siteHint:string|null;
  excerpt:string;proposal:WhatsappRouteSuggestion;reportedState:string;
  needsNumericalReview:boolean;multipleContexts:boolean;
};
export function extractWhatsappSections(input?:{groupName?:string;text?:string}):WhatsappTriageSection[];
export function repetitionKey(detail:string):string|null;
export function prepareWhatsappTriage(
  messages:WhatsappTriageMessage[],
  findings:WhatsappTriageFinding[],
  options?:{limit?:number},
): {
  totals: {
    messages:number;withText:number;referencedMessages:number;
    uncoveredText:number;mediaWithoutText:number;mediaToReview:number;findings:number;multiSection:number;
  };
  bySection:{id:string;label:string;total:number;uncovered:number}[];
  possibleRepeats:{key:string;indices:number[]}[];
  items:{
    id:number;groupName:string;messageType:string;occurredAt?:string;excerpt:string;
    siteHint:string|null;sections:WhatsappTriageSection[];
    hasText:boolean;findingIndexes:number[];coverage:string;
    proposal:WhatsappRouteSuggestion;
  }[];
  findings:{
    index:number;detail:string;sourceIds:number[];groups:string[];
    reviewStatus:string;suggestion:WhatsappRouteSuggestion;sourceComplete:boolean;
  }[];
};
