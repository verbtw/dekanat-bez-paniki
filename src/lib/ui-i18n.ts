export type UiLocale = "ru" | "en";

const englishByRussian: Record<string, string> = {
  "Рабочее пространство": "Workspace",
  "Основная навигация": "Main navigation",
  "Входящие": "Inbox",
  "Сводка": "Brief",
  "Сводка группы": "Group brief",
  "Радар": "Radar",
  "События": "Events",
  "Источники": "Sources",
  "источник": "source",
  "источника": "sources",
  "сообщение": "message",
  "сообщения": "messages",
  "сообщений": "messages",
  "демо-режим": "demo mode",
  "Настройки группы": "Group settings",
  "Тёмная тема": "Dark theme",
  "Светлая тема": "Light theme",
  "переключить оформление": "switch appearance",
  "Включить тёмную тему": "Turn on dark theme",
  "Включить светлую тему": "Turn on light theme",
  "Язык интерфейса": "Interface language",
  "Проверить синхронизацию": "Check sync",
  "Повторить синхронизацию": "Retry sync",
  "Синхронизирую": "Syncing",
  "Нужна синхронизация": "Sync needed",
  "Проверяю хранилище": "Checking storage",
  "Локальное хранение": "Local storage",
  "события синхронизируются": "events stay in sync",
  "работает без внешних ключей": "works without external keys",
  "Поток группы": "Group stream",
  "Добавить": "Add",
  "Добавить сообщение": "Add message",
  "Поиск по сообщениям": "Search messages",
  "Все": "All",
  "На проверку": "Needs review",
  "Есть конфликт": "Conflict",
  "Проверить": "Review",
  "Подтверждено": "Confirmed",
  "Ничего не нашли": "Nothing found",
  "Измени запрос или добавь новое сообщение.": "Try another search or add a new message.",
  "Поделиться": "Share",
  "Больше действий": "More actions",
  "Исправить поля": "Edit fields",
  "Добавить в календарь": "Add to calendar",
  "Копировать карточку": "Copy card",
  "Добавить похожее": "Add a similar message",
  "Удалить карточку": "Delete card",
  "Предложенное событие": "Suggested event",
  "уверенность": "confidence",
  "Дата": "Date",
  "Время": "Time",
  "Аудитория": "Room",
  "Предмет": "Subject",
  "Цепочка решения": "Decision trail",
  "Откуда это известно": "How we know",
  "преподаватель": "teacher",
  "староста": "group lead",
  "студент": "student",
  "новее предыдущего": "newer than previous",
  "След дела": "Case trail",
  "Журнал решений": "Decision log",
  "история сохранена": "history saved",
  "Событие создано": "Event created",
  "Поля исправлены": "Fields corrected",
  "Статус изменён": "Status changed",
  "Добавлен источник": "Source added",
  "Карточка добавлена в поток группы": "Card added to the group stream",
  "Исходное сообщение": "Original message",
  "Проверь решение": "Review the decision",
  "Изменения попадут в календарь группы": "Changes will appear in the group calendar",
  "Вернуть на проверку": "Return to review",
  "Разобрать конфликт": "Resolve conflict",
  "Подтвердить": "Confirm",
  "Сообщений пока нет": "No messages yet",
  "Добавь сообщение на сайте или пришли его Telegram-боту.": "Add a message here or send it to the Telegram bot.",
  "Календарь группы": "Group calendar",
  "Все подтверждённые и ожидающие проверки изменения в одном месте.": "Confirmed changes and items awaiting review, all in one place.",
  "Подключить календарь": "Connect calendar",
  "Всего": "Total",
  "события в потоке": "events in stream",
  "готово для календаря": "ready for calendar",
  "Требуют внимания": "Needs attention",
  "нужна проверка человеком": "human review required",
  "Ближайшие изменения": "Upcoming changes",
  "источник сохранён": "source preserved",
  "Событий пока нет": "No events yet",
  "Добавь сообщение или отправь его Telegram-боту.": "Add a message or send it to the Telegram bot.",
  "Без даты": "No date",
  "Карта доверия": "Trust map",
  "Видно, кто сообщил факт и почему система считает его надёжным.": "See who reported each fact and why the system trusts it.",
  "Все источники доступны": "All sources available",
  "Правило приоритета": "Priority rule",
  "Не все сообщения весят одинаково": "Not every message carries equal weight",
  "Новая информация преподавателя имеет больший вес, но исходное сообщение никогда не удаляется из цепочки.": "Newer teacher updates carry more weight, while the original message always stays in the trail.",
  "Преподаватель": "Teacher",
  "Староста": "Group lead",
  "Студент": "Student",
  "высокий приоритет": "high priority",
  "средний приоритет": "medium priority",
  "нужно подтверждение": "confirmation needed",
  "Последняя активность": "Latest activity",
  "Источников пока нет": "No sources yet",
  "Первое распознанное сообщение появится здесь.": "The first recognized message will appear here.",
  "Оперативная картина": "At a glance",
  "Короткий ответ на три вопроса: что сегодня, что дальше и где требуется решение.": "A quick answer to what is today, what comes next, and what needs a decision.",
  "Копировать сводку ↗": "Copy brief ↗",
  "Сейчас в фокусе": "In focus now",
  "План свободен": "Schedule is clear",
  "Ближайших событий пока нет.": "No upcoming events yet.",
  "Сегодня": "Today",
  "Дальше": "Next",
  "Решить": "Resolve",
  "Готово": "Done",
  "событий в плане": "events scheduled",
  "ближайших карточек": "upcoming cards",
  "активных конфликтов": "active conflicts",
  "подтверждено": "confirmed",
  "Следующие шаги": "Next steps",
  "Ближайшие события": "Upcoming events",
  "Пока спокойно": "All quiet for now",
  "Новые события появятся в сводке автоматически.": "New events will appear in the brief automatically.",
  "Не пропустить": "Do not miss",
  "Приоритет": "Priority",
  "Срочных решений нет": "No urgent decisions",
  "Радар не видит противоречий.": "Radar sees no conflicts.",
  "Telegram-команды": "Telegram commands",
  "Контроль расхождений": "Conflict control",
  "Система сравнивает новые сообщения с историей группы и показывает, где факты не сходятся.": "The system compares new messages with group history and highlights mismatched facts.",
  "расхождений нет": "no conflicts",
  "активных сигналов": "active signals",
  "конфликт": "conflict",
  "проверка": "review",
  "Полнота данных": "Data completeness",
  "заполнены ключевые поля": "key fields completed",
  "Доверие источников": "Source trust",
  "с учётом ролей авторов": "weighted by author role",
  "Ждут проверки": "Awaiting review",
  "можно подтвердить вручную": "can be confirmed manually",
  "Очередь решений": "Decision queue",
  "Что проверить сейчас": "What to review now",
  "Очередь чиста": "Queue is clear",
  "Новые противоречия появятся здесь автоматически.": "New conflicts will appear here automatically.",
  "Качество извлечения": "Extraction quality",
  "Пробелы в данных": "Missing data",
  "Закрыть": "Close",
  "Синхронизация включена": "Sync enabled",
  "Локальный режим": "Local mode",
  "События сохраняются в PostgreSQL и на этом устройстве": "Events are saved to PostgreSQL and this device",
  "Демо и эксперименты хранятся только в этом браузере": "Demo data and experiments are stored only in this browser",
  "Эта ссылка даёт доступ к событиям Telegram-группы. Передавай её только участникам группы.": "This link gives access to the Telegram group's events. Share it only with group members.",
  "Сейчас открыто публичное демо. Персональная рабочая ссылка появится после сообщения Telegram-боту.": "You are viewing the public demo. A private workspace link appears after messaging the Telegram bot.",
  "Живой календарь группы": "Live group calendar",
  "Только подтверждённые события. Google, Apple и Outlook проверяют эту ленту автоматически.": "Confirmed events only. Google, Apple, and Outlook refresh this feed automatically.",
  "Копировать URL": "Copy URL",
  "Скачать .ics": "Download .ics",
  "Резервная копия данных": "Data backup",
  "Версионированный JSON содержит карточки, источники и журнал решений, но не содержит секретный workspace-token.": "The versioned JSON contains cards, sources, and the decision log, but never the secret workspace token.",
  "Скачать JSON": "Download JSON",
  "Импортировать": "Import",
  "Сбросить демо": "Reset demo",
  "Копировать ссылку": "Copy link",
  "Открыть бота ↗": "Open bot ↗",
  "Ручная проверка": "Manual review",
  "Исправить событие": "Edit event",
  "Исправления попадут в журнал решений. После сохранения событие нужно подтвердить ещё раз.": "Corrections enter the decision log. After saving, the event must be confirmed again.",
  "Название": "Title",
  "Сохранить исправления": "Save corrections",
  "Необратимое действие": "Irreversible action",
  "Карточка и её источники исчезнут из рабочего пространства. Сообщение в Telegram останется.": "The card and its sources will be removed from the workspace. The Telegram message will remain.",
  "Оставить": "Keep it",
  "Симулятор Telegram": "Telegram simulator",
  "Новое сообщение": "New message",
  "Вставь сообщение из учебного чата. Приложение попробует найти предмет, дату, время и аудиторию.": "Paste a message from your study chat. The app will try to find the subject, date, time, and room.",
  "Установить Morrow": "Install Morrow",
  "Установить приложение": "Install app",
  "Отдельное окно, иконка и быстрый запуск с рабочего стола.": "A dedicated window, app icon, and quick launch from your desktop.",
  "Установить": "Install",
  "Скрыть предложение установки": "Dismiss install suggestion",
};

const russianByEnglish = Object.fromEntries(
  Object.entries(englishByRussian).map(([russian, english]) => [english, russian]),
);

const russianMonths: Record<string, string> = {
  января: "January", февраля: "February", марта: "March", апреля: "April",
  мая: "May", июня: "June", июля: "July", августа: "August",
  сентября: "September", октября: "October", ноября: "November", декабря: "December",
  январь: "January", февраль: "February", март: "March", апрель: "April",
  май: "May", июнь: "June", июль: "July", август: "August",
  сентябрь: "September", октябрь: "October", ноябрь: "November", декабрь: "December",
};

export function translateUiText(value: string, locale: UiLocale) {
  const surrounding = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!surrounding) return value;
  const [, before, core, after] = surrounding;
  const dictionary = locale === "en" ? englishByRussian : russianByEnglish;
  let translated = dictionary[core] ?? core;

  if (locale === "en") {
    translated = translated
      .replace(/1 источник/g, "1 source")
      .replace(/(\d+) источника/g, "$1 sources")
      .replace(/1 сообщение/g, "1 message")
      .replace(/(\d+) сообщени(?:е|я|й)/g, "$1 messages")
      .replace(/(\d+) авторов/g, "$1 authors")
      .replace(/(\d+) требуют решения/g, "$1 need a decision");
    for (const [russian, english] of Object.entries(russianMonths)) {
      translated = translated.replace(new RegExp(russian, "gi"), english);
    }
  } else {
    for (const [russian, english] of Object.entries(russianMonths)) {
      translated = translated.replace(new RegExp(english, "gi"), russian);
    }
    translated = translated
      .replace(/1 source/g, "1 источник")
      .replace(/(\d+) sources/g, "$1 источника")
      .replace(/1 message/g, "1 сообщение")
      .replace(/(\d+) messages/g, "$1 сообщения")
      .replace(/(\d+) authors/g, "$1 авторов")
      .replace(/(\d+) need a decision/g, "$1 требуют решения");
  }

  return `${before}${translated}${after}`;
}

export function localizeInterface(root: HTMLElement, locale: UiLocale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const next = walker.nextNode();
    const value = node.nodeValue ?? "";
    const translated = translateUiText(value, locale);
    if (translated !== value) node.nodeValue = translated;
    node = next;
  }

  root.querySelectorAll<HTMLElement>("[aria-label], [placeholder], [title]").forEach((element) => {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const translated = translateUiText(value, locale);
      if (translated !== value) element.setAttribute(attribute, translated);
    }
  });
}
