// Sign-in and data loading for the shared Pokémon buy board.
// Only emails on the approved list in Supabase can read any data.
(() => {
  const SUPABASE_URL = 'https://gnsrcsuyljrirwmvvcmh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vzx44rpaqGYbQYxBhhMJdA_kT5LzPA7';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (s) => document.querySelector(s);
  const views = { login: $('#login'), board: $('#board'), denied: $('#denied') };
  const show = (name) => {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('#account').hidden = name === 'login';
  };

  const COLS = {
    sealed: ['id', 'set', 'lang', 'product', 'packs', 'msrp', 'market', 'asOf', 'trend', 'sentiment', 'opinion', 'source', 'releaseDate', 'printRisk', 'channel', 'supply'],
    history: ['date', 'id', 'item', 'market', 'source'],
    chase: ['card', 'set', 'lang', 'price', 'trend', 'note', 'source'],
    pulls: ['set', 'lang', 'tier', 'oneIn', 'basis'],
    releases: ['id', 'date', 'lang', 'product', 'type', 'note', 'msrp', 'storeFit', 'source'],
  };

  async function fetchAll(table, select, order, filter) {
    const size = 1000;
    let from = 0;
    let out = [];
    for (;;) {
      let q = sb.from(table).select(select);
      if (filter) q = filter(q);
      for (const [col, asc] of order) q = q.order(col, { ascending: asc, nullsFirst: false });
      const { data, error } = await q.range(from, from + size - 1);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < size) break;
      from += size;
    }
    return out;
  }

  async function latestChaseDate() {
    const { data, error } = await sb.from('chase_cards').select('as_of').order('as_of', { ascending: false }).limit(1);
    if (error) throw error;
    return data[0] ? data[0].as_of : null;
  }

  const LOADERS = {
    sealed: () => fetchAll('products',
      'id, set:set_name, lang, product, packs, msrp, market, asOf:as_of, trend, sentiment, opinion, source, releaseDate:release_date, printRisk:print_risk, channel, supply',
      [['release_date', false], ['id', true]]),
    history: () => fetchAll('price_history', 'date, id:product_id, item, market, source', [['date', true], ['product_id', true]]),
    chase: async () => {
      const d = await latestChaseDate();
      if (!d) return [];
      return fetchAll('chase_cards', 'card, set:set_name, lang, price, trend, note, source', [['price', false]], (q) => q.eq('as_of', d));
    },
    pulls: () => fetchAll('pull_rates', 'set:set_name, lang, tier, oneIn:one_in, basis', [['set_name', true], ['one_in', true]]),
    releases: () => fetchAll('releases', 'id, date:release_date, lang, product, type, note, msrp, storeFit:store_fit, source', [['release_date', true], ['id', true]]),
  };

  const num = (v) => (v == null || v === '' ? null : Number(v));
  const NUMERIC = { sealed: ['msrp', 'market'], history: ['market'], chase: ['price'], releases: ['msrp'] };

  async function loadData() {
    for (const id of Object.keys(LOADERS)) window.dash._loading(id);
    window.dash._emit();
    const results = await Promise.allSettled(Object.entries(LOADERS).map(async ([id, fn]) => [id, await fn()]));
    let products = null;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [id, rows] = r.value;
        for (const k of NUMERIC[id] || []) for (const row of rows) row[k] = num(row[k]);
        window.dash._set(id, rows, COLS[id]);
        if (id === 'sealed') products = rows;
      } else {
        console.error(r.reason);
      }
    }
    for (const [i, id] of Object.keys(LOADERS).entries()) {
      if (results[i].status === 'rejected') window.dash._fail(id, String(results[i].reason && results[i].reason.message || results[i].reason));
    }
    if (products && products.length === 0) { show('denied'); return; }
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
  }
  window.__reloadData = loadData;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim().toLowerCase();
    const msg = $('#login-msg');
    if (!email) return;
    $('#send').disabled = true;
    msg.textContent = 'Sending...';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    $('#send').disabled = false;
    msg.textContent = error
      ? 'Could not send the link: ' + error.message
      : 'Check your email for a sign-in link from Supabase. Open it on this device.';
  });

  $('#signout').addEventListener('click', async () => {
    await sb.auth.signOut();
    show('login');
  });

  let loadedFor = null;
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) {
      $('#who').textContent = session.user.email || '';
      if (loadedFor !== session.user.id) {
        loadedFor = session.user.id;
        loadData();
      }
    } else {
      loadedFor = null;
      show('login');
    }
  });
})();
