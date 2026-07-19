"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { buildGroupBriefText, getAgendaItems, getUpcomingItems } from "@/lib/briefing";
import { buildCalendarEvent, calendarFilename } from "@/lib/calendar";
import { applyConflictAssessment, assessEventConflict } from "@/lib/conflict-detector";
import { demoItems } from "@/lib/demo-data";
import { extractEvent } from "@/lib/extract-event";
import type { ExtractedEvent, InboxItem, ReviewStatus, SourceKind, SourceRole } from "@/lib/types";
import { buildSharedMessage } from "@/lib/share-target";
import { localizeInterface, type UiLocale } from "@/lib/ui-i18n";
import {
  buildWorkspaceBackup,
  mergeBackupItems,
  parseWorkspaceBackup,
  workspaceBackupFilename,
} from "@/lib/workspace-backup";

const navItems = [
  { id: "inbox", icon: "↙", label: "Входящие" },
  { id: "brief", icon: "☼", label: "Сводка" },
  { id: "radar", icon: "◉", label: "Радар" },
  { id: "events", icon: "□", label: "События" },
  { id: "sources", icon: "⌁", label: "Источники" },
] as const;

type NavId = (typeof navItems)[number]["id"];
type Theme = "light" | "dark";
type StorageMode = "checking" | "local" | "database";
type InboxFilter = "all" | "attention";
type EditableEvent = Pick<ExtractedEvent, "title" | "subject" | "date" | "time" | "room">;
type SyncResult = "database" | "local" | "failed";

const workspaceStorageKey = "dbp:workspace:v1";
function getWorkspaceStorageKey(workspace: string) {
  return `${workspaceStorageKey}:${workspace || "demo"}`;
}
const roleLabel: Record<SourceRole, string> = {
  teacher: "преподаватель",
  "group-lead": "староста",
  student: "студент",
};

function saveWorkspace(items: InboxItem[], workspace = "") {
  window.localStorage.setItem(
    getWorkspaceStorageKey(workspace),
    JSON.stringify({ version: 1, items }),
  );
}

async function pushEventToServer(item: InboxItem, workspace: string) {
  if (!workspace) return "local" as const;
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item, groupId: workspace }),
    });
    return response.ok ? "database" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

async function pushStatusToServer(id: string, status: ReviewStatus, workspace: string) {
  if (!workspace) return "local" as const;
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, groupId: workspace }),
    });
    return response.ok ? "database" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

async function pushEventEditToServer(id: string, event: EditableEvent, workspace: string) {
  if (!workspace) return "local" as const;
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, groupId: workspace }),
    });
    return response.ok ? "database" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

async function deleteEventFromServer(id: string, workspace: string) {
  if (!workspace) return "local" as const;
  try {
    const suffix = workspace ? `?groupId=${encodeURIComponent(workspace)}` : "";
    const response = await fetch(`/api/events/${encodeURIComponent(id)}${suffix}`, {
      method: "DELETE",
    });
    return response.ok ? "database" as const : "failed" as const;
  } catch {
    return "failed" as const;
  }
}

const statusLabel: Record<ReviewStatus, string> = {
  conflict: "Есть конфликт",
  review: "Проверить",
  confirmed: "Подтверждено",
};

const sourceIcon: Record<SourceKind, string> = {
  message: "Т",
  voice: "◖",
  image: "▧",
  document: "≡",
};

function humanDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function sourceCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} сообщение`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} сообщения`;
  }
  return `${count} сообщений`;
}

function workspaceInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "ГР").toUpperCase();
}

function eventSummary(item: InboxItem) {
  return [
    item.event.title,
    `${humanDate(item.event.date)} · ${item.event.time} · ${item.event.room}`,
    `Статус: ${statusLabel[item.status]}`,
    `Источник: ${item.sources[0]?.text ?? "не указан"}`,
  ].join("\n");
}

function activityLabel(action: NonNullable<InboxItem["activity"]>[number]["action"]) {
  if (action === "edited") return "Поля исправлены";
  if (action === "status_changed") return "Статус изменён";
  if (action === "source_added") return "Добавлен источник";
  return "Событие создано";
}

function activityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function EventsView({
  items,
  onOpen,
  onAdd,
  onCalendar,
}: {
  items: InboxItem[];
  onOpen: (id: string) => void;
  onAdd: () => void;
  onCalendar: () => void;
}) {
  const datedItems = [...items].sort((left, right) =>
    left.event.date.localeCompare(right.event.date),
  );
  const firstValidDate = datedItems.find((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.event.date));
  const monthLabel = firstValidDate
    ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
        new Date(`${firstValidDate.event.date}T12:00:00`),
      )
    : "Без даты";

  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Календарь группы</span>
          <h1>События</h1>
          <p>Все подтверждённые и ожидающие проверки изменения в одном месте.</p>
        </div>
        <div className="workspace-header-actions">
          <button className="secondary-button" onClick={onCalendar}>⌁ Подключить календарь</button>
          <button className="primary-button" onClick={onAdd}>＋ Добавить сообщение</button>
        </div>
      </header>

      <div className="workspace-stats">
        <article><span>Всего</span><strong>{items.length}</strong><small>события в потоке</small></article>
        <article><span>Подтверждено</span><strong>{items.filter((item) => item.status === "confirmed").length}</strong><small>готово для календаря</small></article>
        <article className="attention"><span>Требуют внимания</span><strong>{items.filter((item) => item.status !== "confirmed").length}</strong><small>нужна проверка человеком</small></article>
      </div>

      <div className="calendar-board">
        <div className="calendar-heading">
          <div><span className="eyebrow">{monthLabel}</span><h2>Ближайшие изменения</h2></div>
          <span className="calendar-legend"><i /> источник сохранён</span>
        </div>
        <div className="event-table">
          {datedItems.map((item) => (
            <button className="event-row" key={item.id} onClick={() => onOpen(item.id)}>
              <time><strong>{humanDate(item.event.date).split(" ")[0]}</strong><span>{humanDate(item.event.date).split(" ")[1] ?? "—"}</span></time>
              <span className={`event-status-line ${item.status}`} />
              <span className="event-main"><strong>{item.event.title}</strong><small>{item.event.subject} · {item.event.time}</small></span>
              <span className="event-room">{item.event.room}</span>
              <span className={`case-badge ${item.status}`}><i /> {statusLabel[item.status]}</span>
              <span className="row-arrow">→</span>
            </button>
          ))}
          {datedItems.length === 0 && (
            <div className="empty-state"><span>□</span><strong>Событий пока нет</strong><p>Добавь сообщение или отправь его Telegram-боту.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

function SourcesView({ items }: { items: InboxItem[] }) {
  const sources = items.flatMap((item) =>
    item.sources.map((source) => ({ ...source, eventTitle: item.event.title })),
  );
  const uniqueAuthors = new Set(sources.map((source) => source.author)).size;

  return (
    <section className="workspace-view">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Карта доверия</span>
          <h1>Источники</h1>
          <p>Видно, кто сообщил факт и почему система считает его надёжным.</p>
        </div>
        <span className="source-health"><i /> Все источники доступны</span>
      </header>

      <div className="trust-strip">
        <div className="trust-copy"><span className="eyebrow">Правило приоритета</span><h2>Не все сообщения весят одинаково</h2><p>Новая информация преподавателя имеет больший вес, но исходное сообщение никогда не удаляется из цепочки.</p></div>
        <div className="trust-scale">
          <span className="trust-level teacher"><b>01</b><strong>Преподаватель</strong><small>высокий приоритет</small></span>
          <span className="trust-arrow">→</span>
          <span className="trust-level group-lead"><b>02</b><strong>Староста</strong><small>средний приоритет</small></span>
          <span className="trust-arrow">→</span>
          <span className="trust-level student"><b>03</b><strong>Студент</strong><small>нужно подтверждение</small></span>
        </div>
      </div>

      <div className="source-directory">
        <div className="calendar-heading">
          <div><span className="eyebrow">Последняя активность</span><h2>{uniqueAuthors} авторов · {sourceCountLabel(sources.length)}</h2></div>
        </div>
        <div className="source-grid">
          {sources.map((source) => (
            <article className="directory-card" key={source.id}>
              <div className={`directory-avatar ${source.role}`}>{source.author.slice(0, 1)}</div>
              <div className="directory-person"><strong>{source.author}</strong><span className={`role-pill ${source.role}`}>{roleLabel[source.role]}</span></div>
              <time>{source.time}</time>
              <p>{source.text}</p>
              <footer><span>⌁ {source.chat}</span><b>{source.eventTitle}</b></footer>
            </article>
          ))}
          {sources.length === 0 && (
            <div className="empty-state"><span>⌁</span><strong>Источников пока нет</strong><p>Первое распознанное сообщение появится здесь.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}

function BriefView({
  items,
  onOpen,
  onCopy,
}: {
  items: InboxItem[];
  onOpen: (id: string) => void;
  onCopy: () => void;
}) {
  const upcoming = getUpcomingItems(items);
  const today = getAgendaItems(items, "today");
  const next = upcoming[0] ?? null;
  const conflicts = items.filter((item) => item.status === "conflict");
  const confirmed = items.filter((item) => item.status === "confirmed").length;

  return (
    <section className="workspace-view brief-view">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Оперативная картина</span>
          <h1>Сводка группы</h1>
          <p>Короткий ответ на три вопроса: что сегодня, что дальше и где требуется решение.</p>
        </div>
        <button className="primary-button" onClick={onCopy}>Копировать сводку ↗</button>
      </header>

      <div className="brief-hero">
        <article className="brief-now">
          <span className="brief-kicker"><i /> Сейчас в фокусе</span>
          {next ? (
            <button onClick={() => onOpen(next.id)}>
              <time>{humanDate(next.event.date)} · {next.event.time}</time>
              <strong>{next.event.title}</strong>
              <p>{next.event.subject} · {next.event.room}</p>
              <span className={`case-badge ${next.status}`}><i /> {statusLabel[next.status]}</span>
            </button>
          ) : (
            <div className="brief-clear"><strong>План свободен</strong><p>Ближайших событий пока нет.</p></div>
          )}
        </article>

        <div className="brief-scoreboard">
          <article><span>Сегодня</span><strong>{today.length}</strong><small>событий в плане</small></article>
          <article><span>Дальше</span><strong>{upcoming.length}</strong><small>ближайших карточек</small></article>
          <article className={conflicts.length ? "urgent" : ""}><span>Решить</span><strong>{conflicts.length}</strong><small>активных конфликтов</small></article>
          <article><span>Готово</span><strong>{confirmed}</strong><small>подтверждено</small></article>
        </div>
      </div>

      <div className="brief-grid">
        <section className="brief-agenda">
          <div className="calendar-heading"><div><span className="eyebrow">Следующие шаги</span><h2>Ближайшие события</h2></div></div>
          <div className="brief-timeline">
            {upcoming.map((item, index) => (
              <button key={item.id} onClick={() => onOpen(item.id)}>
                <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                <time><strong>{humanDate(item.event.date)}</strong><small>{item.event.time}</small></time>
                <span><strong>{item.event.title}</strong><small>{item.event.subject} · {item.event.room}</small></span>
                <i className={`status-dot ${item.status}`} />
              </button>
            ))}
            {upcoming.length === 0 && <div className="empty-state"><span>☼</span><strong>Пока спокойно</strong><p>Новые события появятся в сводке автоматически.</p></div>}
          </div>
        </section>

        <aside className="brief-priority">
          <div className="calendar-heading"><div><span className="eyebrow">Не пропустить</span><h2>Приоритет</h2></div></div>
          {conflicts.slice(0, 3).map((item) => (
            <button key={item.id} onClick={() => onOpen(item.id)}>
              <span>!</span><div><strong>{item.event.title}</strong><small>{item.reason}</small></div><b>→</b>
            </button>
          ))}
          {conflicts.length === 0 && <div className="brief-safe"><span>✓</span><strong>Срочных решений нет</strong><p>Радар не видит противоречий.</p></div>}
          <footer><span>Telegram-команды</span><code>/today · /week · /digest</code></footer>
        </aside>
      </div>
    </section>
  );
}

function RadarView({ items, onOpen }: { items: InboxItem[]; onOpen: (id: string) => void }) {
  const conflicts = items.filter((item) => item.status === "conflict");
  const pending = items.filter((item) => item.status === "review");
  const known = (value: string) => !value.toLowerCase().includes("не найден") && !value.toLowerCase().includes("не определён");
  const fieldIssues = [
    { key: "date", label: "Дата", count: items.filter((item) => !known(item.event.date)).length },
    { key: "time", label: "Время", count: items.filter((item) => !known(item.event.time)).length },
    { key: "room", label: "Аудитория", count: items.filter((item) => !known(item.event.room)).length },
    { key: "subject", label: "Предмет", count: items.filter((item) => !known(item.event.subject)).length },
  ];
  const totalFields = Math.max(items.length * fieldIssues.length, 1);
  const completeness = Math.round((1 - fieldIssues.reduce((sum, field) => sum + field.count, 0) / totalFields) * 100);
  const roleWeight: Record<SourceRole, number> = { teacher: 100, "group-lead": 78, student: 52 };
  const allSources = items.flatMap((item) => item.sources);
  const trust = allSources.length
    ? Math.round(allSources.reduce((sum, source) => sum + roleWeight[source.role], 0) / allSources.length)
    : 0;

  return (
    <section className="workspace-view radar-view">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Контроль расхождений</span>
          <h1>Радар</h1>
          <p>Система сравнивает новые сообщения с историей группы и показывает, где факты не сходятся.</p>
        </div>
        <span className={conflicts.length ? "radar-state warning" : "radar-state safe"}><i /> {conflicts.length ? `${conflicts.length} требуют решения` : "расхождений нет"}</span>
      </header>

      <div className="radar-dashboard">
        <article className="radar-scope">
          <div className="radar-orbit" aria-label={`${conflicts.length} активных противоречий`}>
            <span className="orbit-ring ring-one" />
            <span className="orbit-ring ring-two" />
            <span className="orbit-ring ring-three" />
            {conflicts.slice(0, 4).map((item, index) => <i key={item.id} style={{ "--signal-index": index } as CSSProperties} />)}
            <div><strong>{conflicts.length}</strong><span>активных<br />сигналов</span></div>
          </div>
          <footer><span><i className="risk-dot" /> конфликт</span><span><i className="review-dot" /> проверка</span></footer>
        </article>

        <div className="radar-metrics">
          <article><span>Полнота данных</span><strong>{completeness}%</strong><div><i style={{ width: `${completeness}%` }} /></div><small>заполнены ключевые поля</small></article>
          <article><span>Доверие источников</span><strong>{trust}%</strong><div><i style={{ width: `${trust}%` }} /></div><small>с учётом ролей авторов</small></article>
          <article><span>Ждут проверки</span><strong>{pending.length}</strong><small>можно подтвердить вручную</small></article>
        </div>
      </div>

      <div className="radar-columns">
        <section className="radar-queue">
          <div className="calendar-heading"><div><span className="eyebrow">Очередь решений</span><h2>Что проверить сейчас</h2></div></div>
          {conflicts.map((item) => (
            <button className="radar-alert" key={item.id} onClick={() => onOpen(item.id)}>
              <span className="alert-pulse">!</span>
              <span><strong>{item.event.title}</strong><small>{item.reason}</small></span>
              <span className="row-arrow">→</span>
            </button>
          ))}
          {conflicts.length === 0 && <div className="empty-state"><span>✓</span><strong>Очередь чиста</strong><p>Новые противоречия появятся здесь автоматически.</p></div>}
        </section>

        <section className="field-health">
          <div className="calendar-heading"><div><span className="eyebrow">Качество извлечения</span><h2>Пробелы в данных</h2></div></div>
          {fieldIssues.map((field) => (
            <div className="field-health-row" key={field.key}>
              <span>{field.label}</span><div><i style={{ width: `${items.length ? (field.count / items.length) * 100 : 0}%` }} /></div><strong>{field.count}</strong>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

export function EvidenceDesk({
  workspaceId = "",
  initialWorkspaceName = "ИВТ-101 · демо",
  calendarToken = null,
}: {
  workspaceId?: string;
  initialWorkspaceName?: string;
  calendarToken?: string | null;
} = {}) {
  const [items, setItems] = useState(demoItems);
  const [selectedId, setSelectedId] = useState(demoItems[0].id);
  const [activeNav, setActiveNav] = useState<NavId>("inbox");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [editDraft, setEditDraft] = useState<EditableEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [locale, setLocale] = useState<UiLocale>("ru");
  const [localeReady, setLocaleReady] = useState(false);
  const [workspaceToken, setWorkspaceToken] = useState(workspaceId);
  const [requestedEventId, setRequestedEventId] = useState("");
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentTheme = document.documentElement.dataset.theme;
      setTheme(currentTheme === "dark" ? "dark" : "light");
      const savedLocale = window.localStorage.getItem("morrow:locale");
      setLocale(savedLocale === "en" ? "en" : "ru");
      setLocaleReady(true);
      const params = new URLSearchParams(window.location.search);
      const isShareTarget = params.get("share") === "1";
      const urlWorkspace = params.get("groupId")?.trim() || params.get("workspace")?.trim() || "";
      const workspace = workspaceId || urlWorkspace;
      setWorkspaceToken(workspace);
      setRequestedEventId(params.get("event")?.trim() || "");
      const requestedView = params.get("view");
      if (navItems.some((item) => item.id === requestedView)) setActiveNav(requestedView as NavId);
      if (isShareTarget) {
        const shared = buildSharedMessage({
          title: params.get("title"),
          text: params.get("text"),
          url: params.get("url"),
        });
        if (shared) {
          setNewMessage(shared);
          setComposerOpen(true);
        }
        const cleanUrl = new URL(window.location.origin + window.location.pathname);
        if (workspace) cleanUrl.searchParams.set("groupId", workspace);
        window.history.replaceState(null, "", cleanUrl);
      }
      setWorkspaceReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [workspaceId]);

  useEffect(() => {
    if (!localeReady) return;
    document.documentElement.lang = locale;
    window.localStorage.setItem("morrow:locale", locale);
    localizeInterface(document.body, locale);

    const observer = new MutationObserver(() => localizeInterface(document.body, locale));
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "placeholder", "title"],
    });
    return () => observer.disconnect();
  }, [locale, localeReady]);

  useEffect(() => {
    if (!workspaceReady) return;
    const frame = window.requestAnimationFrame(() => {
      const key = getWorkspaceStorageKey(workspaceToken);
      try {
        const saved = window.localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; items?: InboxItem[] };
          if (parsed.version === 1 && Array.isArray(parsed.items)) {
            setItems(parsed.items);
            setSelectedId(parsed.items[0]?.id ?? "");
          }
        } else if (workspaceToken) {
          setItems([]);
          setSelectedId("");
        }
      } catch {
        window.localStorage.removeItem(key);
      } finally {
        setStorageReady(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [workspaceReady, workspaceToken]);

  useEffect(() => {
    if (!storageReady) return;
    saveWorkspace(items, workspaceToken);
  }, [items, storageReady, workspaceToken]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setComposerOpen(false);
        setSettingsOpen(false);
        setEditOpen(false);
        setDeleteOpen(false);
        setActionMenuOpen(false);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();

    const endpoint = workspaceToken
      ? `/api/events?groupId=${encodeURIComponent(workspaceToken)}`
      : "/api/events";
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          mode?: StorageMode;
          items?: InboxItem[];
          workspace?: { name?: string };
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить рабочее пространство");
        return data;
      })
      .then((data) => {
        if (data.mode !== "database") {
          setStorageMode("local");
          return;
        }

        setStorageMode("database");
        setWorkspaceName(data.workspace?.name || (workspaceToken ? "Telegram-группа" : "ИВТ-101 · демо"));
        if (!Array.isArray(data.items)) return;
        setItems((current) => {
          const localOnly = current.filter(
            (local) => !data.items?.some((remote) => remote.id === local.id),
          );
          const merged = [...data.items!, ...localOnly];
          saveWorkspace(merged, workspaceToken);
          setSelectedId((selected) =>
            merged.some((item) => item.id === selected) ? selected : (merged[0]?.id ?? ""),
          );
          return merged;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStorageMode("local");
        setSyncError(error instanceof Error ? error.message : "Не удалось синхронизировать данные");
      });

    return () => controller.abort();
  }, [storageReady, workspaceToken]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) =>
      (filter === "all" || item.status !== "confirmed") &&
      (!normalized ||
      [item.event.title, item.event.subject, ...item.sources.map((source) => source.text)]
        .join(" ")
        .toLowerCase()
        .includes(normalized)),
    );
  }, [filter, items, query]);

  const selected = items.find((item) => item.id === requestedEventId)
    ?? items.find((item) => item.id === selectedId)
    ?? items[0]
    ?? null;
  const navCounts: Record<NavId, number> = {
    inbox: items.length,
    brief: getUpcomingItems(items).length,
    radar: items.filter((item) => item.status === "conflict").length,
    events: items.length,
    sources: items.reduce((total, item) => total + item.sources.length, 0),
  };

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function applySyncResult(result: SyncResult, failureMessage: string) {
    if (result === "database") {
      setStorageMode("database");
      setSyncError(null);
    } else if (result === "local") {
      setStorageMode("local");
      setSyncError(null);
    } else {
      setSyncError(failureMessage);
    }
  }

  async function retrySync() {
    if (syncing) return;
    setSyncing(true);
    setStorageMode("checking");
    try {
      const results: SyncResult[] = items.length
        ? await Promise.all(items.map((item) => pushEventToServer(item, workspaceToken)))
        : workspaceToken
          ? [await fetch(`/api/events?groupId=${encodeURIComponent(workspaceToken)}`)
            .then((response) => response.ok ? "database" as const : "failed" as const)
            .catch(() => "failed" as const)]
          : ["local"];
      if (results.includes("failed")) throw new Error("PARTIAL_SYNC");
      setStorageMode(workspaceToken ? "database" : "local");
      setSyncError(null);
      flash(workspaceToken
        ? items.length ? `Синхронизировано карточек: ${items.length}` : "Связь с базой восстановлена"
        : "Демо работает локально — серверные данные не изменяются");
    } catch {
      setStorageMode("local");
      setSyncError("Не удалось синхронизировать все карточки — локальные данные сохранены");
      flash("Сервер пока недоступен — попробуем позже");
    } finally {
      setSyncing(false);
    }
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("dbp:theme", nextTheme);
    setTheme(nextTheme);
  }

  function buildAppUrl(eventId?: string, includeWorkspace = true) {
    const url = new URL(window.location.origin + window.location.pathname);
    if (includeWorkspace && workspaceToken) url.searchParams.set("groupId", workspaceToken);
    if (eventId) url.searchParams.set("event", eventId);
    if (!eventId && activeNav !== "inbox") url.searchParams.set("view", activeNav);
    return url.toString();
  }

  function selectEvent(id: string, updateUrl = true) {
    setSelectedId(id);
    setRequestedEventId(id);
    setActiveNav("inbox");
    setActionMenuOpen(false);
    if (updateUrl) window.history.replaceState(null, "", buildAppUrl(id));
  }

  function openEvent(id: string) {
    selectEvent(id);
  }

  function updateStatus(status: ReviewStatus) {
    if (!selected) return;
    if (selected.status === "conflict" && status !== "conflict") {
      openEditor();
      flash("Сначала исправь поле, по которому источники не сходятся");
      return;
    }
    setItems((current) => {
      const next = current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              status,
              activity: [
                {
                  id: `local-status:${Date.now()}`,
                  action: "status_changed" as const,
                  actor: "Вы",
                  details: { from: item.status, to: status },
                  createdAt: new Date().toISOString(),
                },
                ...(item.activity ?? []),
              ],
            }
          : item,
      );
      saveWorkspace(next, workspaceToken);
      return next;
    });
    void pushStatusToServer(selected.id, status, workspaceToken).then((synced) => {
      applySyncResult(synced, "Изменение сохранено локально и ждёт синхронизации");
    });
    flash(status === "confirmed" ? "Событие подтверждено" : "Возвращено на проверку");
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash(successMessage);
    } catch {
      flash("Не удалось скопировать — выдели текст вручную");
    }
  }

  async function shareEvent() {
    if (!selected) return;
    const text = eventSummary(selected);
    if (navigator.share) {
      try {
        await navigator.share({ title: selected.event.title, text, url: buildAppUrl(selected.id) });
        flash("Карточка отправлена");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyText(`${text}\n${buildAppUrl(selected.id)}`, "Карточка скопирована");
  }

  function addSimilarMessage() {
    if (!selected) return;
    setNewMessage(selected.sources[0]?.text ?? "");
    setActionMenuOpen(false);
    setComposerOpen(true);
  }

  async function copyWorkspaceLink() {
    await copyText(buildAppUrl(undefined, true), "Ссылка на рабочее пространство скопирована");
  }

  function calendarFeedUrl() {
    const url = new URL("/api/calendar", window.location.origin);
    if (calendarToken) url.searchParams.set("token", calendarToken);
    return url.toString();
  }

  async function copyCalendarFeed() {
    await copyText(calendarFeedUrl(), "Ссылка календаря скопирована");
  }

  function exportWorkspaceBackup() {
    const backup = buildWorkspaceBackup(workspaceName, items);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = workspaceBackupFilename(workspaceName);
    anchor.click();
    URL.revokeObjectURL(url);
    flash(`Резервная копия: ${items.length} карточек`);
  }

  async function importWorkspaceBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("BACKUP_TOO_LARGE");
      const parsedJson: unknown = JSON.parse(await file.text());
      const parsed = parseWorkspaceBackup(parsedJson);
      if (!parsed.success) throw new Error("BACKUP_INVALID");
      const merged = mergeBackupItems(items, parsed.data.items);
      setItems(merged);
      saveWorkspace(merged, workspaceToken);
      setSelectedId(parsed.data.items[0]?.id ?? merged[0]?.id ?? "");

      if (workspaceToken && parsed.data.items.length) {
        setSyncing(true);
        const results = await Promise.all(
          parsed.data.items.map((item) => pushEventToServer(item, workspaceToken)),
        );
        if (results.includes("failed")) {
          setSyncError("Импорт сохранён локально, но часть карточек ждёт синхронизации");
        } else {
          setStorageMode("database");
          setSyncError(null);
        }
      }
      flash(`Импортировано карточек: ${parsed.data.items.length}`);
    } catch {
      flash("Файл не похож на корректную резервную копию");
    } finally {
      setSyncing(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  function resetDemoWorkspace() {
    if (workspaceToken) return;
    setItems(demoItems);
    selectEvent(demoItems[0].id);
    saveWorkspace(demoItems);
    setSyncError(null);
    setStorageMode("local");
    flash("Демо восстановлено до исходного состояния");
  }

  function openEditor() {
    if (!selected) return;
    setEditDraft({
      title: selected.event.title,
      subject: selected.event.subject,
      date: /^\d{4}-\d{2}-\d{2}$/.test(selected.event.date) ? selected.event.date : "",
      time: /^\d{2}:\d{2}$/.test(selected.event.time) ? selected.event.time : "",
      room: selected.event.room === "Аудитория не найдена" ? "" : selected.event.room,
    });
    setActionMenuOpen(false);
    setEditOpen(true);
  }

  function saveEditedEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editDraft) return;
    const nextEvent = { ...editDraft, confidence: 100 };
    const activityDetails = Object.fromEntries(
      (Object.keys(editDraft) as Array<keyof EditableEvent>)
        .filter((key) => selected.event[key] !== editDraft[key])
        .map((key) => [key, `${selected.event[key]} → ${editDraft[key]}`]),
    );
    if (Object.keys(activityDetails).length === 0) {
      flash("Измени хотя бы одно поле, чтобы разрешить конфликт");
      return;
    }
    setItems((current) => current.map((item) =>
      item.id === selected.id
        ? {
            ...item,
            event: nextEvent,
            status: "review",
            reason: "Поля исправлены вручную. Подтвердите событие перед публикацией.",
            activity: Object.keys(activityDetails).length
              ? [{
                  id: `local-edit:${Date.now()}`,
                  action: "edited" as const,
                  actor: "Вы",
                  details: activityDetails,
                  createdAt: new Date().toISOString(),
                }, ...(item.activity ?? [])]
              : item.activity,
          }
        : item,
    ));
    setEditOpen(false);
    void pushEventEditToServer(selected.id, editDraft, workspaceToken).then((synced) => {
      applySyncResult(synced, "Исправления сохранены локально и ждут синхронизации");
    });
    flash("Исправления сохранены — проверь событие");
  }

  function exportCalendar() {
    if (!selected) return;
    const content = buildCalendarEvent(selected);
    setActionMenuOpen(false);
    if (!content) {
      flash("Сначала укажи точную дату и время");
      return;
    }
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = calendarFilename(selected);
    anchor.click();
    URL.revokeObjectURL(url);
    flash("Файл календаря подготовлен");
  }

  function confirmDeleteEvent() {
    if (!selected) return;
    const deletingId = selected.id;
    const remaining = items.filter((item) => item.id !== deletingId);
    setItems(remaining);
    if (remaining[0]) selectEvent(remaining[0].id);
    else {
      setSelectedId("");
      setRequestedEventId("");
      window.history.replaceState(null, "", buildAppUrl());
    }
    setDeleteOpen(false);
    setActionMenuOpen(false);
    void deleteEventFromServer(deletingId, workspaceToken).then((synced) => {
      applySyncResult(synced, "Удаление сохранено локально, но сервер пока недоступен");
    });
    flash("Карточка удалена");
  }

  function addMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newMessage.trim()) return;

    const extracted = extractEvent(newMessage);
    const id = `evt-${Date.now()}`;
    const item: InboxItem = {
      id,
      status: extracted.confidence >= 84 ? "review" : "conflict",
      receivedAt: new Intl.DateTimeFormat("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
      event: extracted,
      reason:
        extracted.confidence >= 84
          ? "Все основные поля найдены. Подтвердите результат перед публикацией."
          : "Часть данных не найдена. Уточните событие вручную.",
      sources: [
        {
          id: `src-${Date.now()}`,
          author: "Вы · симулятор бота",
          role: "student",
          kind: "message",
          text: newMessage.trim(),
          time: "сейчас",
          chat: "Тестовый входящий поток",
        },
      ],
    };

    const assessment = assessEventConflict(item, items);
    const assessedItem = applyConflictAssessment(item, assessment);
    if (assessment.kind === "duplicate") {
      setItems((current) => current.map((existing) =>
        existing.id === assessment.matchedId
          ? {
              ...existing,
              sources: [...existing.sources, item.sources[0]],
              activity: [{
                id: `local-source:${item.sources[0].id}`,
                action: "source_added" as const,
                actor: item.sources[0].author,
                details: { source: item.sources[0].text },
                createdAt: new Date().toISOString(),
              }, ...(existing.activity ?? [])],
            }
          : existing,
      ));
      selectEvent(assessment.matchedId);
    } else {
      setItems((current) => [assessedItem, ...current]);
      selectEvent(id);
    }
    setNewMessage("");
    setComposerOpen(false);
    void pushEventToServer(item, workspaceToken).then((synced) => {
      applySyncResult(synced, "Новое событие сохранено локально и ждёт синхронизации");
    });
    flash(
      assessment.kind === "duplicate"
        ? "Источник добавлен к существующей карточке"
        : assessment.kind === "conflict"
          ? "Найдено противоречие — открой радар"
          : "Сообщение распознано",
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>morrow</strong>
            <small>quietly in sync</small>
          </div>
        </div>

        <nav className="main-nav" aria-label="Основная навигация">
          <p className="nav-caption">Рабочее пространство</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeNav === item.id ? "nav-button active" : "nav-button"}
              onClick={() => setActiveNav(item.id)}
              aria-label={item.label}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              <span className="nav-count">{navCounts[item.id]}</span>
            </button>
          ))}
        </nav>

        <div className="group-card">
          <div className="group-avatar">{workspaceInitials(workspaceName)}</div>
          <div>
            <strong>{workspaceName}</strong>
            <small><span className="online-dot" /> {workspaceToken ? "Telegram workspace" : "демо-режим"}</small>
          </div>
          <button aria-label="Настройки группы" onClick={() => setSettingsOpen(true)}>•••</button>
        </div>

        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Включить ${theme === "light" ? "тёмную" : "светлую"} тему`}
        >
          <span className="theme-glyph" aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          <span className="theme-copy">
            <strong>{theme === "light" ? "Тёмная тема" : "Светлая тема"}</strong>
            <small>переключить оформление</small>
          </span>
          <span className={`theme-switch ${theme}`}><i /></span>
        </button>

        <div className="language-toggle" role="group" aria-label="Язык интерфейса">
          <span aria-hidden="true">文</span>
          <button
            type="button"
            className={locale === "ru" ? "active" : ""}
            aria-pressed={locale === "ru"}
            onClick={() => setLocale("ru")}
          >RU</button>
          <button
            type="button"
            className={locale === "en" ? "active" : ""}
            aria-pressed={locale === "en"}
            onClick={() => setLocale("en")}
          >EN</button>
        </div>

        <button
          className={syncError ? "sync-card error" : "sync-card"}
          type="button"
          onClick={() => void retrySync()}
          disabled={syncing}
          aria-label={syncError ? "Повторить синхронизацию" : "Проверить синхронизацию"}
        >
          <span className="sync-pulse" />
          <div>
            <strong>
              {syncing
                ? "Синхронизирую"
                : syncError
                ? "Нужна синхронизация"
                : storageMode === "database"
                ? "PostgreSQL подключён"
                : storageMode === "checking"
                  ? "Проверяю хранилище"
                  : "Локальное хранение"}
            </strong>
            <small>
              {syncing
                ? `отправляю карточек: ${items.length}`
                : syncError
                ? syncError
                : storageMode === "database"
                ? "события синхронизируются"
                : "работает без внешних ключей"}
            </small>
          </div>
        </button>
      </aside>

      <div className="mobile-preferences" aria-label="Язык интерфейса">
        <button type="button" onClick={() => setLocale(locale === "ru" ? "en" : "ru")}>
          {locale === "ru" ? "EN" : "RU"}
        </button>
        <button type="button" onClick={toggleTheme} aria-label={`Включить ${theme === "light" ? "тёмную" : "светлую"} тему`}>
          {theme === "light" ? "☾" : "☀"}
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Настройки группы">•••</button>
      </div>

      {activeNav === "inbox" ? (
        <>
      <section className="inbox-panel">
        <header className="panel-header">
          <div>
            <span className="eyebrow">Поток группы</span>
            <h1>Входящие</h1>
          </div>
          <button className="add-button" onClick={() => setComposerOpen(true)}>
            <span>＋</span> Добавить
          </button>
        </header>

        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по сообщениям"
            aria-label="Поиск по сообщениям"
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className="filter-row">
          <button className={filter === "all" ? "filter active" : "filter"} onClick={() => setFilter("all")}>Все <span>{items.length}</span></button>
          <button className={filter === "attention" ? "filter active" : "filter"} onClick={() => setFilter("attention")}>На проверку <span>{items.filter((item) => item.status !== "confirmed").length}</span></button>
        </div>

        <div className="inbox-list" aria-live="polite">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                selectEvent(item.id);
              }}
              className={selected?.id === item.id ? `inbox-item selected ${item.status}` : `inbox-item ${item.status}`}
            >
              <span className="item-topline">
                <span className={`status-dot ${item.status}`} />
                <span className="status-text">{statusLabel[item.status]}</span>
                <time>{item.receivedAt}</time>
              </span>
              <strong>{item.event.title}</strong>
              <span className="item-summary">
                {humanDate(item.event.date)} · {item.event.time} · {item.event.room}
              </span>
              <span className="source-preview">
                <span className="mini-avatars">
                  {item.sources.slice(0, 2).map((source) => (
                    <i key={source.id}>{source.author.slice(0, 1)}</i>
                  ))}
                </span>
                {item.sources.length} {item.sources.length === 1 ? "источник" : "источника"}
              </span>
            </button>
          ))}
          {visibleItems.length === 0 && (
            <div className="empty-state">
              <span>⌕</span>
              <strong>Ничего не нашли</strong>
              <p>Измени запрос или добавь новое сообщение.</p>
            </div>
          )}
        </div>
      </section>

      {selected ? (
      <section className="evidence-panel">
        <header className="evidence-header">
          <div className="breadcrumb"><span>Входящие</span><b>/</b>{selected.id}</div>
          <div className="header-actions">
            <button aria-label="Поделиться" onClick={() => void shareEvent()}>↗</button>
            <button
              aria-label="Больше действий"
              aria-expanded={actionMenuOpen}
              onClick={() => setActionMenuOpen((open) => !open)}
            >•••</button>
            {actionMenuOpen && (
              <div className="action-menu">
                <button onClick={openEditor}>Исправить поля</button>
                <button onClick={exportCalendar}>Добавить в календарь</button>
                <button onClick={() => void copyText(eventSummary(selected), "Карточка скопирована")}>Копировать карточку</button>
                <button onClick={addSimilarMessage}>Добавить похожее</button>
                <button className="danger-action" onClick={() => {
                  setActionMenuOpen(false);
                  setDeleteOpen(true);
                }}>Удалить карточку</button>
              </div>
            )}
          </div>
        </header>

        <div className="evidence-scroll">
          <div className="case-heading">
            <span className={`case-badge ${selected.status}`}>
              <i /> {statusLabel[selected.status]}
            </span>
            <h2>{selected.event.title}</h2>
            <p>{selected.reason}</p>
          </div>

          <section className="result-card">
            <div className="result-card-header">
              <div>
                <span className="eyebrow">Предложенное событие</span>
                <strong>{selected.event.subject}</strong>
              </div>
              <div className="confidence">
                <span>уверенность</span>
                <strong>{selected.event.confidence}%</strong>
              </div>
            </div>
            <div className="event-grid">
              <div><span className="field-icon">◷</span><small>Дата</small><strong>{humanDate(selected.event.date)}</strong></div>
              <div><span className="field-icon">◴</span><small>Время</small><strong>{selected.event.time}</strong></div>
              <div><span className="field-icon">⌂</span><small>Аудитория</small><strong>{selected.event.room}</strong></div>
            </div>
          </section>

          <section className="source-section">
            <div className="section-title">
              <div>
                <span className="eyebrow">Цепочка решения</span>
                <h3>Откуда это известно</h3>
              </div>
              <span className="source-total">{sourceCountLabel(selected.sources.length)}</span>
            </div>

            <div className="source-rail">
              {selected.sources.map((source, index) => (
                <article className="source-card" key={source.id}>
                  <div className={`rail-node ${source.role}`}>
                    {sourceIcon[source.kind]}
                  </div>
                  <div className="source-meta">
                    <div>
                      <strong>{source.author}</strong>
                      <span className={`role-pill ${source.role}`}>
                        {source.role === "teacher" ? "преподаватель" : source.role === "group-lead" ? "староста" : "студент"}
                      </span>
                    </div>
                    <time>{source.time}</time>
                  </div>
                  <p>{source.text}</p>
                  <footer>
                    <span>⌁ {source.chat}</span>
                    {index === selected.sources.length - 1 && selected.sources.length > 1 && (
                      <b>новее предыдущего</b>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>

          <section className="activity-section">
            <div className="section-title">
              <div>
                <span className="eyebrow">След дела</span>
                <h3>Журнал решений</h3>
              </div>
              <span className="audit-seal">история сохранена</span>
            </div>
            <div className="activity-ledger">
              {(selected.activity?.length ? selected.activity : [{
                id: `source:${selected.id}`,
                action: "created" as const,
                actor: selected.sources[0]?.author ?? "Система",
                details: { title: selected.event.title },
                createdAt: "Исходное сообщение",
              }]).map((entry) => (
                <article className={`activity-entry ${entry.action}`} key={entry.id}>
                  <span className="activity-mark">{entry.action === "edited" ? "✎" : entry.action === "status_changed" ? "✓" : entry.action === "source_added" ? "⌁" : "＋"}</span>
                  <div>
                    <strong>{activityLabel(entry.action)}</strong>
                    <p>{Object.values(entry.details).slice(0, 2).join(" · ") || "Карточка добавлена в поток группы"}</p>
                  </div>
                  <footer><span>{entry.actor}</span><time>{activityTime(entry.createdAt)}</time></footer>
                </article>
              ))}
            </div>
          </section>
        </div>

        <footer className="decision-bar">
          <div>
            <span className="decision-icon">?</span>
            <p><strong>Проверь решение</strong><small>Изменения попадут в календарь группы</small></p>
          </div>
          <div className="decision-actions">
            <button className="secondary-button" onClick={() => updateStatus("review")} disabled={selected.status === "review" || selected.status === "conflict"}>Вернуть на проверку</button>
            <button className="primary-button" onClick={selected.status === "conflict" ? openEditor : () => updateStatus("confirmed")} disabled={selected.status === "confirmed"}>
              <span>{selected.status === "conflict" ? "✎" : "✓"}</span> {selected.status === "confirmed" ? "Подтверждено" : selected.status === "conflict" ? "Разобрать конфликт" : "Подтвердить"}
            </button>
          </div>
        </footer>
      </section>
      ) : (
        <section className="evidence-panel evidence-empty">
          <div className="empty-state">
            <span>↙</span>
            <strong>Сообщений пока нет</strong>
            <p>Добавь сообщение на сайте или пришли его Telegram-боту.</p>
            <button className="primary-button" onClick={() => setComposerOpen(true)}>＋ Добавить сообщение</button>
          </div>
        </section>
      )}
        </>
      ) : activeNav === "brief" ? (
        <BriefView
          items={items}
          onOpen={openEvent}
          onCopy={() => void copyText(buildGroupBriefText(items), "Сводка группы скопирована")}
        />
      ) : activeNav === "radar" ? (
        <RadarView items={items} onOpen={openEvent} />
      ) : activeNav === "events" ? (
        <EventsView
          items={items}
          onOpen={openEvent}
          onAdd={() => setComposerOpen(true)}
          onCalendar={() => setSettingsOpen(true)}
        />
      ) : (
        <SourcesView items={items} />
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="composer settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="composer-heading">
              <div>
                <span className="eyebrow">Рабочее пространство</span>
                <h2 id="settings-title">{workspaceName}</h2>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Закрыть">×</button>
            </div>
            <div className="settings-status">
              <span className={storageMode === "database" ? "online-dot" : "status-dot review"} />
              <div>
                <strong>{storageMode === "database" ? "Синхронизация включена" : "Локальный режим"}</strong>
                <small>{syncError || (storageMode === "database"
                  ? "События сохраняются в PostgreSQL и на этом устройстве"
                  : "Демо и эксперименты хранятся только в этом браузере")}</small>
              </div>
            </div>
            <p>{workspaceToken ? "Доступ управляется аккаунтами и ролями участников пространства." : "Сейчас открыто публичное демо. Его данные сохраняются только на этом устройстве."}</p>
            <div className="calendar-connect">
              <span className="calendar-connect-icon">□</span>
              <div><strong>Живой календарь группы</strong><small>Только подтверждённые события. Google, Apple и Outlook проверяют эту ленту автоматически.</small></div>
              <button type="button" onClick={() => void copyCalendarFeed()}>Копировать URL</button>
              <a href={calendarToken ? `/api/calendar?token=${encodeURIComponent(calendarToken)}` : "/api/calendar"} download>Скачать .ics</a>
            </div>
            <div className="backup-connect">
              <span className="calendar-connect-icon">⇩</span>
              <div><strong>Резервная копия данных</strong><small>Версионированный JSON содержит карточки, источники и журнал решений, но не содержит секретный workspace-token.</small></div>
              <button type="button" onClick={exportWorkspaceBackup}>Скачать JSON</button>
              <button type="button" onClick={() => backupInputRef.current?.click()}>Импортировать</button>
              {!workspaceToken && <button className="backup-reset" type="button" onClick={resetDemoWorkspace}>Сбросить демо</button>}
              <input
                ref={backupInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void importWorkspaceBackup(event.target.files?.[0])}
              />
            </div>
            <div className="settings-actions">
              <button className="secondary-button" type="button" onClick={() => void retrySync()} disabled={syncing}>{syncing ? "Синхронизация…" : "Повторить синхронизацию"}</button>
              <button className="secondary-button" type="button" onClick={() => void copyWorkspaceLink()}>Копировать ссылку</button>
              <a className="primary-button" href="https://t.me/dekanat_panic_test_bot" target="_blank" rel="noreferrer">Открыть бота ↗</a>
            </div>
          </section>
        </div>
      )}

      {editOpen && editDraft && selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditOpen(false)}>
          <form className="composer edit-dialog" onSubmit={saveEditedEvent} onMouseDown={(event) => event.stopPropagation()}>
            <div className="composer-heading">
              <div>
                <span className="eyebrow">Ручная проверка</span>
                <h2>Исправить событие</h2>
              </div>
              <button type="button" onClick={() => setEditOpen(false)} aria-label="Закрыть">×</button>
            </div>
            <p>Исправления попадут в журнал решений. После сохранения событие нужно подтвердить ещё раз.</p>
            <div className="edit-grid">
              <label className="wide-field"><span>Название</span><input required maxLength={240} value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></label>
              <label className="wide-field"><span>Предмет</span><input required maxLength={160} value={editDraft.subject} onChange={(event) => setEditDraft({ ...editDraft, subject: event.target.value })} /></label>
              <label><span>Дата</span><input required type="date" value={editDraft.date} onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })} /></label>
              <label><span>Время</span><input required type="time" value={editDraft.time} onChange={(event) => setEditDraft({ ...editDraft, time: event.target.value })} /></label>
              <label className="wide-field"><span>Аудитория</span><input required maxLength={120} value={editDraft.room} onChange={(event) => setEditDraft({ ...editDraft, room: event.target.value })} /></label>
            </div>
            <button className="primary-button wide" type="submit">Сохранить исправления <span>→</span></button>
          </form>
        </div>
      )}

      {deleteOpen && selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteOpen(false)}>
          <section className="composer delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="delete-symbol">×</div>
            <span className="eyebrow">Необратимое действие</span>
            <h2 id="delete-title">Удалить «{selected.event.title}»?</h2>
            <p>Карточка и её источники исчезнут из рабочего пространства. Сообщение в Telegram останется.</p>
            <div className="delete-actions">
              <button className="secondary-button" type="button" onClick={() => setDeleteOpen(false)}>Оставить</button>
              <button className="danger-button" type="button" onClick={confirmDeleteEvent}>Удалить карточку</button>
            </div>
          </section>
        </div>
      )}

      {composerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setComposerOpen(false)}>
          <form className="composer" onSubmit={addMessage} onMouseDown={(event) => event.stopPropagation()}>
            <div className="composer-heading">
              <div>
                <span className="eyebrow">Симулятор Telegram</span>
                <h2>Новое сообщение</h2>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} aria-label="Закрыть">×</button>
            </div>
            <p>Вставь сообщение из учебного чата. Приложение попробует найти предмет, дату, время и аудиторию.</p>
            <textarea
              autoFocus
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Например: лабу по программированию перенесли на 18.09 в 16:20, ауд. Б-304"
              rows={5}
            />
            <div className="example-row">
              <button
                type="button"
                onClick={() => setNewMessage("Лабу по программированию перенесли на 18.09 в 16:20, ауд. Б-304")}
              >
                Вставить пример
              </button>
              <span>{storageMode === "database" ? `Сохранится в ${workspaceName}` : "Сохранится локально до восстановления связи"}</span>
            </div>
            <button className="primary-button wide" type="submit" disabled={!newMessage.trim()}>
              Распознать сообщение <span>→</span>
            </button>
          </form>
        </div>
      )}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
