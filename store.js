// Store guide: sign-in (email + access code) and suggested sale prices.
// The database only sends each product's suggested sale price, never the distributor's cost, markup or the store's own price.
(() => {
  const API = 'https://gnsrcsuyljrirwmvvcmh.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_vzx44rpaqGYbQYxBhhMJdA_kT5LzPA7';
  const TOK = 'pokemon-session';
  const PREF = 'pokemon-store-prefs';
  const COUNTER_CH = new Set(['counter', 'bundle', 'kit']);
  const TYPE = { box: 'Booster box', etb: 'Elite Trainer Box', bundle: 'Booster bundle', counter: 'Pack, blister or tin', kit: 'Collection or kit' };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const usd = (v) => (v == null || isNaN(v) ? '—' : '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const pctf = (v) => (v == null || isNaN(v) ? '—' : Math.round(v * 100) + '%');

  async function rpc(fn, args) {
    const r = await fetch(API + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    const t = await r.text();
    let body = null;
    try { body = t ? JSON.parse(t) : null; } catch (e) { body = t; }
    if (!r.ok) { const err = new Error((body && body.message) || 'Request failed (' + r.status + ')'); err.code = body && body.message; throw err; }
    return body;
  }
  const store = { get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v, keep) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); (keep ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} } };
  let token = store.get(TOK);
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} };

  const show = (name) => { $('#login').hidden = name !== 'login'; $('#board').hidden = name !== 'board'; $('#account').hidden = name !== 'board'; };
  let data = null, type = 'hobby';

  function render() {
    if (!data) return;
    document.querySelectorAll('#type-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    const showV = $('#show').value, sortV = $('#sort').value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let list = data.products.map((r) => {
      const p = { ...r, market: Number(r.market), msrp: r.msrp == null ? null : Number(r.msrp), packs: Number(r.packs) || 0 };
      p.counter = COUNTER_CH.has(p.channel);
      p.sale = Number(r.salePrice);
      p.over = p.market > 0 ? p.sale / p.market - 1 : 0;
      p.rel = p.releaseDate ? new Date(p.releaseDate + 'T00:00:00') : null;
      p.isNew = p.rel && (today - p.rel) / 864e5 <= 30 && (today - p.rel) >= 0;
      p.name = p.set + ' ' + p.product;
      return p;
    });
    if (showV === 'fit') list = list.filter((p) => (type === 'counter' ? p.counter : true));
    else if (showV === 'counter') list = list.filter((p) => p.counter);
    else if (showV === 'hobby') list = list.filter((p) => !p.counter);
    const hotScore = (p) => (Number(p.sentiment) || 0) * 2 + (Number(p.trend) || 0) + (p.isNew ? 1 : 0);
    list.sort(sortV === 'premium' ? (a, b) => b.over - a.over
      : sortV === 'newest' ? (a, b) => (b.rel || 0) - (a.rel || 0)
      : sortV === 'low' ? (a, b) => a.sale - b.sale
      : (a, b) => hotScore(b) - hotScore(a) || b.over - a.over);

    $('#t-count').textContent = String(list.length);
    $('#t-margin').textContent = list.length ? '+' + pctf(list.reduce((t, p) => t + p.over, 0) / list.length) : '—';
    const best = list.filter((p) => p.rel && p.rel <= today).sort((a, b) => b.rel - a.rel)[0];
    $('#t-best').textContent = best ? best.name : '—';
    $('#t-best-sub').textContent = best ? 'Out ' + best.rel.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const hot = list.slice().sort((a, b) => hotScore(b) - hotScore(a))[0];
    $('#t-hot').textContent = hot ? hot.name : '—';
    $('#t-hot-sub').textContent = hot && hot.opinion ? hot.opinion : '';

    const grid = $('#grid'); grid.replaceChildren();
    if (!list.length) grid.append(el('div', 'empty', 'No products match these filters.'));
    for (const p of list) {
      const c = el('article', 'card');
      const row = el('div', 'row');
      const ph = el('div', 'ph');
      const src = (window.PRODUCT_PHOTOS || {})[p.id];
      if (src) { const im = el('img'); im.src = src; im.alt = p.name; im.loading = 'lazy'; ph.append(im); } else ph.textContent = 'No photo';
      const info = el('div');
      info.append(el('h3', null, p.name));
      info.append(el('div', 'meta', (TYPE[p.channel] || '') + (p.packs ? ' · ' + p.packs + (p.packs === 1 ? ' pack' : ' packs') : '') + (p.lang === 'JP' ? ' · Japanese' : '')));
      const bd = el('div', 'badges');
      if ((Number(p.sentiment) || 0) >= 1) bd.append(el('span', 'badge hot', 'Hot with buyers'));
      if (p.isNew) bd.append(el('span', 'badge new', 'New release'));
      if (Number(p.trend) < 0) bd.append(el('span', 'badge drop', 'Price falling'));
      if (Number(p.trend) > 0) bd.append(el('span', 'badge', 'Price rising'));
      if (bd.childElementCount) info.append(bd);
      row.append(ph, info); c.append(row);
      const nums = el('div', 'nums');
      const n = (lab, val, cls) => { const d = el('div', null, lab); const b = el('b', cls, val); d.append(b); nums.append(d); };
      n('Online market', usd(p.market));
      n('Suggested sale price', usd(p.sale), 'up');
      nums.lastChild.querySelector('b').append(el('small', null, '+' + pctf(p.over) + ' over market'));
      c.append(nums);
      const extra = [];
      if (p.msrp) extra.push('MSRP ' + usd(p.msrp));
      if (p.packs > 1) extra.push(usd(p.sale / p.packs) + ' per pack at the sale price');
      c.append(el('div', 'small', extra.join(' · ')));
      if (p.opinion) c.append(el('div', 'opinion', p.opinion));
      grid.append(c);
    }

    const tb = $('#rel'); tb.replaceChildren();
    const rel = (data.releases || []).filter((r) => type === 'counter' ? r.storeFit !== 'hobby' : true);
    if (!rel.length) { const tr = el('tr'); const td = el('td', 'empty', 'Nothing announced right now.'); td.colSpan = 3; tr.append(td); tb.append(tr); }
    for (const r of rel) {
      const tr = el('tr');
      const d = new Date(r.date + 'T00:00:00');
      tr.append(el('td', null, d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })));
      const td = el('td'); td.append(el('div', null, r.product + (r.lang === 'JP' ? ' (Japan)' : ''))); if (r.note) td.append(el('div', 'small', r.note)); tr.append(td);
      tr.append(el('td', null, r.storeFit === 'counter' ? 'Gas and vape shops' : r.storeFit === 'hobby' ? 'Hobby shops' : 'All stores'));
      tb.append(tr);
    }
  }

  async function load() {
    try {
      data = await rpc('store_prices', { p_token: token });
    } catch (e) {
      if (e.code === 'not_signed_in') { signedOut('Your session ended. Sign in again.'); return; }
      $('#login-msg').textContent = "Couldn't load prices. Try again in a minute."; show('login'); return;
    }
    const me = data.me || {};
    type = prefs.type || me.storeType || 'hobby';
    $('#who').textContent = me.email || '';
    $('#title').textContent = me.storeName ? 'Pokémon guide for ' + me.storeName : 'Pokémon store guide';
    const latest = (data.products || []).map((p) => p.asOf).filter(Boolean).sort().pop();
    $('#updated').textContent = latest ? 'Prices updated ' + new Date(latest + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    show('board');
    render();
  }

  function signedOut(msg) { store.del(TOK); token = null; $('#login-msg').textContent = msg || ''; show('login'); }

  document.querySelectorAll('#type-seg button').forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.type; prefs.type = type; savePrefs();
    render();
  }));
  $('#show').addEventListener('change', render);
  $('#sort').addEventListener('change', render);

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim().toLowerCase(), code = $('#code').value.trim(), remember = $('#remember').checked;
    const msg = $('#login-msg');
    if (!email || !code) return;
    $('#send').disabled = true; msg.textContent = 'Signing in...';
    try {
      const r = await rpc('pokemon_login', { p_email: email, p_code: code, p_remember: remember });
      if (r && r.ok) { token = r.token; store.set(TOK, r.token, remember); $('#code').value = ''; msg.textContent = ''; await load(); }
      else msg.textContent = (r && r.reason) === 'locked' ? 'Too many wrong tries for this email. Wait 15 minutes, then try again.' : "That email and code don't match. Check both and try again.";
    } catch (err) { msg.textContent = "Couldn't reach the sign-in service. Check your connection and try again."; }
    $('#send').disabled = false;
  });
  $('#signout').addEventListener('click', async () => { try { if (token) await rpc('pokemon_logout', { p_token: token }); } catch (e) {} signedOut("You're signed out."); });

  if (token) load(); else show('login');
})();
