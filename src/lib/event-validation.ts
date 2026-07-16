import { z } from "zod";

export const reviewStatusSchema = z.enum(["confirmed", "review", "conflict"]);

export const editableEventSchema = z.object({
  title: z.string().trim().min(1).max(240),
  subject: z.string().trim().min(1).max(160),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате ГГГГ-ММ-ДД"),
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время должно быть в формате ЧЧ:ММ"),
  room: z.string().trim().min(1).max(120),
});

const sourceSchema = z.object({
  id: z.string().min(1).max(160),
  author: z.string().min(1).max(160),
  role: z.enum(["teacher", "group-lead", "student"]),
  kind: z.enum(["message", "voice", "image", "document"]),
  text: z.string().min(1).max(8_000),
  time: z.string().min(1).max(80),
  chat: z.string().min(1).max(240),
});

export const inboxItemSchema = z.object({
  id: z.string().min(1).max(160),
  status: reviewStatusSchema,
  receivedAt: z.string().min(1).max(80),
  event: z.object({
    title: z.string().min(1).max(240),
    subject: z.string().min(1).max(160),
    date: z.string().min(1).max(80),
    time: z.string().min(1).max(80),
    room: z.string().min(1).max(120),
    confidence: z.number().int().min(0).max(100),
  }),
  sources: z.array(sourceSchema).min(1).max(24),
  reason: z.string().min(1).max(1_000),
});
