"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoItems } from "@/lib/demo-data";
import { extractEvent } from "@/lib/extract-event";
import type { InboxItem, ReviewStatus, SourceKind, SourceRole } from "@/lib/types";

const navItems = [
  { id: "inbox", icon: "↙", label: "Входящие" },
  { id: "events", icon: "□", label: "События" },
  { id: "sources", icon: "⌁", label: "Источники" },
] as const;

type NavId = (typeof navItems)[number]["id"];
type Theme = "light" | "dark";
type StorageMode = "checking" | "local" | "database";

const workspaceStorageKey = "dbp:workspace:v1";
const roleLabel: Record<SourceRole, string> = {
  teacher: "преподаватель",
  "group-lead": "староста",
  student: "студент",
};

function saveWorkspace(items: InboxItem[]) {
  window.localStorage.setItem(
    workspaceStorageKey,
    JSON.stringify({ version: 1, items }),
  );
}

async function pushEventToServer(item: InboxItem) {
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function pushStatusToServer(id: string, status: ReviewStatus) {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
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
          <div><span className="eyebrow">Сентябрь 2026</span><h2>Ближайшие изменения</h2></div>
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [storageReady, setStorageReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("checking");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentTheme = document.documentElement.dataset.theme;
      setTheme(currentTheme === "dark" ? "dark" : "light");

      try {
        const saved = window.localStorage.getItem(workspaceStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { version?: number; items?: InboxItem[] };
          if (parsed.version === 1 && Array.isArray(parsed.items) && parsed.items.length > 0) {
            setItems(parsed.items);
            setSelectedId(parsed.items[0].id);
          }
        }
      } catch {
        window.localStorage.removeItem(workspaceStorageKey);
      } finally {
        setStorageReady(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({ version: 1, items }),
    );
  }, [items, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();

    fetch("/api/events", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { mode?: StorageMode; items?: InboxItem[] }) => {
        if (data.mode !== "database") {
          setStorageMode("local");
          return;
        }

        setStorageMode("database");
        if (!Array.isArray(data.items) || data.items.length === 0) return;
        setItems((current) => {
          const localOnly = current.filter(
            (local) => !data.items?.some((remote) => remote.id === local.id),
          );
          const merged = [...data.items!, ...localOnly];
          saveWorkspace(merged);
          return merged;
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStorageMode("local");
      });

    return () => controller.abort();
  }, [storageReady]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.event.title, item.event.subject, ...item.sources.map((source) => source.text)]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
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
    setItems((current) => {
      const next = current.map((item) =>
        item.id === selected.id ? { ...item, status } : item,
      );
      saveWorkspace(next);
      return next;
    });
    void pushStatusToServer(selected.id, status).then((synced) => {
      if (synced) setStorageMode("database");
    });
    flash(status === "confirmed" ? "Событие подтверждено" : "Отправлено на уточнение");
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
      saveWorkspace(next);
      return next;
    });
    setSelectedId(id);
    setNewMessage("");
    setComposerOpen(false);
    void pushEventToServer(item).then((synced) => {
      if (synced) setStorageMode("database");
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
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              <span className="nav-count">{navCounts[item.id]}</span>
            </button>
          ))}
        </nav>

        <div className="group-card">
          <div className="group-avatar">ИВ</div>
          <div>
            <strong>ИВТ-101</strong>
            <small><span className="online-dot" /> 24 участника</small>
          </div>
          <button aria-label="Настройки группы">•••</button>
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

        <div className="sync-card">
          <span className="sync-pulse" />
          <div>
            <strong>
              {storageMode === "database"
                ? "PostgreSQL подключён"
                : storageMode === "checking"
                  ? "Проверяю хранилище"
                  : "Локальное хранение"}
            </strong>
            <small>
              {storageMode === "database"
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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по сообщениям"
            aria-label="Поиск по сообщениям"
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className="filter-row">
          <button className="filter active">Все <span>{items.length}</span></button>
          <button className="filter">На проверку <span>{items.filter((item) => item.status !== "confirmed").length}</span></button>
        </div>

        <div className="inbox-list" aria-live="polite">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={selected.id === item.id ? `inbox-item selected ${item.status}` : `inbox-item ${item.status}`}
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

      <section className="evidence-panel">
        <header className="evidence-header">
          <div className="breadcrumb"><span>Входящие</span><b>/</b>{selected.id}</div>
          <div className="header-actions">
            <button aria-label="Поделиться">↗</button>
            <button aria-label="Больше действий">•••</button>
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
        </div>

        <footer className="decision-bar">
          <div>
            <span className="decision-icon">?</span>
            <p><strong>Проверь решение</strong><small>Изменения попадут в календарь группы</small></p>
          </div>
          <div className="decision-actions">
            <button className="secondary-button" onClick={() => updateStatus("review")}>Уточнить</button>
            <button className="primary-button" onClick={() => updateStatus("confirmed")}>
              <span>✓</span> Подтвердить
            </button>
          </div>
        </footer>
      </section>
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
              <span>Данные останутся только в браузере</span>
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
