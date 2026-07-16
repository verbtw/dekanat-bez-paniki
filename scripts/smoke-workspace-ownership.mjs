import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim();
const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "");
if (!databaseUrl || !appUrl) throw new Error("DATABASE_URL and APP_URL are required");

const sql = neon(databaseUrl);
const stamp = Date.now();
const groupA = `smoke:owner:a:${stamp}`;
const groupB = `smoke:owner:b:${stamp}`;
const eventId = `evt:owned:${stamp}`;
const sourceId = `src:owned:${stamp}`;
const newEventId = `evt:new:${stamp}`;

function item(id, source, title) {
  return {
    id,
    status: "review",
    receivedAt: "21:30",
    event: {
      title,
      subject: "Физика",
      date: "2026-09-20",
      time: "10:00",
      room: "А-101",
      confidence: 96,
    },
    reason: "Ownership smoke",
    sources: [{
      id: source,
      author: "Smoke",
      role: "student",
      kind: "message",
      text: "Физика 20.09 в 10:00, ауд. А-101",
      time: "21:30",
      chat: "Smoke",
    }],
  };
}

let result = {};
try {
  await sql`insert into groups (id, name) values (${groupA}, ${"Owner A"})`;
  const [workspace] = await sql`
    insert into groups (id, name) values (${groupB}, ${"Owner B"})
    returning access_token
  `;
  await sql`
    insert into events (id, group_id, title, subject, event_date, event_time, room, confidence, status, reason)
    values (${eventId}, ${groupA}, ${"Original title"}, ${"Физика"}, ${"2026-09-20"}, ${"10:00"}, ${"А-101"}, ${96}, ${"review"}, ${"Original"})
  `;
  await sql`
    insert into sources (id, event_id, author, role, kind, text, source_time, chat)
    values (${sourceId}, ${eventId}, ${"Owner A"}, ${"student"}, ${"message"}, ${"Original source"}, ${"21:30"}, ${"A"})
  `;

  const post = async (payload) => {
    const response = await fetch(`${appUrl}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: workspace.access_token, item: payload }),
    });
    return { status: response.status, body: await response.json() };
  };
  const eventCollision = await post(item(eventId, `src:fresh:${stamp}`, "Attack title"));
  const sourceCollision = await post(item(newEventId, sourceId, "New event"));
  const [original] = await sql`select title, group_id from events where id = ${eventId}`;
  const [newEvent] = await sql`select id from events where id = ${newEventId}`;
  const [source] = await sql`select text, event_id from sources where id = ${sourceId}`;
  result = {
    eventCollision: { status: eventCollision.status, code: eventCollision.body.code },
    sourceCollision: { status: sourceCollision.status, code: sourceCollision.body.code },
    original,
    newEventCreated: Boolean(newEvent),
    source,
  };
} finally {
  await sql`delete from groups where id = ${groupA} or id = ${groupB}`;
}

const passed = result.eventCollision?.status === 409
  && result.sourceCollision?.status === 409
  && result.original?.title === "Original title"
  && !result.newEventCreated
  && result.source?.text === "Original source";
console.log(JSON.stringify({ ...result, cleanup: "ok", passed }, null, 2));
if (!passed) process.exitCode = 1;
