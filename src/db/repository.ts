import { and, asc, eq, sql } from "drizzle-orm";
import type { InboxItem, ReviewStatus } from "@/lib/types";
import { getDb } from "./client";
import { events, groups, sources, type EventRow, type SourceRow } from "./schema";

export const demoGroupId = "demo:ivt-101";

function toInboxItem(event: EventRow, eventSources: SourceRow[]): InboxItem {
  return {
    id: event.id,
    status: event.status,
    receivedAt: new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }).format(event.receivedAt),
    event: {
      title: event.title,
      subject: event.subject,
      date: event.eventDate,
      time: event.eventTime,
      room: event.room,
      confidence: event.confidence,
    },
    reason: event.reason,
    sources: eventSources.map((source) => ({
      id: source.id,
      author: source.author,
      role: source.role,
      kind: source.kind,
      text: source.text,
      time: source.sourceTime,
      chat: source.chat,
    })),
  };
}

export async function ensureGroup(input: {
  id: string;
  name: string;
  telegramChatId?: string;
}) {
  const db = getDb();
  const [group] = await db
    .insert(groups)
    .values(input)
    .onConflictDoUpdate({
      target: groups.id,
      set: {
        name: input.name,
        telegramChatId: input.telegramChatId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: groups.id, name: groups.name, accessToken: groups.accessToken });
  if (!group) throw new Error("GROUP_UPSERT_FAILED");
  return group;
}

export async function findGroupByAccessToken(accessToken: string) {
  const db = getDb();
  const [group] = await db
    .select({ id: groups.id, name: groups.name, accessToken: groups.accessToken })
    .from(groups)
    .where(eq(groups.accessToken, accessToken))
    .limit(1);
  return group ?? null;
}

export async function findGroupById(id: string) {
  const db = getDb();
  const [group] = await db
    .select({ id: groups.id, name: groups.name, accessToken: groups.accessToken })
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);
  return group ?? null;
}

export async function listEvents(groupId = demoGroupId): Promise<InboxItem[]> {
  const db = getDb();
  const [eventRows, sourceRows] = await Promise.all([
    db.select().from(events).where(eq(events.groupId, groupId)).orderBy(asc(events.eventDate)),
    db
      .select({ source: sources })
      .from(sources)
      .innerJoin(events, eq(sources.eventId, events.id))
      .where(eq(events.groupId, groupId)),
  ]);

  const sourcesByEvent = new Map<string, SourceRow[]>();
  for (const { source } of sourceRows) {
    const current = sourcesByEvent.get(source.eventId) ?? [];
    current.push(source);
    sourcesByEvent.set(source.eventId, current);
  }

  return eventRows.map((event) => toInboxItem(event, sourcesByEvent.get(event.id) ?? []));
}

export async function saveEvent(
  item: InboxItem,
  groupId = demoGroupId,
  group?: { name?: string; telegramChatId?: string },
) {
  const db = getDb();
  const savedGroup = await ensureGroup({
    id: groupId,
    name: group?.name ?? (groupId === demoGroupId ? "ИВТ-101" : groupId),
    telegramChatId: group?.telegramChatId,
  });

  const eventUpsert = db
    .insert(events)
    .values({
      id: item.id,
      groupId,
      title: item.event.title,
      subject: item.event.subject,
      eventDate: item.event.date,
      eventTime: item.event.time,
      room: item.event.room,
      confidence: item.event.confidence,
      status: item.status,
      reason: item.reason,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: events.id,
      set: {
        title: item.event.title,
        subject: item.event.subject,
        eventDate: item.event.date,
        eventTime: item.event.time,
        room: item.event.room,
        confidence: item.event.confidence,
        status: item.status,
        reason: item.reason,
        updatedAt: new Date(),
      },
    });

  if (item.sources.length === 0) {
    await eventUpsert;
    return savedGroup;
  }

  const sourceUpsert = db
    .insert(sources)
    .values(
      item.sources.map((source) => ({
        id: source.id,
        eventId: item.id,
        author: source.author,
        role: source.role,
        kind: source.kind,
        text: source.text,
        sourceTime: source.time,
        chat: source.chat,
      })),
    )
    .onConflictDoUpdate({
      target: sources.id,
      set: {
        author: sql`excluded.author`,
        role: sql`excluded.role`,
        kind: sql`excluded.kind`,
        text: sql`excluded.text`,
        sourceTime: sql`excluded.source_time`,
        chat: sql`excluded.chat`,
      },
    });

  await db.batch([eventUpsert, sourceUpsert]);
  return savedGroup;
}

export async function updateEventStatus(id: string, status: ReviewStatus, groupId?: string) {
  const db = getDb();
  const [updated] = await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(groupId ? and(eq(events.id, id), eq(events.groupId, groupId)) : eq(events.id, id))
    .returning({ id: events.id, status: events.status });
  return updated ?? null;
}
