"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { buildCalendarEvent, calendarFilename } from "@/lib/calendar";
import { demoItems } from "@/lib/demo-data";
import { extractEvent } from "@/lib/extract-event";
import type { ExtractedEvent, InboxItem, ReviewStatus, SourceKind, SourceRole } from "@/lib/types";

const navItems = [
  { id: "inbox", icon: "↙", label: "Входящие" },
  { id: "events", icon: "□", label: "События" },
  { id: "sources", icon: "⌁", label: "Источники" },
] as const;

type NavId = (typeof navItems)[number]["id"];
type Theme = "light" | "dark";
type StorageMode = "checking" | "local" | "database";
type InboxFilter = "all" | "attention";
type EditableEvent = Pick<ExtractedEvent, "title" | "subject" | "date" | "time" | "room">;

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
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item, workspace }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function pushStatusToServer(id: string, status: ReviewStatus, workspace: string) {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, workspace }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function pushEventEditToServer(id: string, event: EditableEvent, workspace: string) {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, workspace }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteEventFromServer(id: string, workspace: string) {
  try {
    const suffix = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
    const response = await fetch(`/api/events/${encodeURIComponent(id)}${suffix}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
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
}: {
  items: InboxItem[];
  onOpen: (id: string) => void;
  onAdd: () => void;
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
        <button className="primary-button" onClick={onAdd}>＋ Добавить сообщение</button>
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

export function EvidenceDesk() {
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
  const [workspaceToken, setWorkspaceToken] = useState("");
  const [workspaceName, setWorkspaceName] = useState("ИВТ-101 · демо");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentTheme = document.documentElement.dataset.theme;
      setTheme(currentTheme === "dark" ? "dark" : "light");
      setWorkspaceToken(new URLSearchParams(window.location.search).get("workspace")?.trim() || "");
      setWorkspaceReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

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
      ? `/api/events?workspace=${encodeURIComponent(workspaceToken)}`
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

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const navCounts: Record<NavId, number> = {
    inbox: items.length,
    events: items.length,
    sources: items.reduce((total, item) => total + item.sources.length, 0),
  };

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("dbp:theme", nextTheme);
    setTheme(nextTheme);
  }

  function openEvent(id: string) {
    setSelectedId(id);
    setActiveNav("inbox");
  }

  function updateStatus(status: ReviewStatus) {
    if (!selected) return;
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
      if (synced) {
        setStorageMode("database");
        setSyncError(null);
      } else {
        setSyncError("Изменение сохранено локально и ждёт синхронизации");
      }
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
        await navigator.share({ title: selected.event.title, text, url: window.location.href });
        flash("Карточка отправлена");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyText(`${text}\n${window.location.href}`, "Карточка скопирована");
  }

  function addSimilarMessage() {
    if (!selected) return;
    setNewMessage(selected.sources[0]?.text ?? "");
    setActionMenuOpen(false);
    setComposerOpen(true);
  }

  async function copyWorkspaceLink() {
    await copyText(window.location.href, "Ссылка на рабочее пространство скопирована");
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
      if (synced) {
        setStorageMode("database");
        setSyncError(null);
      } else {
        setSyncError("Исправления сохранены локально и ждут синхронизации");
      }
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
    setItems((current) => current.filter((item) => item.id !== deletingId));
    setDeleteOpen(false);
    setActionMenuOpen(false);
    void deleteEventFromServer(deletingId, workspaceToken).then((synced) => {
      if (!synced) setSyncError("Удаление сохранено локально, но сервер пока недоступен");
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

    setItems((current) => {
      const next = [item, ...current];
      saveWorkspace(next, workspaceToken);
      return next;
    });
    setSelectedId(id);
    setNewMessage("");
    setComposerOpen(false);
    void pushEventToServer(item, workspaceToken).then((synced) => {
      if (synced) {
        setStorageMode("database");
        setSyncError(null);
      } else {
        setSyncError("Новое событие сохранено локально и ждёт синхронизации");
      }
    });
    flash("Сообщение распознано");
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
            <strong>деканат</strong>
            <small>без паники</small>
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

        <div className={syncError ? "sync-card error" : "sync-card"}>
          <span className="sync-pulse" />
          <div>
            <strong>
              {syncError
                ? "Нужна синхронизация"
                : storageMode === "database"
                ? "PostgreSQL подключён"
                : storageMode === "checking"
                  ? "Проверяю хранилище"
                  : "Локальное хранение"}
            </strong>
            <small>
              {syncError
                ? syncError
                : storageMode === "database"
                ? "события синхронизируются"
                : "работает без внешних ключей"}
            </small>
          </div>
        </div>
      </aside>

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
                setSelectedId(item.id);
                setActionMenuOpen(false);
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
                  <span className="activity-mark">{entry.action === "edited" ? "✎" : entry.action === "status_changed" ? "✓" : "＋"}</span>
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
            <button className="secondary-button" onClick={() => updateStatus("review")} disabled={selected.status === "review"}>Вернуть на проверку</button>
            <button className="primary-button" onClick={() => updateStatus("confirmed")} disabled={selected.status === "confirmed"}>
              <span>✓</span> {selected.status === "confirmed" ? "Подтверждено" : "Подтвердить"}
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
      ) : activeNav === "events" ? (
        <EventsView
          items={items}
          onOpen={openEvent}
          onAdd={() => setComposerOpen(true)}
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
              <div><strong>{storageMode === "database" ? "Синхронизация включена" : "Локальный режим"}</strong><small>{syncError || "События сохраняются в PostgreSQL и на этом устройстве"}</small></div>
            </div>
            <p>{workspaceToken ? "Эта ссылка даёт доступ к событиям Telegram-группы. Передавай её только участникам группы." : "Сейчас открыто публичное демо. Персональная рабочая ссылка появится после сообщения Telegram-боту."}</p>
            <div className="settings-actions">
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
