/*
 * sw.js — service worker: "посредник" между страницей и сетью.
 * Благодаря ему приложение открывается без интернета.
 *
 * Как работает:
 *   install  — при первом открытии скачиваем ВСЕ файлы приложения в кэш;
 *   fetch    — любой запрос страницы сначала ищем в кэше, сеть — только если там нет;
 *   activate — удаляем кэши старых версий.
 *
 * Обновление: build-web.js при каждой сборке вписывает сюда новую VERSION
 * и список FILES. Браузер замечает, что sw.js изменился, ставит новую
 * версию, а страница перезагружается и показывает "Расписание обновлено".
 *
 * Строки VERSION и FILES ниже — заготовки, их заменяет build-web.js.
 */
'use strict';

const VERSION = "202610151803";
const FILES = [
  "./",
  "app.js",
  "core.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "index.html",
  "manifest.webmanifest",
  "schedule-data.js",
  "style.css"
];
const CACHE = `rkt-schedule-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' — брать файлы с сервера, а не из обычного кэша браузера
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      // Новая версия начинает работать сразу, не дожидаясь закрытия всех вкладок
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('rkt-schedule-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Переходы на другие страницы сайта (например, shop/) — не наши, пусть идут в сеть
  const root = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && url.pathname !== root && url.pathname !== root + 'index.html') return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      // Открытие самого приложения (./ или ./?…) — всегда index.html из кэша
      (req.mode === 'navigate' ? cache.match('./index.html') : cache.match(req, { ignoreSearch: true }))
        .then((hit) => hit || fetch(req)))
  );
});
