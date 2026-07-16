import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { EvidenceSource, ExtractedEvent, InboxItem, ReviewStatus } from "@/lib/types";
import { getDb } from "./client";
import {
  eventActivities,
  events,
  groups,
  sources,
  type EventActivityRow,
  type EventRow,
  type SourceRow,
} from "./schema";

export const demoGroupId = "demo:ivt-101";

function toInboxItem(
  event: EventRow,
  eventSources: SourceRow[],
  activity: EventActivityRow[],
): InboxItem {
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
    activity: activity.map((entry) => ({
      id: entry.id,
      action: entry.action as "created" | "edited" | "status_changed" | "source_added",
      actor: entry.actor,
      details: entry.details,
      createdAt: entry.createdAt.toISOString(),
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
  const [eventRows, sourceRows, activityRows] = await Promise.all([
    db.select().from(events).where(eq(events.groupId, groupId)).orderBy(asc(events.eventDate)),
    db
      .select({ source: sources })
      .from(sources)
      .innerJoin(events, eq(sources.eventId, events.id))
      .where(eq(events.groupId, groupId)),
    db
      .select({ activity: eventActivities })
      .from(eventActivities)
      .innerJoin(events, eq(eventActivities.eventId, events.id))
      .where(eq(events.groupId, groupId))
      .orderBy(desc(eventActivities.createdAt)),
  ]);

  const sourcesByEvent = new Map<string, SourceRow[]>();
  for (const { source } of sourceRows) {
    const current = sourcesByEvent.get(source.eventId) ?? [];
    current.push(source);
    sourcesByEvent.set(source.eventId, current);
  }

  const activityByEvent = new Map<string, EventActivityRow[]>();
  for (const { activity } of activityRows) {
    const current = activityByEvent.get(activity.eventId) ?? [];
    current.push(activity);
    activityByEvent.set(activity.eventId, current);
  }

  return eventRows.map((event) =>
    toInboxItem(
      event,
      sourcesByEvent.get(event.id) ?? [],
      activityByEvent.get(event.id) ?? [],
    ),
  );
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

  const creationActivity = db
    .insert(eventActivities)
    .values({
      id: `created:${item.id}`,
      eventId: item.id,
      action: "created",
      actor: item.sources[0]?.author ?? "Система",
      details: { title: item.event.title },
    })
    .onConflictDoNothing({ target: eventActivities.id });

  await db.batch([eventUpsert, sourceUpsert, creationActivity]);
  return savedGroup;
}

export async function updateEventStatus(id: string, status: ReviewStatus, groupId?: string) {
  const db = getDb();
  const where = groupId ? and(eq(events.id, id), eq(events.groupId, groupId)) : eq(events.id, id);
  const [current] = await db
    .select({ status: events.status })
    .from(events)
    .where(where)
    .limit(1);
  if (!current) return null;

  const updateQuery = db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(where)
    .returning({ id: events.id, status: events.status });
  if (current.status === status) {
    const [updated] = await updateQuery;
    return updated ?? null;
  }

  const activityQuery = db.insert(eventActivities).values({
    eventId: id,
    action: "status_changed",
    actor: "Участник группы",
    details: { from: current.status, to: status },
  });
  const [updatedRows] = await db.batch([updateQuery, activityQuery]);
  return updatedRows[0] ?? null;
}

export type EditableEventInput = Pick<ExtractedEvent, "title" | "subject" | "date" | "time" | "room">;

export async function updateEventFields(
  id: string,
  input: EditableEventInput,
  groupId: string,
) {
  const db = getDb();
  const where = and(eq(events.id, id), eq(events.groupId, groupId));
  const [current] = await db.select().from(events).where(where).limit(1);
  if (!current) return null;

  const before = {
    title: current.title,
    subject: current.subject,
    date: current.eventDate,
    time: current.eventTime,
    room: current.room,
  };
  const changed = Object.entries(input).filter(
    ([key, value]) => before[key as keyof typeof before] !== value,
  );
  if (changed.length === 0) {
    return { id: current.id, event: { ...input, confidence: current.confidence }, status: current.status };
  }

  const updateQuery = db
    .update(events)
    .set({
      title: input.title,
      subject: input.subject,
      eventDate: input.date,
      eventTime: input.time,
      room: input.room,
      confidence: 100,
      status: "review",
      reason: "Поля исправлены вручную. Подтвердите событие перед публикацией.",
      updatedAt: new Date(),
    })
    .where(where)
    .returning({ id: events.id, status: events.status });
  const activityQuery = db.insert(eventActivities).values({
    eventId: id,
    action: "edited",
    actor: "Участник группы",
    details: Object.fromEntries(changed.map(([key, value]) => [key, `${before[key as keyof typeof before]} → ${value}`])),
  });
  const [updatedRows] = await db.batch([updateQuery, activityQuery]);
  const updated = updatedRows[0];
  return updated
    ? { id: updated.id, event: { ...input, confidence: 100 }, status: updated.status }
    : null;
}

export async function deleteEvent(id: string, groupId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.groupId, groupId)))
    .returning({ id: events.id });
  return deleted ?? null;
}

export async function appendSourceToEvent(
  eventId: string,
  source: EvidenceSource,
  groupId: string,
) {
  const db = getDb();
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.groupId, groupId)))
    .limit(1);
  if (!event) return null;

  const sourceQuery = db
    .insert(sources)
    .values({
      id: source.id,
      eventId,
      author: source.author,
      role: source.role,
      kind: source.kind,
      text: source.text,
      sourceTime: source.time,
      chat: source.chat,
    })
    .onConflictDoNothing({ target: sources.id });
  const activityQuery = db
    .insert(eventActivities)
    .values({
      id: `source:${source.id}`,
      eventId,
      action: "source_added",
      actor: source.author,
      details: { source: source.text },
    })
    .onConflictDoNothing({ target: eventActivities.id });
  await db.batch([sourceQuery, activityQuery]);
  return event;
}
