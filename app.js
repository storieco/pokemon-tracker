// Sign-in (email + personal access code) and data loading for the shared Pokémon buy board.
// No sign-in emails are sent. Only people on the approved list with a valid code can read data.
(() => {
  const API = 'https://gnsrcsuyljrirwmvvcmh.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_vzx44rpaqGYbQYxBhhMJdA_kT5LzPA7';
  const TOK = 'pokemon-session';

  const $ = (s) => document.querySelector(s);
  const views = { login: $('#login'), board: $('#board'), denied: $('#denied') };
  const show = (name) => {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('#account').hidden = name !== 'board';
  };

  async function rpc(fn, args) {
    const r = await fetch(API + fn, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    const t = await r.text();
    let body = null;
    try { body = t ? JSON.parse(t) : null; } catch (e) { body = t; }
    if (!r.ok) {
      const err = new Error((body && body.message) || ('Request failed (' + r.status + ')'));
      err.code = body && body.message;
      throw err;
    }
    return body;
  }

  const getToken = () => { try { return localStorage.getItem(TOK) || sessionStorage.getItem(TOK); } catch (e) { return null; } };
  const saveToken = (t, remember) => {
    try { localStorage.removeItem(TOK); sessionStorage.removeItem(TOK); (remember ? localStorage : sessionStorage).setItem(TOK, t); } catch (e) {}
  };
  const clearToken = () => { try { localStorage.removeItem(TOK); sessionStorage.removeItem(TOK); } catch (e) {} };
  let token = getToken();
  let isAdmin = false;

  const COLS = {
    sealed: ['id', 'set', 'lang', 'product', 'packs', 'msrp', 'market', 'asOf', 'trend', 'sentiment', 'opinion', 'source', 'releaseDate', 'printRisk', 'channel', 'supply'],
    history: ['date', 'id', 'item', 'market', 'source'],
    chase: ['card', 'set', 'lang', 'price', 'trend', 'note', 'source'],
    pulls: ['set', 'lang', 'tier', 'oneIn', 'basis'],
    releases: ['id', 'date', 'lang', 'product', 'type', 'note', 'msrp', 'storeFit', 'source'],
  };
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const NUMERIC = { sealed: ['msrp', 'market'], history: ['market'], chase: ['price'], releases: ['msrp'] };

  function signedOut(msg) {
    clearToken(); token = null; isAdmin = false;
    $('#activity').hidden = true;
    $('#login-msg').textContent = msg || '';
    show('login');
  }

  async function loadData() {
    const ids = Object.keys(COLS);
    for (const id of ids) window.dash._loading(id);
    window.dash._emit();
    const results = await Promise.allSettled(ids.map(async (id) => [id, await rpc('pokemon_data', { p_token: token, p_dataset: id })]));
    if (results.some((r) => r.status === 'rejected' && r.reason && r.reason.code === 'not_signed_in')) {
      signedOut('Your session ended. Sign in again.');
      return;
    }
    let products = null;
    results.forEach((r, i) => {
      const id = ids[i];
      if (r.status === 'fulfilled') {
        const rows = r.value[1] || [];
        for (const k of NUMERIC[id] || []) for (const row of rows) row[k] = num(row[k]);
        window.dash._set(id, rows, COLS[id]);
        if (id === 'sealed') products = rows;
      } else {
        console.error(r.reason);
        window.dash._fail(id, String((r.reason && r.reason.message) || r.reason));
      }
    });
    show('board');
    if (products) {
      const latest = products.map((p) => p.asOf).filter(Boolean).sort().pop();
      $('#updated').textContent = latest ? 'Prices as of ' + latest : '';
    }
    window.dash._emit();
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView();
    }
    if (isAdmin) loadActivity();
  }
  window.__reloadData = loadData;

  function openBoard(me) {
    $('#who').textContent = me.email || '';
    isAdmin = !!me.admin;
    $('#activity').hidden = !isAdmin;
    loadData();
  }

  // ---- admin activity ----
  const KIND = { login: 'Signed in', visit: 'Opened the board', failed: 'Wrong code', locked: 'Locked out after wrong codes', logout: 'Signed out' };
  const when = (t) => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    const d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  };
  const cell = (text, cls) => { const c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; return c; };
  const emptyRow = (body, text, span) => { const tr = document.createElement('tr'); const c = cell(text, 'act-empty'); c.colSpan = span; tr.appendChild(c); body.appendChild(tr); };

  async function loadActivity() {
    if (!isAdmin) return;
    const pb = $('#act-people-body');
    const eb = $('#act-events-body');
    let r;
    try { r = await rpc('pokemon_activity', { p_token: token }); }
    catch (e) {
      if (e.code === 'not_signed_in') { signedOut('Your session ended. Sign in again.'); return; }
      pb.replaceChildren(); emptyRow(pb, "Couldn't load activity. Try Refresh.", 10); return;
    }
    pb.replaceChildren();
    (r.people || []).forEach((p) => {
      const tr = document.createElement('tr');
      const st = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'act-pill ' + (p.signedInNow ? 'ok' : p.lastActive ? 'warn' : 'bad');
      pill.textContent = p.signedInNow ? 'Active now' : p.lastActive ? 'Away' : 'Never signed in';
      st.appendChild(pill);
      const failed = cell(String(p.failed7 ?? 0), 'n');
      if (p.failed7 > 0) failed.style.color = 'var(--color-bad)';
      [cell((p.name ? p.name + ' · ' : '') + p.email), st, cell(when(p.lastLogin)),
        cell(p.lastActive ? when(p.lastActive) + ' (' + ago(p.lastActive) + ')' : 'Never'),
        cell(String(p.logins7 ?? 0), 'n'), cell(String(p.logins30 ?? 0), 'n'), cell(String(p.visits30 ?? 0), 'n'),
        cell(String(p.activeDays30 ?? 0), 'n'), failed, cell(String(p.rememberedDevices ?? 0), 'n')].forEach((c) => tr.appendChild(c));
      pb.appendChild(tr);
    });
    eb.replaceChildren();
    if (!(r.events || []).length) emptyRow(eb, 'No activity yet.', 3);
    (r.events || []).forEach((e) => {
      const tr = document.createElement('tr');
      let what = KIND[e.kind] || e.kind;
      if (e.kind === 'login' && e.remember) what += ' (remember me)';
      const w = cell(what);
      if (e.kind === 'failed' || e.kind === 'locked') w.style.color = 'var(--color-bad)';
      [cell(when(e.at)), cell(e.email), w].forEach((c) => tr.appendChild(c));
      eb.appendChild(tr);
    });
  }
  $('#act-refresh').addEventListener('click', loadActivity);

  // ---- sign-in ----
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim().toLowerCase();
    const code = $('#code').value.trim();
    const remember = $('#remember').checked;
    const msg = $('#login-msg');
    if (!email || !code) return;
    $('#send').disabled = true;
    msg.textContent = 'Signing in...';
    try {
      const r = await rpc('pokemon_login', { p_email: email, p_code: code, p_remember: remember });
      if (r && r.ok) {
        token = r.token;
        saveToken(r.token, remember);
        $('#code').value = '';
        msg.textContent = '';
        let me = { email: r.email, admin: false };
        try { me = (await rpc('pokemon_me', { p_token: token })) || me; } catch (err) {}
        openBoard(me);
      } else {
        msg.textContent = (r && r.reason) === 'locked'
          ? 'Too many wrong tries for this email. Wait 15 minutes, then try again.'
          : "That email and code don't match. Check both and try again.";
      }
    } catch (err) {
      msg.textContent = "Couldn't reach the sign-in service. Check your connection and try again.";
    }
    $('#send').disabled = false;
  });

  $('#signout').addEventListener('click', async () => {
    try { if (token) await rpc('pokemon_logout', { p_token: token }); } catch (e) {}
    signedOut("You're signed out.");
  });

  (async () => {
    if (!token) { show('login'); return; }
    try {
      const me = await rpc('pokemon_me', { p_token: token });
      if (me && me.email) openBoard(me); else signedOut('');
    } catch (e) { signedOut(''); }
  })();
})();
