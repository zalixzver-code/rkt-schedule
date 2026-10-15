/*
 * core.js — логика расписания без интерфейса.
 *
 * Здесь нет ни одного обращения к DOM (document, window), поэтому этот же
 * файл подключается и в приложении (<script src="core.js">), и в Node —
 * в парсере Excel и в автотестах (require('.../core.js')).
 *
 * Даты везде хранятся строками ISO "ГГГГ-ММ-ДД". Почему не объекты Date:
 * - строки удобно сравнивать ("2026-09-07" < "2026-10-26" — работает);
 * - они без часового пояса: Date легко "съезжает" на сутки из-за UTC
 *   и перехода на летнее время, а у пары нет времени суток, только день.
 * Для арифметики (прибавить дни, посчитать недели) дата переводится
 * в "номер дня" — число суток от 01.01.1970.
 */
(function (root, factory) {
  // Универсальный экспорт (UMD): в Node — module.exports, в браузере — window.Core
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- Даты ----------

  const pad2 = (n) => String(n).padStart(2, '0');

  /** Собрать ISO-строку из чисел. */
  function iso(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  /** Существует ли такая дата (отсекает 31.02, 16.16 и т.п.). */
  function isValidDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d <= daysInMonth;
  }

  /** "2026-09-07" -> номер дня с 01.01.1970 (считаем в UTC, без поясов). */
  function toDayNum(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  /** Номер дня -> "ГГГГ-ММ-ДД". */
  function fromDayNum(n) {
    const dt = new Date(n * DAY_MS);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function addDays(isoStr, n) {
    return fromDayNum(toDayNum(isoStr) + n);
  }

  /** День недели: 1 = понедельник … 7 = воскресенье (как в расписании). */
  function weekday(isoStr) {
    // 01.01.1970 был четвергом. (n + 3) % 7 даёт 0 для понедельника.
    return ((toDayNum(isoStr) + 3) % 7 + 7) % 7 + 1;
  }

  /** Понедельник той недели, в которую входит дата. */
  function mondayOf(isoStr) {
    return addDays(isoStr, 1 - weekday(isoStr));
  }

  /** Сколько недель от недели даты A до недели даты B (может быть < 0). */
  function weeksBetween(isoA, isoB) {
    return Math.round((toDayNum(mondayOf(isoB)) - toDayNum(mondayOf(isoA))) / 7);
  }

  /** Сегодняшняя дата по часам телефона (локальное время, не UTC). */
  function today() {
    const now = new Date();
    return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /** "2026-10-26" -> "26.10" (коротко, для меток на карточках). */
  function formatShort(isoStr) {
    const [, m, d] = isoStr.split('-');
    return `${d}.${m}`;
  }

  /** "2026-10-26" -> "26.10.2026". */
  function formatFull(isoStr) {
    const [y, m, d] = isoStr.split('-');
    return `${d}.${m}.${y}`;
  }

  // ---------- Верхняя / нижняя неделя ----------

  const UPPER = 'UPPER';
  const LOWER = 'LOWER';
  const BOTH = 'BOTH';

  function oppositeWeek(type) {
    return type === UPPER ? LOWER : UPPER;
  }

  /**
   * Тип недели для даты по "якорю": якорь — любая дата, про неделю которой
   * известно, верхняя она или нижняя. Дальше недели просто чередуются:
   * чётное число недель от якоря — тот же тип, нечётное — противоположный.
   *
   *   weekTypeFor('2026-09-14', { date: '2026-09-01', type: 'UPPER' })
   *   -> 2 недели разницы (чётно) -> 'UPPER'
   */
  function weekTypeFor(isoDate, anchor) {
    const diff = weeksBetween(anchor.date, isoDate);
    return Math.abs(diff) % 2 === 0 ? anchor.type : oppositeWeek(anchor.type);
  }

  /**
   * Тип недели с учётом настроек пользователя.
   *   settings.weekMode = 'auto'   -> считаем от даты начала учебного года
   *                                   (settings.anchor = { date, type })
   *   settings.weekMode = 'manual' -> пользователь сам сказал "эта неделя
   *                                   верхняя" (settings.manualAnchor)
   * В обоих режимах дальше недели чередуются, поэтому листание на соседние
   * недели работает правильно и в ручном режиме.
   */
  function weekTypeForSettings(isoDate, settings) {
    const anchor = settings.weekMode === 'manual' && settings.manualAnchor
      ? settings.manualAnchor
      : settings.anchor;
    return weekTypeFor(isoDate, anchor);
  }

  /** Ручной якорь: "неделя, в которую входит date, — это type". */
  function makeManualAnchor(isoDate, type) {
    return { date: mondayOf(isoDate), type };
  }

  // ---------- Пары на дату ----------

  /**
   * Состояние пары относительно даты (день недели и неделя уже совпали):
   *   'active' — идёт в этот день;
   *   'future' — ещё не началась (startDate или первая из dates — позже);
   *   'past'   — уже закончилась;
   *   'skip'   — пара по конкретным датам, и эта дата не из списка
   *              (например, "07.09, 21.09", а смотрим 14.09).
   */
  function lessonStatus(lesson, isoDate) {
    if (lesson.dates) {
      if (lesson.dates.includes(isoDate)) return 'active';
      if (lesson.dates.every((d) => d > isoDate)) return 'future';
      if (lesson.dates.every((d) => d < isoDate)) return 'past';
      return 'skip';
    }
    if (lesson.startDate && isoDate < lesson.startDate) return 'future';
    if (lesson.endDate && isoDate > lesson.endDate) return 'past';
    return 'active';
  }

  /** Ближайшая будущая дата из списка dates (для метки "будет 21.09"). */
  function nextDate(lesson, isoDate) {
    return (lesson.dates || []).find((d) => d > isoDate) || null;
  }

  /**
   * Короткие метки на карточке пары:
   *   идёт, есть конец          -> "до 07.12"
   *   идёт по конкретным датам  -> "разово" (+ остальные даты)
   *   ещё не началась           -> "с 26.10" / "будет 21.09"
   */
  function lessonLabels(lesson, status, isoDate) {
    const labels = [];
    if (status === 'active') {
      if (lesson.dates) {
        const others = lesson.dates.filter((d) => d !== isoDate).map(formatShort);
        labels.push(others.length ? `разово, ещё ${others.join(', ')}` : 'разово');
      } else if (lesson.endDate) {
        labels.push(`до ${formatShort(lesson.endDate)}`);
      }
    } else if (status === 'future') {
      labels.push(lesson.dates
        ? `будет ${formatShort(nextDate(lesson, isoDate))}`
        : `с ${formatShort(lesson.startDate)}`);
    }
    return labels;
  }

  /**
   * Главная функция экрана: какие пары у группы в этот день.
   * Возвращает { weekType, items: [{ lesson, status, labels }] }.
   *   options.showFuture — показывать ещё не начавшиеся пары (серыми).
   * Закончившиеся пары и "не та дата из списка" не показываются никогда.
   */
  function lessonsForDate(group, isoDate, settings, options = {}) {
    const weekType = weekTypeForSettings(isoDate, settings);
    const day = weekday(isoDate);
    const items = [];
    for (const lesson of group.lessons) {
      if (lesson.day !== day) continue;
      if (lesson.week !== BOTH && lesson.week !== weekType) continue;
      const status = lessonStatus(lesson, isoDate);
      if (status === 'past' || status === 'skip') continue;
      if (status === 'future' && !options.showFuture) continue;
      items.push({ lesson, status, labels: lessonLabels(lesson, status, isoDate) });
    }
    items.sort((a, b) => a.lesson.pair - b.lesson.pair);
    return { weekType, items };
  }

  /** Даты Пн–Сб недели, в которую входит дата. */
  function weekDates(isoDate) {
    const monday = mondayOf(isoDate);
    return [0, 1, 2, 3, 4, 5].map((i) => addDays(monday, i));
  }

  /**
   * Какой день открыть по кнопке "Сегодня": в воскресенье пар нет,
   * поэтому сразу показываем понедельник следующей недели.
   */
  function defaultDate(isoToday) {
    return weekday(isoToday) === 7 ? addDays(isoToday, 1) : isoToday;
  }

  /**
   * Ближайшая дата (начиная с fromDate), когда пара действительно пройдёт.
   * Нужна поиску: нажал на найденную пару — открылся её ближайший день.
   * null — пара больше не встретится (в пределах maxWeeks недель).
   */
  function nextOccurrence(lesson, fromDate, settings, maxWeeks = 30) {
    // Первая дата с нужным днём недели, не раньше fromDate
    let d = addDays(fromDate, (lesson.day - weekday(fromDate) + 7) % 7);
    for (let i = 0; i < maxWeeks; i++, d = addDays(d, 7)) {
      const weekOk = lesson.week === BOTH || lesson.week === weekTypeForSettings(d, settings);
      if (!weekOk) continue;
      const status = lessonStatus(lesson, d);
      if (status === 'active') return d;
      if (status === 'past') return null; // дальше будет только "past"
    }
    return null;
  }

  // ---------- Поиск ----------

  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

  /** Пары группы, где запрос встречается в предмете, преподавателе или аудитории. */
  function searchLessons(group, query) {
    const q = norm(query).trim();
    if (!q) return [];
    return group.lessons.filter((l) =>
      [l.subject, l.teacher, l.room, l.note].some((f) => norm(f).includes(q)));
  }

  /** Поиск группы по названию или второму имени ("302", "исп311"). */
  function filterGroups(groups, query) {
    const q = norm(query).replace(/\s+/g, '');
    if (!q) return groups;
    return groups.filter((g) => norm(g.name + g.alias).replace(/\s+/g, '').includes(q));
  }

  return {
    UPPER, LOWER, BOTH,
    iso, isValidDate, toDayNum, fromDayNum, addDays,
    weekday, mondayOf, weeksBetween, today, formatShort, formatFull,
    oppositeWeek, weekTypeFor, weekTypeForSettings, makeManualAnchor,
    lessonStatus, lessonLabels, lessonsForDate, weekDates, defaultDate,
    nextOccurrence, searchLessons, filterGroups,
  };
});
