// A small stand-in for the Claude dashboard runtime, so the buy board's
// scripts run unchanged on a normal web page. Data is filled in by app.js.
window.dash = (() => {
  const sources = {};
  const calcs = {};
  const subs = [];
  let cache = {};
  let params = {};

  const empty = (status, message) => ({
    status, message: message || '', data: [], rows: [], columns: [], meta: [], refreshing: false,
  });

  function wrap(rows, columns) {
    return { status: 'ok', message: '', data: rows, rows, columns: columns || [], meta: [], refreshing: false, value: rows };
  }

  function data(id) {
    if (cache[id]) return cache[id];
    let out;
    if (calcs[id]) {
      const c = calcs[id];
      const ins = (c.inputs || []).map((i) => data(i));
      const notOk = ins.find((d) => d.status !== 'ok');
      if (notOk) {
        out = empty(notOk.status, notOk.message);
      } else {
        try {
          const res = c.fn(...ins.map((d) => d.data));
          const rows = Array.isArray(res) ? res : res;
          out = wrap(rows, Array.isArray(rows) && rows[0] ? Object.keys(rows[0]) : []);
        } catch (e) {
          console.error('calc ' + id + ' failed', e);
          out = empty('error', String(e && e.message || e));
        }
      }
    } else {
      out = sources[id] || empty('loading');
    }
    cache[id] = out;
    return out;
  }

  function emit() {
    cache = {};
    for (const fn of subs) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  let t = null;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    clearTimeout(t);
    t = setTimeout(emit, 150);
  });

  return {
    data,
    onData(fn) { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    calc(id, opts) { calcs[id] = opts; cache = {}; },
    loader() {},
    colors: ['#3b6fb6', '#d9822b', '#2f9e77', '#c8475a', '#7d5bbe', '#8a6d3b', '#d16ba5', '#5f7a8a'],
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) {} },
    params() { return params; },
    setParams(p) { Object.assign(params, p); emit(); },
    resetParams() { params = {}; emit(); },
    refresh() { if (window.__reloadData) window.__reloadData(); },
    _set(id, rows, columns) { sources[id] = wrap(rows, columns); },
    _fail(id, message) { sources[id] = empty('error', message); },
    _loading(id) { sources[id] = empty('loading'); },
    _emit: emit,
  };
})();
