export type SourceKind = "message" | "voice" | "image" | "document";
export type SourceRole = "teacher" | "group-lead" | "student";
export type ReviewStatus = "confirmed" | "review" | "conflict";

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

export type InboxItem = {
  id: string;
  status: ReviewStatus;
  receivedAt: string;
  event: ExtractedEvent;
  sources: EvidenceSource[];
  reason: string;
};
