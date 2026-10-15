/*
 * app.js — интерфейс приложения.
 *
 * Архитектура очень простая:
 *   state   — всё, что описывает текущий экран (какой экран, какая дата...);
 *   render() — по state целиком перерисовывает #app (innerHTML);
 *   actions — обработчики нажатий. Каждый меняет state и вызывает render().
 *
 * Кнопки не получают обработчики по отдельности. Вместо этого у кнопки есть
 * атрибут data-action="имя", а один общий обработчик click на #app находит
 * ближайший элемент с data-action и вызывает actions[имя]. Это называется
 * "делегирование событий" — после перерисовки ничего не надо подключать заново.
 *
 * Вся логика расписания (недели, фильтр по датам) — в core.js (объект Core).
 * Данные — в schedule-data.js (window.SCHEDULE_DATA), их создаёт парсер.
 */
(function () {
  'use strict';

  const APP_VERSION = '1.0';
  const DATA = window.SCHEDULE_DATA;
  const C = window.Core;
  const app = document.getElementById('app');

  if (!DATA || !C) {
    app.innerHTML = '<div class="fatal">Не удалось загрузить расписание.<br>Переустановите приложение.</div>';
    return;
  }

  // ---------- Тексты ----------

  const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEK_NAME = { UPPER: 'Верхняя', LOWER: 'Нижняя', BOTH: 'Обе' };
  const WEEK_ARROW = { UPPER: '▲', LOWER: '▼', BOTH: '' };
  // Код типа занятия -> CSS-класс (латиницей) и подпись
  const KIND_CLASS = { 'ЛК': 'lk', 'ПЗ': 'pz', 'КП': 'kp', 'КР': 'kp' };
  const KIND_NAME = DATA.kinds || {};

  // Иконки — встроенный SVG (контур, цвет берётся из текста)
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    warn: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10H5v11h14V10h-2"/>',
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

  /** Экранирование текста перед вставкой в HTML (данные из Excel — это текст, не разметка). */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---------- Настройки (хранятся в localStorage) ----------

  const STORE_KEY = 'rkt.settings.v1';
  const DEFAULTS = {
    group: null,          // название выбранной группы
    weekMode: 'auto',     // 'auto' | 'manual'
    anchor: null,         // { date, type } — своя дата отсчёта; null = из файла
    manualAnchor: null,   // { date, type } — ручной режим
    showFuture: false,    // показывать ещё не начавшиеся пары
    theme: 'system',      // 'system' | 'light' | 'dark'
  };

  // localStorage может быть недоступен (редко, но бывает) — тогда работаем
  // с настройками в памяти, просто они не сохранятся после закрытия.
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { ...DEFAULTS, ...saved };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.settings)); } catch (e) { /* не страшно */ }
  }

  /** Настройки для Core: подставляем якорь из файла, если свой не задан. */
  function coreSettings() {
    const s = state.settings;
    return { ...s, anchor: s.anchor || DATA.meta.weekAnchor };
  }

  // ---------- Состояние ----------

  const state = {
    screen: 'schedule',   // 'schedule' | 'groups' | 'settings' | 'search'
    stack: [],            // история экранов для кнопки "Назад"
    date: C.defaultDate(C.today()),
    followToday: true,    // показан "сегодня" -> при возврате в приложение на следующий день сдвинуться
    settings: loadSettings(),
    groupQuery: '',
    searchQuery: '',
    showWarnings: false,
    slide: '',            // анимация смены дня: 'slide-next' | 'slide-prev'
  };

  const currentGroup = () => DATA.groups.find((g) => g.name === state.settings.group) || null;

  // Сохранённой группы может не оказаться в новом файле — тогда выбираем заново
  if (!currentGroup()) state.screen = 'groups';

  // ---------- Навигация ----------

  function go(screen) {
    state.stack.push(state.screen);
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
  }

  /** Назад. Возвращает true, если было куда (иначе Android закроет приложение). */
  function back() {
    if (!state.stack.length) return false;
    state.screen = state.stack.pop();
    render();
    return true;
  }

  // ---------- Форматирование ----------

  function dayMonth(isoDate) {
    const [, m, d] = isoDate.split('-').map(Number);
    return `${d} ${MONTHS_GEN[m - 1]}`;
  }

  /** "12 – 17 октября" или "28 сентября – 3 октября". */
  function weekRangeText(dates) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first.slice(5, 7) === last.slice(5, 7)) return `${Number(first.slice(8))} – ${dayMonth(last)}`;
    return `${dayMonth(first)} – ${dayMonth(last)}`;
  }

  /** "10:45–12:15" -> [645, 735] (минуты от полуночи). */
  function timeRange(time) {
    const m = time.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return [m[1] * 60 + Number(m[2]), m[3] * 60 + Number(m[4])];
  }

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function minutesText(n) {
    if (n < 60) return `${n} мин`;
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }

  /** Подпись курса по названию группы: "РКТО-302СП-24" -> 3 курс. */
  function courseOf(group) {
    const m = group.name.match(/-(\d)\d{2}/);
    return m ? `${m[1]} курс` : 'Группы';
  }

  function roomText(room) {
    if (!room) return '';
    return /^\d/.test(room) ? `ауд. ${room}` : room;
  }

  // ---------- Экран: расписание ----------

  function renderSchedule() {
    const group = currentGroup();
    const settings = coreSettings();
    const today = C.today();
    const dates = C.weekDates(state.date);
    const { weekType, items } = C.lessonsForDate(group, state.date, settings,
      { showFuture: state.settings.showFuture });
    const manual = state.settings.weekMode === 'manual' && state.settings.manualAnchor;

    // Вкладки дней с точкой "в этот день есть пары"
    const dayTabs = dates.map((d, i) => {
      const has = C.lessonsForDate(group, d, settings).items.length > 0;
      const cls = ['day', d === state.date ? 'selected' : '', d === today ? 'today' : ''].join(' ');
      return `<button class="${cls}" data-action="pickDay" data-date="${d}">
        <span class="dname">${DAY_SHORT[i]}</span>
        <span class="dnum">${Number(d.slice(8))}</span>
        <span class="dot ${has ? 'has' : ''}"></span>
      </button>`;
    }).join('');

    const dayIndex = C.weekday(state.date) - 1;
    const title = `${DAY_FULL[dayIndex]}, ${dayMonth(state.date)}` +
      (state.date === today ? '<span class="tag">сегодня</span>' : '');

    return `
      <div class="top">
        <header class="appbar">
          <button class="group-btn" data-action="openGroups" aria-label="Сменить группу">
            <span class="name">${esc(group.name)}</span>${icon('down')}
          </button>
          <button class="icon-btn" data-action="openSearch" aria-label="Поиск">${icon('search')}</button>
          <button class="icon-btn" data-action="openSettings" aria-label="Настройки">${icon('settings')}</button>
        </header>
        <div class="weekbar">
          <button class="icon-btn" data-action="shiftWeek" data-step="-1" aria-label="Предыдущая неделя">${icon('left')}</button>
          <div class="weekbar-center">
            <div class="week-range">${weekRangeText(dates)}</div>
            <button class="week-chip ${weekType}" data-action="flipWeek" title="Нажмите, чтобы переключить вручную">
              ${WEEK_ARROW[weekType]} ${WEEK_NAME[weekType]} неделя${manual ? '<span class="manual">· вручную</span>' : ''}
            </button>
          </div>
          <button class="icon-btn" data-action="shiftWeek" data-step="1" aria-label="Следующая неделя">${icon('right')}</button>
        </div>
        <nav class="days">${dayTabs}</nav>
      </div>
      <main class="content ${state.slide}" id="dayContent">
        ${installHint()}
        <h2 class="day-title">${title}</h2>
        ${items.length ? renderCards(items, state.date === today) : renderEmptyDay()}
      </main>
      ${state.date !== C.defaultDate(today)
        ? `<button class="fab" data-action="goToday">${icon('today', 'icon-sm')} Сегодня</button>`
        : ''}`;
  }

  // ---------- Веб-версия на iPhone ----------

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad прикидывается Mac
  // Запущено с экрана "Домой" (как приложение), а не во вкладке Safari
  const isStandalone = window.navigator.standalone === true ||
    (!!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const HINT_KEY = 'rkt.installHint.closed';

  function hintClosed() {
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; }
  }

  /** Подсказка "как установить" — только на iPhone/iPad в браузере. */
  function installHint() {
    if (!isIOS || isStandalone || hintClosed()) return '';
    return `<div class="install-hint">
      <b>Установите как приложение:</b> нажмите
      <svg class="icon share" viewBox="0 0 24 24">${ICONS.share}</svg> «Поделиться» в Safari,
      затем <b>«На экран Домой»</b>. Будет работать без интернета.
      <button class="close" data-action="closeHint" aria-label="Скрыть">×</button>
    </div>`;
  }

  function renderEmptyDay() {
    return `<div class="empty">
      <div class="big">☕</div>
      <div class="title">Пар нет</div>
      <div>${state.settings.showFuture ? '' : 'Будущие пары можно показать в настройках'}</div>
    </div>`;
  }

  function renderCards(items, isToday) {
    const now = nowMinutes();
    let nextMarked = false;
    let prevPair = null;
    let html = '';

    for (const { lesson: l, status, labels } of items) {
      // "Окно" между парами: например, после 1-й сразу 3-я
      if (prevPair !== null && l.pair - prevPair > 1) {
        const gaps = [];
        for (let p = prevPair + 1; p < l.pair; p++) gaps.push(p);
        html += `<div class="gap">Окно · ${gaps.join(', ')} пара</div>`;
      }
      prevPair = l.pair;

      // Идёт сейчас / скоро — только для сегодняшнего дня
      let liveChip = '';
      let isNow = false;
      const range = timeRange(l.time);
      if (isToday && range && status === 'active') {
        if (now >= range[0] && now < range[1]) {
          isNow = true;
          liveChip = `<span class="chip now">идёт · ещё ${minutesText(range[1] - now)}</span>`;
        } else if (now < range[0] && !nextMarked) {
          nextMarked = true;
          liveChip = `<span class="chip soon">через ${minutesText(range[0] - now)}</span>`;
        }
      }
      if (isNow) nextMarked = true;

      const [start, end] = l.time.split('–');
      const kindChip = l.kind
        ? `<span class="chip ${KIND_CLASS[l.kind] || ''}">${esc(KIND_NAME[l.kind] || l.kind)}</span>` : '';
      const weekChip = l.week !== 'BOTH'
        ? `<span class="chip ${l.week}">${WEEK_ARROW[l.week]} ${WEEK_NAME[l.week].toLowerCase()}</span>` : '';
      const labelChips = labels.map((t) => `<span class="chip date">${esc(t)}</span>`).join('');

      html += `
        <article class="card ${l.week} ${status === 'future' ? 'future' : ''} ${isNow ? 'now' : ''}">
          <div class="card-time">
            <div class="num">${l.pair}</div>
            <div class="t">${esc(start)}</div>
            <div class="t end">${esc(end || '')}</div>
          </div>
          <div class="card-body">
            <div class="card-tags">${liveChip}${kindChip}${weekChip}${labelChips}</div>
            <div class="subject">${esc(l.subject)}</div>
            <div class="meta">
              ${l.teacher ? `<span>${icon('user', 'icon-sm')}${esc(l.teacher)}</span>` : ''}
              ${l.room ? `<span>${icon('pin', 'icon-sm')}${esc(roomText(l.room))}</span>` : ''}
            </div>
            ${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}
            ${l.warning ? `<div class="warning">${icon('warn', 'icon-sm')}<span>Ошибка в файле расписания: ${esc(l.warning)}</span></div>` : ''}
          </div>
        </article>`;
    }
    return html;
  }

  // ---------- Экран: выбор группы ----------

  function renderGroups() {
    const canBack = state.stack.length > 0;
    return `
      <div class="top">
        <header class="appbar">
          ${canBack ? `<button class="icon-btn" data-action="back" aria-label="Назад">${icon('back')}</button>` : ''}
          <h1>${canBack ? 'Сменить группу' : 'Выберите группу'}</h1>
        </header>
        <div class="search-box">
          <input type="search" data-input="groupQuery" value="${esc(state.groupQuery)}"
                 placeholder="Поиск: 302, ИСП311…" autocomplete="off">
        </div>
      </div>
      <div id="groupList">${renderGroupList()}</div>`;
  }

  function renderGroupList() {
    const groups = C.filterGroups(DATA.groups, state.groupQuery);
    if (!groups.length) return '<div class="empty"><div class="title">Ничего не найдено</div></div>';

    // Группируем по курсам, курсы по возрастанию
    const byCourse = new Map();
    [...groups].sort((a, b) => a.name.localeCompare(b.name, 'ru')).forEach((g) => {
      const c = courseOf(g);
      if (!byCourse.has(c)) byCourse.set(c, []);
      byCourse.get(c).push(g);
    });
    const courses = [...byCourse.keys()].sort();

    return courses.map((c) => `
      <div class="section-title">${esc(c)}</div>
      <div class="list">
        ${byCourse.get(c).map((g) => `
          <button class="row" data-action="chooseGroup" data-name="${esc(g.name)}">
            <div class="grow">
              <div class="title">${esc(g.name)}</div>
              ${g.alias ? `<div class="sub">${esc(g.alias)}</div>` : ''}
            </div>
            ${g.name === state.settings.group ? `<span class="check">${icon('check')}</span>` : ''}
          </button>`).join('')}
      </div>`).join('') + '<div style="height:24px"></div>';
  }

  // ---------- Экран: поиск ----------

  function renderSearch() {
    return `
      <div class="top">
        <header class="appbar">
          <button class="icon-btn" data-action="back" aria-label="Назад">${icon('back')}</button>
          <h1>Поиск</h1>
        </header>
        <div class="search-box">
          <input type="search" data-input="searchQuery" value="${esc(state.searchQuery)}"
                 placeholder="Предмет, преподаватель, аудитория" autocomplete="off">
        </div>
      </div>
      <div id="searchResults">${renderSearchResults()}</div>`;
  }

  function renderSearchResults() {
    const q = state.searchQuery.trim();
    if (!q) {
      return '<p class="hint">Ищет по всему семестру выбранной группы. Нажмите на пару, чтобы открыть ближайший день, когда она будет.</p>';
    }
    const found = C.searchLessons(currentGroup(), q);
    if (!found.length) return '<div class="empty"><div class="title">Ничего не найдено</div></div>';

    const from = C.today();
    const settings = coreSettings();
    const rows = found.map((l) => {
      const next = C.nextOccurrence(l, from, settings);
      const weekChip = l.week !== 'BOTH'
        ? `<span class="chip ${l.week}">${WEEK_ARROW[l.week]} ${WEEK_NAME[l.week].toLowerCase()}</span>` : '';
      const kind = l.kind ? `<span class="chip ${KIND_CLASS[l.kind] || ''}">${esc(KIND_NAME[l.kind] || l.kind)}</span>` : '';
      const period = l.dates
        ? `только ${l.dates.map(C.formatShort).join(', ')}`
        : [l.startDate && `с ${C.formatShort(l.startDate)}`, l.endDate && `по ${C.formatShort(l.endDate)}`].filter(Boolean).join(' ');
      return `
        <button class="row ${next ? '' : 'gone'}" ${next ? `data-action="openDate" data-date="${next}"` : ''}>
          <div class="grow">
            <div class="result-when">${DAY_SHORT[l.day - 1]} · ${l.pair} пара · ${esc(l.time)} ${weekChip}${kind}</div>
            <div class="title">${esc(l.subject)}</div>
            <div class="sub">${esc([l.teacher, roomText(l.room)].filter(Boolean).join(' · '))}</div>
            ${period ? `<div class="sub">${esc(period)}</div>` : ''}
            <div class="sub">${next ? `Ближайшая: ${DAY_SHORT[C.weekday(next) - 1]}, ${dayMonth(next)}` : 'Больше не будет'}</div>
          </div>
        </button>`;
    }).join('');
    return `<div class="section-title">Найдено: ${found.length}</div><div class="list">${rows}</div><div style="height:24px"></div>`;
  }

  // ---------- Экран: настройки ----------

  function segmented(action, options, current) {
    return `<div class="segmented">${options.map(([value, label]) =>
      `<button class="${value === current ? 'on' : ''}" data-action="${action}" data-value="${value}">${label}</button>`
    ).join('')}</div>`;
  }

  function renderSettings() {
    const s = state.settings;
    const settings = coreSettings();
    const todayType = C.weekTypeForSettings(C.today(), settings);
    const fileAnchor = DATA.meta.weekAnchor;
    const anchor = settings.anchor;

    const weekRows = s.weekMode === 'auto' ? `
      <div class="row">
        <div class="grow"><div class="title">Дата отсчёта</div><div class="sub">любой день известной недели</div></div>
        <input type="date" data-change="anchorDate" value="${anchor.date}">
      </div>
      <div class="row">
        <div class="grow"><div class="title">Эта неделя —</div></div>
        ${segmented('setAnchorType', [['UPPER', '▲ Верхняя'], ['LOWER', '▼ Нижняя']], anchor.type)}
      </div>` : `
      <div class="row">
        <div class="grow"><div class="title">Текущая неделя</div><div class="sub">дальше недели чередуются</div></div>
        ${segmented('setManualType', [['UPPER', '▲ Верхняя'], ['LOWER', '▼ Нижняя']], todayType)}
      </div>`;

    const warnings = [];
    if (state.showWarnings) {
      for (const g of DATA.groups) {
        for (const l of g.lessons) {
          if (l.warning) warnings.push(`<div class="row"><div class="grow"><div class="title">${esc(g.name)} · ${DAY_SHORT[l.day - 1]}, ${l.pair} пара</div><div class="sub">${esc(l.subject)}: ${esc(l.warning)}</div></div></div>`);
        }
      }
    }

    return `
      <div class="top">
        <header class="appbar">
          <button class="icon-btn" data-action="back" aria-label="Назад">${icon('back')}</button>
          <h1>Настройки</h1>
        </header>
      </div>

      <div class="section-title">Группа</div>
      <div class="list">
        <button class="row" data-action="openGroups">
          <div class="grow"><div class="title">${esc(s.group || 'не выбрана')}</div></div>
          <span class="value">Сменить</span>
        </button>
      </div>

      <div class="section-title">Верхняя / нижняя неделя</div>
      <div class="list">
        <div class="row">
          <div class="grow"><div class="title">Определять</div></div>
          ${segmented('setWeekMode', [['auto', 'По дате'], ['manual', 'Вручную']], s.weekMode)}
        </div>
        ${weekRows}
      </div>
      <p class="hint">Сейчас: <b>${WEEK_NAME[todayType].toLowerCase()} неделя</b>.
        По файлу расписания неделя ${C.formatFull(fileAnchor.date)} — ${WEEK_NAME[fileAnchor.type].toLowerCase()}.</p>
      ${s.weekMode === 'auto' && s.anchor ? '<button class="btn" data-action="resetAnchor">Вернуть дату из файла</button>' : ''}

      <div class="section-title">Отображение</div>
      <div class="list">
        <label class="row">
          <div class="grow"><div class="title">Показывать будущие пары</div><div class="sub">те, что начнутся позже, — серым, с датой начала</div></div>
          <span class="switch"><input type="checkbox" data-change="showFuture" ${s.showFuture ? 'checked' : ''}><span class="track"></span></span>
        </label>
        <div class="row">
          <div class="grow"><div class="title">Тема</div></div>
          ${segmented('setTheme', [['system', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']], s.theme)}
        </div>
      </div>

      <div class="section-title">Данные</div>
      <div class="list">
        <div class="row"><div class="grow"><div class="title">Файл</div><div class="sub">${esc(DATA.meta.source)}</div></div></div>
        <div class="row"><div class="grow"><div class="title">Загружено</div><div class="sub">${esc(DATA.meta.generatedAt)}</div></div></div>
        <button class="row" data-action="toggleWarnings">
          <div class="grow"><div class="title">Ошибки в файле</div><div class="sub">${DATA.meta.warningsCount ? 'Нажмите, чтобы посмотреть' : 'Не найдено'}</div></div>
          <span class="value">${DATA.meta.warningsCount}</span>
        </button>
        ${warnings.join('')}
      </div>
      <button class="btn" data-action="reload">Обновить расписание</button>
      <p class="hint">${location.protocol === 'file:'
        ? 'Расписание встроено в приложение. Когда колледж выпустит новое — нужна новая версия приложения.'
        : 'Расписание сохранено на устройстве и работает без интернета. Новая версия скачивается сама, когда есть интернет.'}</p>
      <p class="hint" style="margin-bottom:32px">Версия ${APP_VERSION}</p>`;
  }

  // ---------- Отрисовка ----------

  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let lastBars = '';

  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;

    const dark = t === 'dark' || (t === 'system' && !!systemDark && systemDark.matches);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const key = bg + dark;
    if (key === lastBars) return;
    lastBars = key;
    // В Android красим строку состояния в цвет фона (см. MainActivity.Bridge)
    if (window.AndroidBridge) window.AndroidBridge.setBars(bg, dark);
    // В браузерах — цвет панели браузера (theme-color) под выбранную тему
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  }

  // Система сменила тему (например, вечером) — перерисоваться
  if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', () => render());

  function render() {
    applyTheme();
    const screens = { schedule: renderSchedule, groups: renderGroups, search: renderSearch, settings: renderSettings };
    if (state.screen === 'schedule' && !currentGroup()) state.screen = 'groups';
    app.innerHTML = screens[state.screen]();
    state.slide = '';
  }

  /** Перерисовать только список под полем поиска — чтобы поле не теряло фокус. */
  function renderListOnly() {
    if (state.screen === 'groups') document.getElementById('groupList').innerHTML = renderGroupList();
    if (state.screen === 'search') document.getElementById('searchResults').innerHTML = renderSearchResults();
  }

  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ---------- Действия ----------

  /** Сдвинуть выбранный день, перепрыгивая воскресенье. */
  function shiftDay(step) {
    let d = C.addDays(state.date, step);
    if (C.weekday(d) === 7) d = C.addDays(d, step);
    state.slide = step > 0 ? 'slide-next' : 'slide-prev';
    setDate(d);
    render();
  }

  /** Сменить показанный день и запомнить, "сегодняшний" ли он. */
  function setDate(d) {
    state.date = d;
    state.followToday = d === C.defaultDate(C.today());
  }

  function update(changes) {
    Object.assign(state.settings, changes);
    saveSettings();
    render();
  }

  const actions = {
    back,
    openGroups: () => { state.groupQuery = ''; go('groups'); },
    openSearch: () => go('search'),
    openSettings: () => { state.showWarnings = false; go('settings'); },

    chooseGroup: (el) => {
      state.settings.group = el.dataset.name;
      saveSettings();
      // Первый запуск: экрана "назад" нет — просто показываем расписание
      state.stack = [];
      state.screen = 'schedule';
      setDate(C.defaultDate(C.today()));
      render();
      window.scrollTo(0, 0);
    },

    pickDay: (el) => {
      const d = el.dataset.date;
      if (d === state.date) return;
      state.slide = d > state.date ? 'slide-next' : 'slide-prev';
      setDate(d);
      render();
    },
    shiftWeek: (el) => shiftDay(7 * Number(el.dataset.step)),
    goToday: () => {
      const d = C.defaultDate(C.today());
      state.slide = d > state.date ? 'slide-next' : 'slide-prev';
      setDate(d);
      render();
      window.scrollTo(0, 0);
    },
    openDate: (el) => {
      setDate(el.dataset.date);
      state.stack = [];
      state.screen = 'schedule';
      render();
      window.scrollTo(0, 0);
    },

    // Нажатие на "Верхняя неделя" на главном экране: переключить вручную
    flipWeek: () => {
      const current = C.weekTypeForSettings(state.date, coreSettings());
      update({ weekMode: 'manual', manualAnchor: C.makeManualAnchor(state.date, C.oppositeWeek(current)) });
      toast('Неделя переключена вручную. Вернуть автоматический режим — в настройках.');
    },

    setWeekMode: (el) => {
      const mode = el.dataset.value;
      // При переходе в ручной режим начинаем с того, что сейчас показывает автоматика
      const changes = { weekMode: mode };
      if (mode === 'manual' && !state.settings.manualAnchor) {
        const t = C.weekTypeForSettings(C.today(), { ...coreSettings(), weekMode: 'auto' });
        changes.manualAnchor = C.makeManualAnchor(C.today(), t);
      }
      update(changes);
    },
    setManualType: (el) => update({ manualAnchor: C.makeManualAnchor(C.today(), el.dataset.value) }),
    setAnchorType: (el) => update({ anchor: { date: coreSettings().anchor.date, type: el.dataset.value } }),
    resetAnchor: () => update({ anchor: null }),
    setTheme: (el) => update({ theme: el.dataset.value }),
    toggleWarnings: () => { state.showWarnings = !state.showWarnings; render(); },
    reload: () => location.reload(),
    closeHint: () => {
      try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* покажется снова — не страшно */ }
      render();
    },
  };

  // Изменения полей ввода (data-change): дата, переключатели
  const changes = {
    anchorDate: (el) => {
      if (!el.value) return;
      update({ anchor: { date: el.value, type: coreSettings().anchor.type } });
    },
    showFuture: (el) => update({ showFuture: el.checked }),
  };

  // ---------- Подключение событий (один раз) ----------

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  app.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
  });

  app.addEventListener('input', (e) => {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    state[el.dataset.input] = el.value;
    renderListOnly();
  });

  // Свайп влево/вправо по расписанию — следующий/предыдущий день
  let touch = null;
  app.addEventListener('touchstart', (e) => {
    if (state.screen !== 'schedule' || e.touches.length !== 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    // Горизонтальный жест заметной длины, не прокрутка
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftDay(dx < 0 ? 1 : -1);
  }, { passive: true });

  // Раз в минуту обновляем "идёт · ещё N мин", если смотрим сегодняшний день
  setInterval(() => {
    if (state.screen === 'schedule' && state.date === C.today()) render();
  }, 60 * 1000);

  // ---------- Работа без интернета (только веб-версия) ----------

  /**
   * Service worker (sw.js) сохраняет приложение на телефоне. Он работает
   * только по https:// (или на localhost для проверки). В APK страница
   * открывается как file:// — там он не нужен и не регистрируется.
   */
  function registerServiceWorker() {
    const secure = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!secure || !('serviceWorker' in navigator)) return;

    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    // Новая версия sw.js взяла управление -> перезагрузиться на свежие файлы.
    // При самой первой установке контроллера не было — перезагружать незачем.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      try { sessionStorage.setItem('rkt.updated', '1'); } catch (e) { /* без сообщения */ }
      location.reload();
    });

    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Приложение на iPhone может неделями "спать" в фоне без перезапуска —
      // при каждом возврате проверяем, не вышло ли обновление
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => { /* нет сети при первом запуске и т.п. — сработает в следующий раз */ });
  }

  // Вернулись в приложение на следующий день — показать новый "сегодня"
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.followToday) return;
    const d = C.defaultDate(C.today());
    if (d !== state.date) {
      state.date = d;
      if (state.screen === 'schedule') render();
    }
  });

  // Для Android: системная кнопка "Назад" вызывает App.back()
  window.App = { back };

  render();
  registerServiceWorker();

  try {
    if (sessionStorage.getItem('rkt.updated')) {
      sessionStorage.removeItem('rkt.updated');
      toast('Расписание обновлено');
    }
  } catch (e) { /* нет sessionStorage — без сообщения */ }
})();
