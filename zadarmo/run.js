/* Zadarmo vlakom — runs inside predaj.zssk.sk (bookmarklet). Checks which parts of one train trip
   still have the 0 € student ticket, by walking ZSSK's own purchase flow in a hidden same-origin iframe. */
(() => {
  if (location.host !== 'predaj.zssk.sk') { location.href = 'https://predaj.zssk.sk/search'; return; }
  if (window.__zadarmo) { window.__zadarmo.show(); return; }

  const AGES = [['203', 'Dieťa 16 - 17 r.'], ['204', 'Mladý 18 - 25 r.'], ['205', 'Dospelý 26 - 61 r.'], ['202', 'Dieťa 15 r.'], ['201', 'Dieťa 6 - 14 r.']];
  const DISCOUNTS = [['628', 'Žiak/študent 100%ZzC'], ['626', 'Žiak/štud.100%ZzC + ISIC zahr.']];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const saved = JSON.parse(localStorage.getItem('zadarmo') || '{}');
  const save = () => localStorage.setItem('zadarmo', JSON.stringify(st));
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const hp = new URLSearchParams(location.hash.slice(1));   // #from=..&to=..&date=..&time=.. from the landing page
  const st = {
    from: hp.get('from') || saved.from || '', to: hp.get('to') || saved.to || '',
    date: hp.get('date') || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: hp.get('time') || `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    age: saved.age || '204', discount: saved.discount || '628',
  };
  const autoRun = !!(hp.get('from') && hp.get('to'));
  if (autoRun) history.replaceState(null, '', location.pathname);

  // ---------- UI ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    .wrap{position:fixed;inset:0;background:#fff;color:#111;font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:auto}
    .in{max-width:640px;margin:0 auto;padding:52px 16px 60px}
    h1{font-size:22px;margin:4px 0 2px} .sub{color:#666;font-size:14px;margin-bottom:14px}
    label{display:block;font-size:13px;color:#555;margin:10px 0 3px}
    input,select{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#111}
    .row{display:flex;gap:10px} .row>div{flex:1}
    button{font:inherit;padding:11px 16px;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer;margin-top:14px}
    button.ghost{background:#eee;color:#111} button:disabled{opacity:.5}
    .x{position:fixed;top:10px;right:12px;margin:0;padding:6px 12px;background:#eee;color:#111}
    .conn{border:1px solid #ddd;border-radius:10px;padding:10px 12px;margin:8px 0;cursor:pointer;display:flex;justify-content:space-between;gap:8px}
    .conn:hover{border-color:#111} .conn.off{opacity:.45;cursor:default}
    .muted{color:#777;font-size:13px}
    .log{font-size:13px;color:#666;margin-top:10px;white-space:pre-wrap}
    .stops{margin:14px 0 0;padding:0;list-style:none}
    .stop{display:flex;gap:10px;align-items:center;font-size:15px}
    .stop b{font-weight:600;min-width:46px;font-variant-numeric:tabular-nums}
    .leg{margin-left:22px;border-left:5px solid #ddd;height:22px}
    .leg.free{border-color:#1a9c4a} .leg.paid{border-color:#d33} .leg.wip{border-color:#e8a400}
    .plan{margin-top:16px;border-top:1px solid #eee;padding-top:10px}
    .tk{padding:8px 10px;border-radius:8px;margin:6px 0}
    .tk.free{background:#e6f6ec} .tk.paid{background:#fdeaea}
    .err{color:#c00}
    a{color:#0645ad}
  </style>
  <div class="wrap"><button class="x" id="x">Zavrieť</button><div class="in" id="app"></div></div>`;
  const app = root.getElementById('app');
  root.getElementById('x').onclick = () => { host.style.display = 'none'; };
  window.__zadarmo = { show: () => { host.style.display = ''; } };

  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;left:-12000px;top:0;width:1100px;height:900px;border:0';
  document.documentElement.appendChild(fr);
  const doc = () => fr.contentDocument;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function formView(msg) {
    app.innerHTML = `<h1>Zadarmo vlakom</h1>
      <div class="sub">Vypredaný bezplatný lístok? Zistí, na ktorých úsekoch tvojho vlaku ešte je 0 € pre študentov.</div>
      <div class="row"><div><label>Odkiaľ</label><input id="from" list="sl" autocomplete="off"></div>
      <div><label>Kam</label><input id="to" list="sl" autocomplete="off"></div></div>
      <datalist id="sl"></datalist>
      <div class="row"><div><label>Dátum</label><input id="date" type="date"></div>
      <div><label>Čas</label><input id="time" type="time"></div></div>
      <details style="margin-top:8px"><summary class="muted">Vek a zľava</summary>
      <div class="row"><div><label>Vek</label><select id="age">${AGES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
      <div><label>Zľava</label><select id="discount">${DISCOUNTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div></div></details>
      <button id="go">Skontrolovať</button>
      <div class="muted" style="margin-top:8px">Počas kontroly nenakupuj na ZSSK v inom okne, kontrola na chvíľu používa ten istý košík.</div>
      <div class="log" id="log">${msg ? esc(msg) : ''}</div>`;
    for (const k of ['from', 'to', 'date', 'time', 'age', 'discount']) {
      const el = root.getElementById(k); el.value = st[k];
      el.oninput = el.onchange = () => { st[k] = el.value; save(); };
    }
    for (const k of ['from', 'to']) {
      const el = root.getElementById(k); let tm;
      el.addEventListener('input', () => {
        clearTimeout(tm);
        if (el.value.length < 2) return;
        tm = setTimeout(async () => {
          try {
            const r = await fetch('/autocompleteStations/' + encodeURIComponent(el.value));
            const list = JSON.parse(await r.text());
            root.getElementById('sl').innerHTML = list.map(s => `<option value="${esc(s)}">`).join('');
          } catch (e) { /* ignore */ }
        }, 200);
      });
    }
    root.getElementById('go').onclick = findTrains;
  }

  const log = t => { const el = root.getElementById('log'); if (el) el.textContent = t; };

  // ---------- ZSSK driving ----------
  async function until(pred, ms = 40000, what = 'odpoveď ZSSK') {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = pred(); if (v) return v; } catch (e) { /* page swapping */ }
      await sleep(250);
    }
    throw new Error('Nedočkal som sa: ' + what);
  }
  async function navigate(action) {
    const old = fr.contentDocument;
    action();
    await until(() => { const d = fr.contentDocument; return d && d !== old && d.readyState !== 'loading' && d.location.href !== 'about:blank' && d.body; }, 45000, 'načítanie stránky');
    await sleep(300);
  }
  const pageText = () => norm(doc().body && doc().body.innerText);
  const soldOut = () => /vypredan/i.test(pageText());
  const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${+d}. ${+m}. ${y}`; };

  async function search(from, to, time) {
    await navigate(() => { fr.src = '/search'; });
    const f = await until(() => doc().querySelector('#searchParamForm'), 40000, 'vyhľadávací formulár');
    f.fromInput.value = from; f.toInput.value = to;
    f.departDate.value = fmtDate(st.date); f.departTime.value = time;
    const ret = f.querySelector('[name=returnTicket]'); if (ret) ret.checked = false;
    const direct = f.querySelector('[name=TrainSearchFormDirect]'); if (direct) direct.checked = true;
    // results arrive by navigation or by JSF partial update; mark old results so we wait for fresh ones
    doc().querySelectorAll('.connection-group').forEach(g => g.dataset.zdold = '1');
    const before = doc();
    f.querySelector('[name=actionSearchConnectionButton]').click();
    await until(() => doc() && doc().readyState !== 'loading' &&
      (doc().querySelector('.connection-group:not([data-zdold])') || (doc() !== before && /nenašl|Nebolo nájdené|neexistuje/i.test(pageText()))), 40000, 'výsledky');
    await sleep(300);
    return [...doc().querySelectorAll('.connection-group')].map(g => {
      const legs = [...g.querySelectorAll('.connectionItem .table-timetable')].map(t => {
        const th = [...t.querySelectorAll('th')].map(x => norm(x.textContent));
        const ss = [...t.querySelectorAll('.trainStop')].map(x => norm(x.textContent));
        return { dep: th[0], arr: th[1], from: ss[0], to: ss[1], train: norm(t.querySelector('.trainNumber')?.textContent) };
      });
      return { g, legs };
    });
  }

  async function stopsOf(g) {
    let lis = g.querySelectorAll('ul.timeline li .timeline-station');
    if (!lis.length) { g.querySelector('.searchConnectionCart')?.click(); await until(() => g.querySelectorAll('ul.timeline li .timeline-station').length, 15000, 'zoznam staníc'); }
    return [...g.querySelectorAll('ul.timeline li')].filter(li => li.querySelector('.timeline-station'))
      .map(li => ({ time: norm(li.querySelector('.timeline-time')?.textContent), name: norm(li.querySelector('.timeline-station').textContent) }));
  }

  async function setSelect(cy, id) {
    const inp = () => doc().querySelector(`[data-cy="${cy}"] input`);
    await until(inp, 20000, cy);
    if (inp().value === id) return;
    const li = doc().querySelector(`[data-cy="${cy}"] li[data-age-category-id="${id}"], [data-cy="${cy}"] li[data-discount-type-id="${id}"]`);
    if (!li) throw new Error('ZSSK neponúka voľbu ' + id);
    const i = inp(); i.value = id;
    i.dispatchEvent(new fr.contentWindow.Event('change', { bubbles: true }));
    await until(() => inp() && inp() !== i && inp().value === id, 20000, 'zmena cestujúceho').catch(async () => { await sleep(1500); });
    await sleep(500);
  }

  // One price check for train `train` from stop a to stop b. Returns {status:'free'|'paid'|'soldout'|'error', price, msg}
  async function check(a, b, train) {
    const conns = await search(a.name, b.name, a.time);
    const c = conns.find(c => c.legs.length === 1 && c.legs[0].train === train && c.legs[0].dep === a.time)
      || conns.find(c => c.legs.length === 1 && c.legs[0].train === train);
    if (!c) return { status: 'error', msg: 'vlak sa v ponuke nenašiel' };
    const buy = () => [...c.g.querySelectorAll('a')].find(x => norm(x.textContent) === 'Kúpiť lístok');
    if (!buy()) { c.g.querySelector('.searchConnectionCart')?.click(); await until(buy, 15000, 'tlačidlo Kúpiť'); }
    await navigate(() => buy().click());
    await until(() => doc().querySelector('[data-cy="ageCategory-0"]') || soldOut(), 40000, 'voľba cestujúcich');
    if (soldOut()) return { status: 'soldout' };
    await setSelect('ageCategory-0', st.age);
    await setSelect('discountType-0', st.discount);
    const cont = () => [...doc().querySelectorAll('a')].filter(x => norm(x.textContent) === 'Pokračovať' && x.offsetParent).pop();
    const errBox = () => [...doc().querySelectorAll('#errorMessageContainer .error-box, .error-box')].find(e => e.offsetParent && norm(e.textContent));
    await until(cont, 15000, 'Pokračovať');
    await navigate(() => cont().click());
    await until(() => soldOut() || errBox() || (/Celková suma/.test(pageText()) && cont()), 45000, 'ponuka lístkov');
    if (soldOut()) return { status: 'soldout' };
    if (errBox()) return { status: 'error', msg: norm(errBox().textContent).slice(0, 160) };
    const m = pageText().match(/Celková suma\s*([\d.,]+)\s*€/);
    const price = m ? parseFloat(m[1].replace(',', '.')) : null;
    // ZSSK only reveals a sold-out 100%ZzC quota when you continue past the offer page
    const old = doc();
    cont().click();
    await until(() => soldOut() || errBox() || (doc() !== old && doc().body && doc().readyState !== 'loading' && doc().location.pathname !== '/offer'), 45000, 'krok po ponuke');
    await sleep(500);
    if (soldOut()) return { status: 'soldout' };
    if (errBox()) return { status: 'error', msg: norm(errBox().textContent).slice(0, 160) };
    if (doc().location.pathname === '/cart') await removeFromCart(a, b, train);
    return { status: 'free', price };
  }

  // Continuing past the offer on a train without compulsory reservation puts the ticket in the cart
  // (holding a free seat for 15 min). Take ours straight back out so nobody else loses it.
  async function removeFromCart(a, b, train) {
    for (let k = 0; k < 4; k++) {
      const btn = [...doc().querySelectorAll('[id$=":deleteButton"]')].find(x => {
        for (let p = x, i = 0; p && i < 10; p = p.parentElement, i++) {
          const t = p.textContent;
          if (t.includes(train) && t.includes(a.name) && t.includes(b.name)) return true;
        }
        return false;
      });
      if (!btn) return;
      const old = doc();
      btn.click();
      await until(() => doc() !== old && doc().body && doc().readyState !== 'loading', 30000, 'odstránenie z košíka');
      await sleep(500);
    }
  }

  // ---------- flow ----------
  // Station names must be ZSSK's exact ones; take the best autocomplete hit for whatever was typed.
  const fold = x => norm(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  async function resolveStation(name) {
    try {
      const list = JSON.parse(await (await fetch('/autocompleteStations/' + encodeURIComponent(name))).text());
      return list.find(x => fold(x) === fold(name)) || list[0] || name;
    } catch (e) { return name; }
  }

  async function findTrains() {
    if (!st.from || !st.to) return log('Vyplň Odkiaľ a Kam.');
    const btn = root.getElementById('go'); btn.disabled = true;
    log('Hľadám najbližší vlak…');
    try {
      const [from, to] = await Promise.all([resolveStation(st.from), resolveStation(st.to)]);
      const conns = await search(from, to, st.time);
      // results start at the chosen time, so the first direct one is the closest departure
      const c = conns.find(c => c.legs.length === 1);
      if (!c) { log(conns.length ? 'Najbližšie spojenia sú len s prestupom, skús iný čas.' : 'ZSSK nič nenašla. Skontroluj stanice.'); return; }
      analyze(c);
    } catch (e) { log('Chyba: ' + e.message); }
    finally { if (btn.isConnected) btn.disabled = false; }
  }

  async function analyze(c) {
    const train = c.legs[0].train;
    app.innerHTML = `<h1>${esc(c.legs[0].from)} → ${esc(c.legs[0].to)}</h1><div class="sub">${esc(train)}, odchod ${esc(c.legs[0].dep)}, ${esc(fmtDate(st.date))}</div>
      <div class="log" id="log">Načítavam stanice…</div><ul class="stops" id="stops"></ul><div class="plan" id="plan"></div>
      <button class="ghost" id="back">Späť</button>`;
    root.getElementById('back').onclick = () => { stop = true; formView(); };
    let stop = false;
    let S;
    try { S = await stopsOf(c.g); } catch (e) { return log('Chyba: ' + e.message); }
    const n = S.length - 1;
    const leg = Array(n).fill('');        // '', 'wip', 'free', 'paid'
    const tickets = [];
    const draw = () => {
      root.getElementById('stops').innerHTML = S.map((s, i) => `<li class="stop"><b>${esc(s.time)}</b>${esc(s.name)}</li>` +
        (i < n ? `<li class="leg ${leg[i]}"></li>` : '')).join('');
      root.getElementById('plan').innerHTML = tickets.length ? '<b>Čo kúpiť:</b>' + tickets.map(t =>
        `<div class="tk ${t.free ? 'free' : 'paid'}">${t.free ? 'Zadarmo' + (t.price ? ` (+${t.price.toFixed(2)} € miestenka)` : '') : 'Vypredané, kúp platený študentský'}: ${esc(S[t.a].name)} → ${esc(S[t.b].name)}</div>`).join('') : '';
    };
    draw();
    const cache = {};
    let calls = 0;
    const isFree = async (a, b) => {
      const k = a + '-' + b;
      if (!(k in cache)) {
        if (stop) throw new Error('zastavené');
        for (let x = a; x < b; x++) if (!leg[x]) leg[x] = 'wip';
        draw();
        log(`Kontrolujem ${S[a].name} → ${S[b].name}… (${++calls}. kontrola)`);
        let r = await check(S[a], S[b], train);
        if (r.status === 'error') { await sleep(1500); r = await check(S[a], S[b], train); }
        if (r.status === 'error') throw new Error(`${S[a].name} → ${S[b].name}: ${r.msg}`);
        cache[k] = r; (window.__zadarmo.log = window.__zadarmo.log || []).push([S[a].name, S[b].name, r]);
        for (let x = a; x < b; x++) if (leg[x] === 'wip') leg[x] = '';
      }
      return cache[k];
    };
    try {
      let i = 0;
      while (i < n) {
        const full = await isFree(i, n);
        if (full.status === 'free') { for (let x = i; x < n; x++) leg[x] = 'free'; tickets.push({ a: i, b: n, free: true, price: full.price }); i = n; break; }
        // binary search the farthest stop j with a free ticket i→j
        let lo = i, hi = n; // i→lo free (lo=i trivially), i→hi not free
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if ((await isFree(i, mid)).status === 'free') lo = mid; else hi = mid;
        }
        if (lo > i) { for (let x = i; x < lo; x++) leg[x] = 'free'; tickets.push({ a: i, b: lo, free: true, price: cache[i + '-' + lo].price }); i = lo; }
        else {
          if (!cache[i + '-' + (i + 1)]) await isFree(i, i + 1);
          leg[i] = 'paid';
          const prev = tickets[tickets.length - 1];
          if (prev && !prev.free && prev.b === i) prev.b = i + 1;
          else tickets.push({ a: i, b: i + 1, free: false });
          i++;
        }
        draw();
      }
      draw();
      const allFree = tickets.length === 1 && tickets[0].free;
      log(allFree ? 'Celý úsek je ešte zadarmo 🎉 Kúp ho normálne na ZSSK.' :
        `Hotovo (${calls} kontrol). Zelené úseky kúp ako bezplatné lístky, na červené platený študentský. Kúpiš ich na ZSSK, táto stránka nič nekupuje.`);
    } catch (e) { draw(); log((stop ? '' : 'Chyba: ') + e.message); }
  }

  formView();
  if (autoRun) findTrains();
})();
