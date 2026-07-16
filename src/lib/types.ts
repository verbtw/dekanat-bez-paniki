export type SourceKind = "message" | "voice" | "image" | "document";
export type SourceRole = "teacher" | "group-lead" | "student";
export type ReviewStatus = "confirmed" | "review" | "conflict";
export type ActivityAction = "created" | "edited" | "status_changed" | "source_added";

export type EvidenceSource = {
  id: string;
  author: string;
  role: SourceRole;
  kind: SourceKind;
  text: string;
  time: string;
  chat: string;
};

export type ExtractedEvent = {
  title: string;
  subject: string;
  date: string;
  time: string;
  room: string;
  confidence: number;
};

export type EventActivity = {
  id: string;
  action: ActivityAction;
  actor: string;
  details: Record<string, string>;
  createdAt: string;
};

export type InboxItem = {
  id: string;
  status: ReviewStatus;
  receivedAt: string;
  event: ExtractedEvent;
  sources: EvidenceSource[];
  reason: string;
  activity?: EventActivity[];
};
