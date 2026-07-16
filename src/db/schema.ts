import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const reviewStatus = pgEnum("review_status", ["confirmed", "review", "conflict"]);
export const sourceKind = pgEnum("source_kind", ["message", "voice", "image", "document"]);
export const sourceRole = pgEnum("source_role", ["teacher", "group-lead", "student"]);

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  telegramChatId: text("telegram_chat_id").unique(),
  accessToken: text("access_token")
    .notNull()
    .unique()
    .default(sql`gen_random_uuid()::text`),
  trustedUsernames: jsonb("trusted_usernames").$type<string[]>().notNull().default([]),
  dailyBriefEnabled: boolean("daily_brief_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    eventDate: text("event_date").notNull(),
    eventTime: text("event_time").notNull(),
    room: text("room").notNull(),
    confidence: integer("confidence").notNull(),
    status: reviewStatus("status").notNull().default("review"),
    reason: text("reason").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_group_id_idx").on(table.groupId),
    index("events_event_date_idx").on(table.eventDate),
    index("events_status_idx").on(table.status),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    role: sourceRole("role").notNull(),
    kind: sourceKind("kind").notNull(),
    text: text("text").notNull(),
    sourceTime: text("source_time").notNull(),
    chat: text("chat").notNull(),
    telegramMeta: jsonb("telegram_meta").$type<{
      chatId?: string;
      messageId?: number;
      username?: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sources_event_id_idx").on(table.eventId)],
);

export const eventActivities = pgTable(
  "event_activities",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("event_activities_event_id_idx").on(table.eventId)],
);

export const groupsRelations = relations(groups, ({ many }) => ({
  events: many(events),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  group: one(groups, { fields: [events.groupId], references: [groups.id] }),
  sources: many(sources),
  activity: many(eventActivities),
}));

export const sourcesRelations = relations(sources, ({ one }) => ({
  event: one(events, { fields: [sources.eventId], references: [events.id] }),
}));

export const eventActivitiesRelations = relations(eventActivities, ({ one }) => ({
  event: one(events, { fields: [eventActivities.eventId], references: [events.id] }),
}));

export type EventRow = typeof events.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type EventActivityRow = typeof eventActivities.$inferSelect;
