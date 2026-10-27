/*
 * app.js — логика демо-магазина: каталог с фильтрами, карточка товара,
 * избранное, корзина и оформление заказа (без реальной отправки).
 * Корзина, избранное и тема сохраняются в localStorage этого браузера.
 */
'use strict';

(() => {
  const { products, categories, currency, freeShippingFrom } = window.SHOP;
  const DELIVERY_PRICE = 390;
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const $ = (sel) => document.querySelector(sel);

  // ---------- Хранилище (в приватном режиме может быть недоступно) ----------
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* не сохраняем — не страшно */ }
    },
  };

  const state = {
    cat: 'all',
    query: '',
    sort: 'popular',
    favOnly: false,
    look: null,                         // { name, ids } — выбранный образ из лукбука
    fav: new Set(store.get('tkan-fav', [])),
    cart: store.get('tkan-cart', []),   // [{ id, color, size, qty }]
  };

  // ---------- Утилиты ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${n.toLocaleString('ru-RU')} ${currency}`;
  const tint = (hex) => `background: color-mix(in srgb, ${hex} 24%, var(--surface-2))`;

  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b < 110;
  }

  // ---------- SVG-силуэты одежды ----------
  // Каждый тип — набор фигур в viewBox 0 0 200 220. «fill» — цвет товара,
  // «line» — детали (швы, карманы), светлее или темнее в зависимости от цвета.
  const SHAPES = {
    tee: (c, l) => `
      <path fill="${c}" d="M72 30 Q100 48 128 30 L168 52 L184 92 L156 104 L148 84 L148 196 L52 196 L52 84 L44 104 L16 92 L32 52 Z"/>
      <path stroke="${l}" d="M72 30 Q100 54 128 30 M52 84 L52 96 M148 84 L148 96"/>`,
    hoodie: (c, l) => `
      <path fill="${c}" d="M70 40 L40 54 L18 170 L42 176 L58 100 L58 200 L142 200 L142 100 L158 176 L182 170 L160 54 L130 40 Z"/>
      <path fill="${c}" d="M66 46 Q66 8 100 8 Q134 8 134 46 Q118 62 100 62 Q82 62 66 46 Z"/>
      <path fill="${l}" d="M80 44 Q100 18 120 44 Q100 56 80 44 Z"/>
      <path stroke="${l}" d="M74 150 L126 150 L134 186 L66 186 Z M92 58 L90 92 M108 58 L110 92 M20 160 L44 166 M180 160 L156 166 M58 190 L142 190"/>`,
    pants: (c, l) => `
      <path fill="${c}" d="M60 14 L140 14 L148 206 L110 206 L100 74 L90 206 L52 206 Z"/>
      <path stroke="${l}" d="M60 30 L140 30 M100 30 L100 74 M64 34 Q80 48 72 62 M136 34 Q120 48 128 62"/>`,
    dress: (c, l) => `
      <path stroke="${c}" stroke-width="5" d="M84 12 L86 52 M116 12 L114 52"/>
      <path fill="${c}" d="M82 50 L118 50 L124 90 L170 206 L30 206 L76 90 Z"/>
      <path stroke="${l}" d="M76 90 L124 90 M92 110 L74 200 M108 110 L126 200"/>`,
    jacket: (c, l) => `
      <path fill="${c}" d="M70 24 L36 40 L20 170 L44 176 L56 96 L56 196 L144 196 L144 96 L156 176 L180 170 L164 40 L130 24 L100 60 Z"/>
      <path fill="${l}" d="M70 24 L100 60 L130 24 L122 18 L100 42 L78 18 Z"/>
      <path stroke="${l}" d="M100 60 L100 196 M66 84 L90 84 L90 106 L66 106 Z M110 84 L134 84 L134 106 L110 106 Z"/>
      <g fill="${l}"><circle cx="100" cy="90" r="3"/><circle cx="100" cy="124" r="3"/><circle cx="100" cy="158" r="3"/></g>`,
    coat: (c, l) => `
      <path fill="${c}" d="M72 20 L38 36 L22 180 L46 186 L58 96 L56 214 L144 214 L142 96 L154 186 L178 180 L162 36 L128 20 L100 90 Z"/>
      <path fill="${l}" d="M72 20 L100 90 L84 72 L78 46 Z M128 20 L100 90 L116 72 L122 46 Z"/>
      <path stroke="${l}" d="M100 90 L100 214 M66 150 L88 150 M112 150 L134 150"/>
      <g fill="${l}"><circle cx="110" cy="112" r="3"/><circle cx="110" cy="134" r="3"/></g>`,
    cap: (c, l) => `
      <path fill="${c}" d="M120 132 Q178 126 196 142 Q190 154 158 152 L112 146 Z"/>
      <path fill="${c}" d="M40 138 Q40 68 102 68 Q160 68 162 138 Z"/>
      <path stroke="${l}" d="M102 68 Q84 96 80 138 M102 68 Q124 96 128 138 M40 138 L162 138"/>
      <circle fill="${l}" cx="102" cy="68" r="5"/>`,
    shoe: (c, l) => `
      <path fill="${c}" d="M22 150 L24 110 Q40 104 62 102 L86 80 L112 84 Q130 116 172 124 Q188 128 186 150 Z"/>
      <path fill="#f3f1ec" stroke="rgba(0,0,0,.18)" d="M18 150 L190 150 L188 166 Q100 172 20 166 Z"/>
      <path stroke="${l}" d="M90 90 L104 100 M96 84 L114 96 M150 122 Q172 130 186 150 M24 136 L186 140"/>`,
    bag: (c, l) => `
      <path stroke="${c}" stroke-width="7" d="M72 80 Q72 22 100 22 Q128 22 128 80"/>
      <path fill="${c}" d="M42 76 L158 76 L166 206 L34 206 Z"/>
      <text x="100" y="150" fill="${l}" font-family="Manrope, sans-serif" font-size="18" font-weight="800" letter-spacing="4" text-anchor="middle">TKAN</text>`,
  };

  function garment(type, hex, extraClass = '') {
    const line = isDark(hex) ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
    return `<svg class="${extraClass}" viewBox="0 0 200 220" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[type](hex, line)}</svg>`;
  }

  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';

  function priceHtml(p) {
    return p.oldPrice
      ? `<span class="price price--sale">${money(p.price)}<s>${money(p.oldPrice)}</s></span>`
      : `<span class="price">${money(p.price)}</span>`;
  }

  function tagHtml(p) {
    if (!p.tag) return '';
    const mod = p.tag === 'Скидка' ? 'sale' : p.tag === 'Новинка' ? 'new' : '';
    const label = p.oldPrice ? `−${Math.round((1 - p.price / p.oldPrice) * 100)}%` : p.tag;
    return `<span class="card__tag ${mod ? `card__tag--${mod}` : ''}">${esc(label)}</span>`;
  }

  // ---------- Каталог ----------
  function renderChips() {
    $('#catChips').innerHTML = categories.map((c) =>
      `<button class="chip" role="tab" type="button" data-cat="${c.id}" aria-selected="${state.cat === c.id && !state.look}">${esc(c.name)}</button>`
    ).join('');
  }

  function visibleProducts() {
    const q = state.query.trim().toLowerCase();
    let list = products.filter((p) =>
      (state.look ? state.look.ids.includes(p.id) : state.cat === 'all' || p.cat === state.cat) &&
      (!state.favOnly || state.fav.has(p.id)) &&
      (!q || `${p.name} ${p.material} ${p.colors.map((c) => c.name).join(' ')}`.toLowerCase().includes(q)));

    if (state.sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
    if (state.sort === 'popular') list = [...list].sort((a, b) => (b.tag === 'Хит') - (a.tag === 'Хит'));
    if (state.sort === 'sale') list = list.filter((p) => p.oldPrice).sort((a, b) => b.oldPrice / b.price - a.oldPrice / a.price);
    return list;
  }

  function renderGrid() {
    const list = visibleProducts();
    $('#productGrid').innerHTML = list.map((p) => {
      const c = p.colors[0];
      return `
        <article class="card">
          <button class="card__media" type="button" data-open="${p.id}" style="${tint(c.hex)}" aria-label="Открыть: ${esc(p.name)}">
            ${garment(p.type, c.hex)}${tagHtml(p)}
          </button>
          <button class="fav" type="button" data-fav="${p.id}" aria-pressed="${state.fav.has(p.id)}" aria-label="В избранное: ${esc(p.name)}">${heart}</button>
          <button class="card__name" type="button" data-open="${p.id}">${esc(p.name)}</button>
          <div class="card__row">
            ${priceHtml(p)}
            <span class="swatches">${p.colors.map((col) => `<i class="swatch" style="background:${col.hex}" title="${esc(col.name)}"></i>`).join('')}</span>
          </div>
        </article>`;
    }).join('');

    $('#emptyState').hidden = list.length > 0;
    const filters = [state.look && `образ «${state.look.name}»`, state.favOnly && 'избранное'].filter(Boolean);
    $('#resultCount').innerHTML = `${list.length} ${plural(list.length, 'товар', 'товара', 'товаров')}` +
      (filters.length ? ` · ${filters.join(', ')} <button class="remove" type="button" data-reset>сбросить</button>` : '');
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function renderAll() { renderChips(); renderGrid(); renderBadges(); }

  // ---------- Первый экран и лукбук ----------
  $('#heroArt').innerHTML =
    garment('coat', '#5b4636', 'h1') + garment('hoodie', '#ece6da', 'h2') + garment('cap', '#2a2b2f', 'h3');

  const LOOKS = [
    { name: 'Выходной в городе', bg: '#7d8a76', items: [['p02', 0], ['p12', 0], ['p08', 0]] },
    { name: 'Офис без дресс-кода', bg: '#8a6f58', items: [['p05', 1], ['p03', 0], ['p09', 1]] },
    { name: 'Первые холода', bg: '#4f5562', items: [['p06', 0], ['p10', 0], ['p07', 0]] },
  ];
  const LOOK_POS = ['left:0;top:0', 'right:0;top:28%', 'left:12%;bottom:0'];
  $('#looks').innerHTML = LOOKS.map((look, i) => `
    <article class="look" style="background:${look.bg}">
      <div class="look__art"><div class="stack">
        ${look.items.map(([id, ci], k) => garment(byId[id].type, byId[id].colors[ci].hex).replace('<svg ', `<svg style="${LOOK_POS[k]}" `)).join('')}
      </div></div>
      <div class="look__caption">
        <b>${esc(look.name)}</b>
        <span>${look.items.map(([id]) => esc(byId[id].name.split(' «')[0])).join(' · ')}</span><br>
        <button type="button" data-look="${i}">Смотреть вещи</button>
      </div>
    </article>`).join('');

  // ---------- Карточка товара ----------
  const pm = { id: null, color: 0, size: null };

  function openProduct(id) {
    const p = byId[id];
    pm.id = id; pm.color = 0; pm.size = p.sizes.length === 1 ? p.sizes[0] : null;
    renderProduct();
    $('#productModal').showModal();
  }

  function renderProduct() {
    const p = byId[pm.id];
    const c = p.colors[pm.color];
    $('#pmBody').innerHTML = `
      <div class="pm__media" style="${tint(c.hex)}">${garment(p.type, c.hex)}</div>
      <div class="pm__info">
        <h2 id="pmTitle">${esc(p.name)}</h2>
        <div class="pm__price">${priceHtml(p)}</div>
        <p class="pm__meta">${esc(p.desc)}</p>
        <div>
          <div class="opt-label">Цвет: <span>${esc(c.name)}</span></div>
          <div class="colors">${p.colors.map((col, i) =>
            `<button class="color-opt" type="button" data-color="${i}" style="background:${col.hex}" aria-pressed="${i === pm.color}" aria-label="${esc(col.name)}"></button>`).join('')}</div>
        </div>
        <div>
          <div class="opt-label">Размер</div>
          <div class="sizes">${p.sizes.map((s) =>
            `<button class="size-opt" type="button" data-size="${esc(s)}" aria-pressed="${s === pm.size}">${esc(s)}</button>`).join('')}</div>
        </div>
        <p class="pm__hint" id="pmHint" aria-live="polite"></p>
        <p class="pm__meta"><b>Состав:</b> ${esc(p.material)}</p>
        <div class="pm__actions">
          <button class="btn btn--primary" type="button" data-add>Добавить в корзину</button>
          <button class="btn btn--ghost fav-inline" type="button" data-fav="${p.id}" aria-pressed="${state.fav.has(p.id)}" aria-label="В избранное">
            ${state.fav.has(p.id) ? '♥' : '♡'}
          </button>
        </div>
      </div>`;
  }

  $('#pmBody').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.color) { pm.color = +t.dataset.color; renderProduct(); }
    else if (t.dataset.size) { pm.size = t.dataset.size; renderProduct(); }
    else if ('add' in t.dataset) {
      if (!pm.size) { $('#pmHint').textContent = 'Выберите размер'; return; }
      addToCart(pm.id, pm.color, pm.size);
      $('#productModal').close();
      openCart();
    }
  });

  // ---------- Избранное ----------
  function toggleFav(id) {
    state.fav.has(id) ? state.fav.delete(id) : state.fav.add(id);
    store.set('tkan-fav', [...state.fav]);
    renderGrid(); renderBadges();
    if ($('#productModal').open && pm.id === id) renderProduct();
  }

  // ---------- Корзина ----------
  const cartQty = () => state.cart.reduce((s, l) => s + l.qty, 0);
  const cartSum = () => state.cart.reduce((s, l) => s + byId[l.id].price * l.qty, 0);
  const saveCart = () => store.set('tkan-cart', state.cart);

  function addToCart(id, color, size) {
    const line = state.cart.find((l) => l.id === id && l.color === color && l.size === size);
    line ? line.qty++ : state.cart.push({ id, color, size, qty: 1 });
    saveCart(); renderBadges();
  }

  function renderBadges() {
    const n = cartQty();
    $('#cartCount').hidden = n === 0;
    $('#cartCount').textContent = n;
    $('#favCount').hidden = state.fav.size === 0;
    $('#favCount').textContent = state.fav.size;
    $('#favBtn').setAttribute('aria-pressed', state.favOnly);
  }

  function openCart() { renderCart(); $('#cartDrawer').showModal(); }

  function renderCart() {
    // Убираем строки с товарами, которых больше нет в каталоге (старые данные в localStorage)
    state.cart = state.cart.filter((l) => byId[l.id] && byId[l.id].colors[l.color]);

    if (!state.cart.length) {
      $('#cartBody').innerHTML = `
        <div class="cart-empty">
          <p>В корзине пока пусто</p>
          <button class="btn btn--primary" type="button" data-close>Перейти к покупкам</button>
        </div>`;
      $('#cartFoot').innerHTML = '';
      return;
    }

    $('#cartBody').innerHTML = state.cart.map((l, i) => {
      const p = byId[l.id], c = p.colors[l.color];
      return `
        <div class="line">
          <div class="line__img" style="${tint(c.hex)}">${garment(p.type, c.hex)}</div>
          <div>
            <div class="line__name">${esc(p.name)}</div>
            <div class="line__opts">${esc(c.name)} · ${esc(l.size)}</div>
            <div class="qty">
              <button type="button" data-dec="${i}" aria-label="Меньше">−</button>
              <span>${l.qty}</span>
              <button type="button" data-inc="${i}" aria-label="Больше">+</button>
            </div>
          </div>
          <div class="line__right">
            <b>${money(p.price * l.qty)}</b>
            <button class="remove" type="button" data-remove="${i}">Удалить</button>
          </div>
        </div>`;
    }).join('');

    const sum = cartSum();
    const left = freeShippingFrom - sum;
    $('#cartFoot').innerHTML = `
      <div class="ship">
        ${left > 0 ? `До бесплатной доставки — ${money(left)}` : 'Доставка бесплатная 🎉'}
        <div class="ship__bar"><i style="width:${Math.min(100, (sum / freeShippingFrom) * 100)}%"></i></div>
      </div>
      <div class="total"><span>Итого</span><span>${money(sum)}</span></div>
      <button class="btn btn--primary btn--block" type="button" data-checkout>Оформить заказ</button>`;
  }

  $('#cartDrawer').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.inc) state.cart[+d.inc].qty++;
    else if (d.dec) { const l = state.cart[+d.dec]; l.qty > 1 ? l.qty-- : state.cart.splice(+d.dec, 1); }
    else if (d.remove) state.cart.splice(+d.remove, 1);
    else if ('checkout' in d) { $('#cartDrawer').close(); openCheckout(); return; }
    else return;
    saveCart(); renderCart(); renderBadges();
  });

  // ---------- Оформление заказа (демо) ----------
  function openCheckout() {
    const sum = cartSum();
    const delivery = sum >= freeShippingFrom ? 0 : DELIVERY_PRICE;
    $('#checkoutBody').innerHTML = `
      <h2 id="coTitle">Оформление заказа</h2>
      <p class="muted small">Демо-режим: данные никуда не отправляются.</p>
      <form class="form" id="checkoutForm">
        <label class="field">Имя<input name="name" required autocomplete="name"></label>
        <label class="field">Телефон<input name="phone" type="tel" required autocomplete="tel" placeholder="+7 900 000-00-00"></label>
        <div class="radio-row" role="radiogroup" aria-label="Способ получения">
          <label><input type="radio" name="ship" value="courier" checked> Курьер</label>
          <label><input type="radio" name="ship" value="pickup"> Пункт выдачи</label>
        </div>
        <label class="field">Адрес<input name="address" required autocomplete="street-address"></label>
        <label class="field">Комментарий<textarea name="comment"></textarea></label>
        <div class="total small"><span>Товары</span><span>${money(sum)}</span></div>
        <div class="total small"><span>Доставка</span><span>${delivery ? money(delivery) : 'бесплатно'}</span></div>
        <div class="total"><span>К оплате</span><span>${money(sum + delivery)}</span></div>
        <button class="btn btn--primary btn--block" type="submit">Подтвердить заказ</button>
      </form>`;
    $('#checkoutModal').showModal();
  }

  $('#checkoutBody').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    const order = Math.floor(100000 + Math.random() * 900000);
    state.cart = []; saveCart(); renderBadges();
    $('#checkoutBody').innerHTML = `
      <div class="success">
        <div class="success__icon">✓</div>
        <h2 id="coTitle">Спасибо, ${esc(name)}!</h2>
        <p class="muted">Заказ № ${order} оформлен. Это демо — на самом деле ничего не придёт 🙂</p>
        <button class="btn btn--primary" type="button" data-close>Продолжить покупки</button>
      </div>`;
  });

  // ---------- Общие обработчики ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-fav],[data-cat],[data-look],[data-reset],[data-close]');
    if (!t) return;
    const d = t.dataset;
    if (d.open) openProduct(d.open);
    else if (d.fav) toggleFav(d.fav);
    else if (d.cat) { state.cat = d.cat; state.look = null; renderAll(); }
    else if (d.look) {
      const look = LOOKS[+d.look];
      state.look = { name: look.name, ids: look.items.map(([id]) => id) };
      state.favOnly = false;
      renderAll();
      $('#catalog').scrollIntoView();
    }
    else if ('reset' in d) { state.look = null; state.favOnly = false; renderAll(); }
    else if ('close' in d) t.closest('dialog').close();
  });

  // Клик по затемнению вокруг окна закрывает его
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  });

  $('#cartBtn').addEventListener('click', openCart);
  $('#favBtn').addEventListener('click', () => {
    if (!state.fav.size) { toast('В избранном пока пусто — нажмите ♡ на товаре'); return; }
    state.favOnly = !state.favOnly;
    renderAll();
    $('#catalog').scrollIntoView();
  });
  $('#searchInput').addEventListener('input', (e) => { state.query = e.target.value; renderGrid(); });
  $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });

  $('#subscribeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.reset();
    toast('Готово! Промокод WELCOME10 — ваш (демо)');
  });

  // ---------- Тема ----------
  const root = document.documentElement;
  const savedTheme = store.get('tkan-theme', null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $('#themeBtn').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('tkan-theme', root.dataset.theme);
  });

  // ---------- Уведомление ----------
  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  renderAll();
})();
