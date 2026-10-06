// Morfi — interfaz
(function () {
  const L = window.Logic, Store = window.Store, CFG = window.MORFI_CONFIG;
  const GOAL = CFG.WATER_GOAL_ML || 2000;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const low = s => String(s || "").toLowerCase();
  const DIA_TITLE = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const CATS = ["Verdura", "Fruta", "Proteína", "Lácteo/Huevo", "Harina/Cereal", "Legumbre", "Almacén", "Congelado"];
  const TIEMPOS = [["rápida (-15 min)", "Rápida (-15 min)"], ["media hora", "Media"], ["más de 30 min", "Elaborada"]];
  const ESTADOS = ["Quiero probar", "Probada", "Se queda", "No va"];
  const WHO = [["mamá", "Mamá"], ["yo", "Yo"], ["comprado", "Comprado"]];
  const WHO_LABEL = { Mamá: "de mamá", Yo: "hecha por mí", Comprado: "comprado" };
  const TABS = [["hoy", "today", "hoy"], ["qc", "restaurant", "¿qué como?"], ["rec", "menu_book", "recetas"], ["des", "kitchen", "despensa"], ["frz", "ac_unit", "freezer"]];

  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  const S = {
    tab: ls.get("morfi.tab", "hoy"), today: L.ymd(new Date()), mode: null, more: false,
    q: "", filter: "Todas", desView: "list", checked: new Set(), bannerOff: ls.get("morfi.bannerOff", false),
    waterHist: [], custom: "", workBackup: null,
    frz: { name: "", n: 2, who: "Yo", g: [] },
    sheet: null, recText: {}, nr: null, menuText: "", menuRows: null,
  };

  /* ---------- today row ---------- */
  const isWeekend = () => [0, 6].includes(L.parseYmd(S.today).getDay());
  function todayRow() { return Store.data.dias.find(d => d.fecha === S.today); }
  function draft() {
    const r = todayRow();
    return r ? r : { id: null, fecha: S.today, almuerzo: "", cena: "", gA: [], gC: [], agua: 0, casa: isWeekend() };
  }
  function saveDay(patch) {
    const r = todayRow();
    if (r) Store.update("dias", r.id, patch);
    else Store.create("dias", { fecha: S.today, dia: DIA_TITLE[L.parseYmd(S.today).getDay()], almuerzo: "", cena: "", gA: [], gC: [], agua: 0, casa: isWeekend(), ...patch });
  }
  function saveDayFor(dateS, patch) {
    const r = Store.data.dias.find(d => d.fecha === dateS);
    if (r) Store.update("dias", r.id, patch);
    else Store.create("dias", { fecha: dateS, dia: DIA_TITLE[L.parseYmd(dateS).getDay()], almuerzo: "", cena: "", gA: [], gC: [], agua: 0, casa: false, ...patch });
  }

  /* ---------- small renderers ---------- */
  const dots = (gs, cls = "") => `<span class="dots ${cls}">${(gs || []).map(g => `<i style="--c:${L.GCOLOR[g] || "#fff"}" title="${esc(g)}"></i>`).join("")}</span>`;
  const chips = (sel, set, extra = "") => `<div class="chips ${extra}">${L.GROUPS.map(g => `<button class="chip" data-act="chip" data-set="${set}" data-g="${g}" aria-pressed="${sel.includes(g)}"><i style="--c:${L.GCOLOR[g]}"></i>${g}</button>`).join("")}</div>`;
  const tagFor = t => t ? `<span class="tag lg ${t.kind}">${esc(t.text)}</span>` : "";

  function toast(msg) {
    const root = $("#toast-root"); root.innerHTML = `<div class="toast" role="status"><i></i>${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => (root.innerHTML = ""), 2400);
  }
  Store.onReject = e => toast("notion no aceptó un cambio. revisá la conexión con las bases.");

  /* ---------- header + tabs ---------- */
  function renderHeader() {
    const d = L.parseYmd(S.today);
    $("#today").textContent = `${L.DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    const st = $("#status"); const off = Store.status === "off" || !CFG.WORKER_URL;
    st.className = "status " + (off ? "off" : Store.status === "saving" || Store.status === "loading" ? "saving" : "");
    st.lastElementChild.textContent = off ? "sin conexión" : Store.status === "loading" ? "cargando…" : Store.status === "saving" || Store.queue.length ? "guardando…" : "notion al día";
  }
  function renderTabs() {
    $("#tabs").innerHTML = TABS.map(([id, icon, label]) => `<button data-act="tab" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ""}><span class="ms">${icon}</span><b>${label}</b></button>`).join("");
  }

  /* ---------- views ---------- */
  function offlineBanner() {
    if (!CFG.WORKER_URL) return `<div class="banner"><p>falta conectar morfi con tu worker de notion. mientras tanto, lo que cargues queda guardado en el celu.</p></div>`;
    if (Store.status !== "off") return "";
    return `<div class="banner"><p>notion no respondió. probá de nuevo en un ratito. lo que cargues queda guardado en el celu.</p><button class="btn ink sm press" data-act="retry">reintentar</button></div>`;
  }
  function skeleton() {
    return `<div class="sk" style="width:200px;height:96px;border-radius:20px"></div><div class="sk" style="height:28px;width:60%;border-radius:99px"></div>
      <div class="grid2"><div class="sk" style="height:96px"></div><div class="sk" style="height:96px"></div></div><div class="sk" style="height:230px"></div><div class="sk" style="height:180px"></div>`;
  }

  function viewHoy() {
    const d = draft(), w = d.agua || 0, isWork = !d.casa;
    const week = L.weekOf(S.today, Store.data.dias, d);
    const frz = [...Store.data.freezer].filter(f => f.porciones > 0).sort((a, b) => (b.fav - a.fav) || (b.porciones - a.porciones))[0];
    const vegLine = `verdura en ${week.veg} de ${week.elapsed} ${week.elapsed === 1 ? "día" : "días"}.${week.veg < week.elapsed ? " una cena con verdura suma." : ""}`;
    return `
    <div class="xxl">hoy.</div>
    <section style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px" aria-label="agua">
      <div class="label">agua de hoy.</div>
      <div class="water-num"><b id="w-num">${L.fmtL(w)}</b><span>litros<br>de ${GOAL / 1000}.</span></div>
      <div class="body" id="w-left">${L.waterLeft(w, GOAL)}</div>
      <div class="track"><i id="w-bar" style="width:${Math.min(100, w / GOAL * 100)}%"></i></div>
      <div class="grid2">
        <button class="quick press" data-act="water" data-ml="850"><span>termo</span><b>+850</b></button>
        <button class="quick press" data-act="water" data-ml="550"><span>botella</span><b>+550</b></button>
      </div>
      <form class="row nowrap" data-form="water">
        <button type="button" class="btn on-blue press" data-act="water" data-ml="250" style="flex:none">vaso +250</button>
        <input class="input-ghost" id="w-custom" inputmode="numeric" pattern="[0-9]*" placeholder="otra (ml)" aria-label="otra cantidad en ml" value="${esc(S.custom)}">
        <button type="submit" class="btn white icon press" aria-label="sumar">add</button>
        <button type="button" class="btn on-blue icon press" data-act="undo" aria-label="deshacer" ${S.waterHist.length ? "" : "disabled"}>undo</button>
      </form>
    </section>

    <section class="card on-card" aria-label="almuerzo">
      <span class="card-title">almuerzo.</span>
      <div class="seg on-card" role="group" aria-label="dónde almorzás">
        <button data-act="place" data-v="work" aria-pressed="${isWork}">en el trabajo</button>
        <button data-act="place" data-v="home" aria-pressed="${!isWork}">en casa</button>
      </div>
      ${isWork ? `<div class="meta">del menú de la semana.</div>` : ""}
      <input class="input" id="in-almuerzo" placeholder="¿qué almorzaste?" value="${esc(d.almuerzo)}" aria-label="almuerzo" enterkeyhint="done">
      ${chips(d.gA, "gA")}
      ${isWork ? `<button class="btn on-card press" data-act="menu">cargar el menú de la semana</button>` : ""}
      ${!isWork && !d.almuerzo ? `<button class="btn ink lg press" data-act="ask" data-meal="almuerzo">ayudame a elegir el almuerzo.</button>` : ""}
    </section>

    <section class="card on-card" aria-label="cena">
      <span class="card-title">cena.</span>
      <input class="input" id="in-cena" placeholder="¿qué cenaste?" value="${esc(d.cena)}" aria-label="cena" enterkeyhint="done">
      ${chips(d.gC, "gC")}
      ${!d.cena ? `
        ${frz ? `<div class="frz-short"><div class="n">${frz.porciones}</div><div style="display:grid;gap:1px;min-width:0"><div class="k">en el freezer.</div><div class="p">${esc(low(frz.plato))}</div></div><button class="btn ink sm press" data-act="eat" data-kind="freezer" data-id="${frz.id}" data-meal="cena">la ceno</button></div>` : ""}
        <button class="btn accent big press" data-act="ask" data-meal="cena">¿qué ceno?</button>` : ""}
    </section>

    <section class="block" aria-label="tu semana">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="block-title">tu semana.</span><span class="meta">${week.range}</span></div>
      <div class="week">${week.days.map(x => `<div class="day ${x.today ? "today" : ""}"><span>${x.letter}</span><div class="wbar" title="${x.agua} ml"><i style="height:${Math.min(100, x.agua / GOAL * 100)}%"></i></div><div class="gd"><i style="${x.veg ? "background:var(--g-verdura)" : ""}"></i><i style="${x.prot ? "background:var(--g-proteina)" : ""}"></i></div></div>`).join("")}</div>
      <div class="metrics">
        <div><div>verdura</div><b>${week.veg}/7</b></div>
        <div><div>proteína</div><b>${week.prot}/7</b></div>
        <div><div>legumbres, extra</div><b>${week.leg}</b></div>
        <div><div>agua, promedio</div><b>${week.aguaAvg ? L.fmtL(week.aguaAvg, 1) + " L" : "–"}</b></div>
      </div>
      <div class="body" style="font-size:14px">${vegLine} No hace falta tener todo al tope.</div>
    </section>
    <div class="foot">se guarda solo en notion.</div>`;
  }

  function currentMode() { if (S.mode) return S.mode; const d = draft(); return d.casa && !d.almuerzo && new Date().getHours() < 16 ? "almuerzo" : "cena"; }
  function suggestions(meal) {
    return L.suggest({ meal, today: S.today, draft: draft(), dias: Store.data.dias, recetas: Store.data.recetas, freezer: Store.data.freezer, despensa: Store.data.despensa });
  }
  function viewQc() {
    const meal = currentMode(), d = draft(), isCena = meal === "cena";
    const yday = new Date(L.parseYmd(S.today)); yday.setDate(yday.getDate() - 1);
    const yRow = Store.data.dias.find(x => x.fecha === L.ymd(yday));
    const ctx = isCena ? (d.almuerzo ? [`hoy almorzaste ${low(d.almuerzo)}`, d.gA] : ["todavía no cargaste el almuerzo de hoy", []])
      : (yRow && yRow.cena ? [`anoche cenaste ${low(yRow.cena)}`, yRow.gC] : ["no hay cena de anoche cargada", []]);
    const loaded = isCena ? d.cena : d.almuerzo;
    const all = suggestions(meal), top = all.slice(0, S.more ? 8 : 3);
    const action = isCena ? "la ceno" : "la almuerzo";
    let html = `<div class="screen-title">${isCena ? "¿qué ceno hoy?" : "¿qué almuerzo?"}</div>
      <div class="seg on-bg" role="group" aria-label="para qué comida"><button data-act="mode" data-v="almuerzo" aria-pressed="${!isCena}">almuerzo</button><button data-act="mode" data-v="cena" aria-pressed="${isCena}">cena</button></div>
      ${loaded ? `<div class="loaded">ya cargaste: <b>${esc(low(loaded))}</b>. si elegís otra, la cambio.</div>` : ""}
      <div class="ctx"><span>${esc(ctx[0])}.</span>${dots(ctx[1], "md")}</div>`;
    if (!top.length) return html + `<div class="empty-box"><div class="t">no se me ocurre nada.</div><div class="body">con lo que hay en casa no llego a armar una sugerencia. marcá qué tenés en la despensa o sumá una receta.</div><div class="row"><button class="btn white press" data-act="tab" data-tab="des">ir a despensa</button><button class="btn on-blue press" data-act="new-rec">+ nueva receta</button></div></div>`;
    const [f, ...others] = top;
    const missing = c => c.stock && (c.stock.falta.length || c.stock.sinDato.length);
    html += `<article class="feat">
      <div class="kick">mi<br>recomendación.</div>
      <div class="name">${esc(f.nombre)}.</div>
      <div class="row" style="gap:8px">${dots(f.grupos, "lg")}${tagFor(f.tag)}<span class="meta">${esc(f.time || "")}</span></div>
      <div class="why">${f.why.slice(0, 3).map(r => `<div>— ${esc(r)}.</div>`).join("")}</div>
      <button class="btn ink big press" data-act="eat" data-kind="${f.kind}" data-id="${f.ref.id}" data-meal="${meal}">${action}.</button>
      <div class="row nowrap"><button class="btn on-card grow press" data-act="how" data-kind="${f.kind}" data-id="${f.ref.id}">¿cómo se hace?</button>${missing(f) ? `<button class="btn on-card grow press" data-act="to-list" data-id="${f.ref.id}">sumar a compras</button>` : ""}</div>
    </article>`;
    others.forEach((o, i) => {
      html += `<div class="other"><span class="num">0${i + 2}.</span><div style="display:grid;gap:8px;align-content:start;min-width:0">
        <div class="name">${esc(o.nombre)}.</div>
        <div class="row">${dots(o.grupos)}${o.tag ? `<span class="tag ${o.tag.kind}">${esc(o.tag.text)}</span>` : ""}<span class="meta" style="font-size:12px">${esc(o.time || "")}</span></div>
        <div class="reason">${esc(o.why[0])}.</div>
        <div class="row"><button class="btn white sm press" data-act="eat" data-kind="${o.kind}" data-id="${o.ref.id}" data-meal="${meal}" style="font-weight:800;font-size:15px">${action}.</button><button class="btn on-blue sm press" data-act="how" data-kind="${o.kind}" data-id="${o.ref.id}">¿cómo se hace?</button>${missing(o) ? `<button class="btn on-blue sm press" data-act="to-list" data-id="${o.ref.id}">sumar a compras</button>` : ""}</div>
      </div></div>`;
    });
    if (all.length > 3) html += `<button class="btn dashed press" data-act="more">${S.more ? "ver menos." : "ver más opciones."}</button>`;
    return html;
  }

  function recAviso(r) {
    if (r.detalle === "Incompleta") return { kind: "inc", text: "incompleta" };
    const st = L.stockOf(r, Object.fromEntries(Store.data.despensa.map(x => [x.id, x])));
    if (!st.total) return null;
    if (st.falta.length) return { kind: "miss", text: st.falta.length === 1 ? "falta 1" : `faltan ${st.falta.length}` };
    if (!st.sinDato.length) return { kind: "ok", text: "tenés todo" };
    return null;
  }
  function viewRec() {
    const all = Store.data.recetas, q = L.norm(S.q), f = S.filter;
    const list = all.filter(r => (f === "Todas" || (f === "Favoritas" ? r.fav : f === "Incompletas" ? r.detalle === "Incompleta" : f === "Sin clasificar" ? !r.estado : r.estado === f)) && (!q || L.norm(r.nombre).includes(q)))
      .sort((a, b) => (b.fav - a.fav) || a.nombre.localeCompare(b.nombre, "es"));
    return `<div class="screen-title t88" style="margin-left:-5px">recetas.</div>
      <div class="row nowrap"><label class="grow" style="display:flex;align-items:center;gap:8px;height:50px;border-radius:99px;background:#fff;color:var(--ink);padding:0 16px"><span class="ms" style="font-size:22px;opacity:.6">search</span><input id="in-q" value="${esc(S.q)}" placeholder="buscar receta" aria-label="buscar receta" style="flex:1;min-width:0;border:0;background:transparent;font:600 16px var(--font);color:var(--ink);outline:none" enterkeyhint="search"></label><button class="btn orange press" data-act="new-rec" style="height:50px;font-weight:800;font-size:16px">+ nueva</button></div>
      <div class="hscroll">${["Todas", "Sin clasificar", "Quiero probar", "Se queda", "Favoritas", "Incompletas"].map(x => `<button class="filter" data-act="filter" data-v="${x}" aria-pressed="${f === x}">${low(x)}</button>`).join("")}</div>
      <div class="meta">${list.length} de ${all.length} recetas</div>
      <div id="rec-list">${recList(list)}</div>`;
  }
  function recList(list) {
    if (!list.length) return `<div class="empty-line" style="border-top:1.5px solid var(--line)">no hay recetas acá. probá con otro filtro o cargá una nueva.</div>`;
    return `<div class="list">${list.map(r => { const av = recAviso(r); return `<div class="rrow">
      <button class="star" data-act="rec-fav" data-id="${r.id}" aria-pressed="${r.fav}" aria-label="favorita">star</button>
      <div style="display:grid;gap:6px;min-width:0"><button class="rname" data-act="how" data-kind="receta" data-id="${r.id}"><span>${esc(r.nombre)}</span><span class="ms">chevron_right</span></button>
      <div class="row">${dots(r.grupos)}<span class="tag outline">${esc(low(r.estado || "sin clasificar"))}</span>${av ? `<span class="tag ${av.kind}">${esc(av.text)}</span>` : ""}</div></div></div>`; }).join("")}</div>`;
  }

  function viewDes() {
    const shop = Store.data.despensa.filter(p => p.estado === "No tengo" || p.estado === "Poco").sort((a, b) => (b.salva - a.salva) || a.nombre.localeCompare(b.nombre, "es"));
    const isList = S.desView === "list";
    let html = `<div class="screen-title">despensa.</div>
      <div class="seg on-bg" role="group" aria-label="vista"><button data-act="desview" data-v="list" aria-pressed="${isList}" style="font-size:14px">lista de compras (${shop.length})</button><button data-act="desview" data-v="all" aria-pressed="${!isList}" style="font-size:14px">todo lo de casa</button></div>`;
    if (isList) {
      if (!shop.length) return html + `<div class="empty-line">la lista está vacía. cuando marques algo como «poco» o «no tengo», aparece acá.</div>`;
      const n = shop.filter(p => S.checked.has(p.id)).length;
      html += `<div class="list">${shop.map(p => { const c = S.checked.has(p.id); return `<button class="shop" data-act="check" data-id="${p.id}" aria-pressed="${c}"><span class="box">${c ? "check" : ""}</span><span style="display:grid;gap:2px;min-width:0"><span class="nm">${esc(p.nombre)}</span><span class="sub">${esc(low(p.cat || "otro"))} · ${p.estado === "Poco" ? "poco" : "no tengo"}</span></span>${p.salva ? `<span class="tag salva">salvavidas</span>` : "<span></span>"}</button>`; }).join("")}</div>`;
      if (n) html += `<button class="btn white press" data-act="bought" style="height:62px;font:800 22px var(--font);letter-spacing:-.04em">ya lo compré (${n}).</button>`;
      return html;
    }
    const sin = Store.data.despensa.filter(p => !p.estado).length;
    if (sin && !S.bannerOff) html += `<div class="banner pink"><p>te quedan <b>${sin} ${sin === 1 ? "ingrediente" : "ingredientes"} sin revisar</b>. marcalos de a poco, cuando estés en la cocina.</p><button class="btn icon icon44" data-act="banner-off" aria-label="cerrar" style="border:0;color:var(--ink)">close</button></div>`;
    html += `<form class="add-row" data-form="add-item"><input class="input" id="in-item" placeholder="sumar algo" aria-label="sumar algo" value="${esc(S.newItem || "")}"><select id="in-cat" aria-label="categoría">${CATS.map(c => `<option ${c === (S.newCat || "Verdura") ? "selected" : ""}>${c}</option>`).join("")}</select><button class="btn orange icon press" type="submit" aria-label="sumar" style="border:0">add</button></form>`;
    const groups = [...CATS, ""].map(cat => ({ cat: cat || "otro", items: Store.data.despensa.filter(p => (p.cat || "") === cat || (!cat && !CATS.includes(p.cat))).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) })).filter(g => g.items.length);
    html += groups.map(g => `<div class="list"><div class="cat-title">${esc(g.cat)}.</div>${g.items.map(p => `<div class="irow"><span>${esc(p.nombre)}</span><div class="stock" role="group" aria-label="${esc(p.nombre)}">${[["Tengo", "tengo", "tengo"], ["Poco", "poco", "poco"], ["No tengo", "no", "no tengo"]].map(([v, c, l]) => `<button class="${c}" data-act="stock" data-id="${p.id}" data-v="${v}" aria-pressed="${p.estado === v}">${l}</button>`).join("")}</div></div>`).join("")}</div>`).join("");
    return html;
  }

  function viewFrz() {
    const list = [...Store.data.freezer].sort((a, b) => ((b.porciones > 0) - (a.porciones > 0)) || (b.fav - a.fav) || a.plato.localeCompare(b.plato, "es"));
    const total = list.reduce((a, f) => a + (f.porciones || 0), 0), F = S.frz;
    return `<div class="screen-title t110">freezer.</div>
      <div class="body">${total} ${total === 1 ? "porción lista" : "porciones listas"} para comer.</div>
      ${!list.length ? `<div class="empty-box" style="border-radius:24px;padding:20px"><div class="body" style="font-size:16px">el freezer está vacío. cuando mamá te pase comida, cargala acá abajo y aparece en tus sugerencias.</div></div>` : ""}
      <div class="list">${list.map(f => `<div class="frow ${f.porciones ? "" : "zero"}">
        <button class="star" data-act="frz-fav" data-id="${f.id}" aria-pressed="${f.fav}" aria-label="favorito" style="margin:0">star</button>
        <div style="display:grid;gap:5px;min-width:0"><div class="nm">${esc(f.plato)}</div><div class="row">${dots(f.grupos)}<span class="meta" style="font-size:12px">${esc(WHO_LABEL[f.origen] || low(f.origen))}</span></div></div>
        <div class="counter"><button data-act="frz-n" data-id="${f.id}" data-d="-1" aria-label="una porción menos">remove</button><b>${f.porciones}</b><button data-act="frz-n" data-id="${f.id}" data-d="1" aria-label="una porción más">add</button></div></div>`).join("")}</div>
      <form class="card on-card" data-form="frz">
        <span class="card-title" style="font-size:40px;letter-spacing:-.07em;line-height:.8">sumar al freezer.</span>
        <input class="input" id="in-frz" placeholder="¿qué plato?" value="${esc(F.name)}" aria-label="plato">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span style="font:700 14px var(--font)">porciones</span><div class="counter"><button type="button" data-act="fz-n" data-d="-1" aria-label="menos">remove</button><b>${F.n}</b><button type="button" data-act="fz-n" data-d="1" aria-label="más">add</button></div></div>
        <div class="seg on-card" role="group" aria-label="de quién">${WHO.map(([l, v]) => `<button type="button" data-act="fz-who" data-v="${v}" aria-pressed="${F.who === v}">${l}</button>`).join("")}</div>
        ${chips(F.g, "fz")}
        <button class="btn ink press" type="submit" style="height:56px;font:800 20px var(--font);letter-spacing:-.03em">guardar en el freezer.</button>
      </form>`;
  }

  /* ---------- render ---------- */
  let pending = false;
  function render(force) {
    renderHeader(); renderTabs();
    const view = $("#view"), a = document.activeElement;
    if (!force && a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pending = true; return; }
    pending = false;
    const first = !Store.loadedAt && Store.status === "loading";
    let html = offlineBanner();
    if (first) html += skeleton();
    else html += ({ hoy: viewHoy, qc: viewQc, rec: viewRec, des: viewDes, frz: viewFrz }[S.tab] || viewHoy)();
    view.innerHTML = html;
  }
  document.addEventListener("focusout", () => setTimeout(() => { if (pending) render(); }, 0));
  Store.on(() => render());

  /* ---------- sheets ---------- */
  function openSheet(kind, data) { S.sheet = { kind, ...data }; renderSheet(); }
  function closeSheet() { S.sheet = null; $("#sheet-root").innerHTML = ""; }
  function renderSheet() {
    const sh = S.sheet; if (!sh) return closeSheet();
    const kicker = { r: "receta", n: "recetario", m: "almuerzo en el trabajo" }[sh.kind];
    const body = sh.kind === "r" ? sheetRecipe(sh) : sh.kind === "n" ? sheetNew() : sheetMenu();
    const prevScroll = $(".sheet .content")?.scrollTop || 0;
    $("#sheet-root").innerHTML = `<div class="scrim"><div class="ov" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${kicker}">
      <div class="grab"><i></i></div><div class="head"><span>${kicker}</span><button class="btn on-card sm" data-act="close">cerrar</button></div>
      <div class="content">${body}</div></div></div>`;
    const c = $(".sheet .content"); if (c) c.scrollTop = prevScroll;
  }

  function videoLabel(u) { return /instagram/.test(u) ? "instagram" : /tiktok/.test(u) ? "tiktok" : /youtu/.test(u) ? "youtube" : "la fuente"; }
  function sheetRecipe(sh) {
    if (sh.freezerId) {
      const f = Store.find("freezer", sh.freezerId); if (!f) return "";
      return `<div class="meta">del freezer · 10 min</div><div class="big-title">${esc(f.plato)}.</div>
        <div class="row">${f.grupos.map(g => `<span class="gchip"><i style="--c:${L.GCOLOR[g]}"></i>${low(g)}</span>`).join("")}</div>
        <div class="field-label">cómo se hace</div><div class="howto"><div class="txt">1. sacarlo del freezer y calentarlo en el micro o en una olla, revolviendo a la mitad.\n2. si lleva fideos o arroz, hervirlos mientras.\n3. listo. quedan ${f.porciones} ${f.porciones === 1 ? "porción" : "porciones"}.</div></div>
        <button class="btn ink xl press" data-act="eat" data-kind="freezer" data-id="${f.id}" data-meal="${sh.meal || "cena"}">${sh.meal === "almuerzo" ? "la almuerzo hoy." : "la ceno hoy."}</button>`;
    }
    const r = Store.find("recetas", sh.id); if (!r) return "";
    const desMap = Object.fromEntries(Store.data.despensa.map(x => [x.id, x]));
    const ings = r.ing.map(id => desMap[id]).filter(Boolean);
    const cached = S.recText[r.id];
    const fuente = /^https?:/.test(r.fuente) ? r.fuente : (cached?.links || []).find(u => /instagram|tiktok|youtu/.test(u)) || (cached?.links || [])[0];
    const text = cached ? (cached.error ? "no pude traer la receta de notion. probá de nuevo con conexión." : cached.text || "esta receta todavía no tiene el paso a paso. completala en notion.") : "trayendo la receta de notion…";
    const stCls = { "Tengo": "st-tengo", "Poco": "st-poco", "No tengo": "st-no" };
    const meal = sh.meal || "cena";
    return `<div class="meta">${esc(low(r.cat || "recetario"))}${r.tiempo ? " · " + esc(low(r.tiempo)) : ""}</div>
      <div class="big-title">${esc(r.nombre)}.</div>
      <div class="row">${r.grupos.map(g => `<span class="gchip"><i style="--c:${L.GCOLOR[g]}"></i>${low(g)}</span>`).join("")}</div>
      <div class="field-label">¿cómo me fue?</div>
      <div class="row">${ESTADOS.map(e => `<button class="pill" data-act="rec-estado" data-id="${r.id}" data-v="${e}" aria-pressed="${r.estado === e}">${low(e)}</button>`).join("")}<button class="pill fav" data-act="rec-fav" data-id="${r.id}" aria-pressed="${r.fav}"><span class="ms fill" style="font-size:20px">star</span>favorita</button></div>
      ${ings.length ? `<div class="field-label">ingredientes clave</div><div class="list">${ings.map(i => `<div class="ing"><span>${esc(i.nombre)}</span><span class="tag ${stCls[i.estado] || "st-none"}">${esc(i.estado ? low(i.estado) : "sin revisar")}</span></div>`).join("")}</div>` : ""}
      <div class="field-label">cómo se hace</div>
      <div class="howto"><div class="txt">${esc(text)}</div>${fuente ? `<a class="pill" style="justify-self:start" href="${esc(fuente)}" target="_blank" rel="noopener">ver el video en ${videoLabel(fuente)} ↗</a>` : ""}</div>
      <button class="btn ink xl press" data-act="eat" data-kind="receta" data-id="${r.id}" data-meal="${meal}">${meal === "almuerzo" ? "la almuerzo hoy." : "la ceno hoy."}</button>
      ${String(r.id).startsWith("tmp") ? "" : `<a class="btn on-card press" style="height:48px" href="https://www.notion.so/${r.id}" target="_blank" rel="noopener">abrir en notion ↗</a>`}`;
  }
  function sheetNew() {
    const nr = S.nr;
    return `<div class="big-title">nueva receta.</div>
      <div class="field-label">nombre</div><input class="input sm" id="nr-name" placeholder="ej. tarta de zapallitos" value="${esc(nr.name)}">
      <div class="field-label">link (instagram, tiktok…)</div><input class="input sm" id="nr-link" placeholder="pegá el link, si hay" value="${esc(nr.link)}" inputmode="url">
      <div class="field-label">tiempo</div><div class="row">${TIEMPOS.map(([l, v]) => `<button class="pill" data-act="nr-time" data-v="${v}" aria-pressed="${nr.time === v}">${l}</button>`).join("")}</div>
      <div class="field-label">estado</div><div class="row">${ESTADOS.map(e => `<button class="pill" data-act="nr-estado" data-v="${e}" aria-pressed="${nr.estado === e}">${low(e)}</button>`).join("")}</div>
      <div class="field-label">grupos</div>${chips(nr.g, "nr")}
      <div class="field-label">ingredientes que ya están en la despensa</div>
      <div class="row">${[...Store.data.despensa].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map(p => `<button class="pill light" data-act="nr-ing" data-id="${p.id}" aria-pressed="${nr.ings.includes(p.id)}">${esc(low(p.nombre))}</button>`).join("")}</div>
      <div class="field-label">ingredientes nuevos</div><input class="input sm" id="nr-new" placeholder="separados por coma" value="${esc(nr.newIng)}">
      <div class="field-label">paso a paso</div><textarea class="textarea" id="nr-steps" placeholder="1. …">${esc(nr.steps)}</textarea>
      <button class="btn ink xl press" data-act="nr-save">guardar en el recetario.</button>`;
  }
  function sheetMenu() {
    const week = L.workWeek(S.today);
    return `<div class="big-title">menú de la semana.</div>
      <div class="body" style="font-weight:500;font-size:14px">sacale una foto al menú con la cámara del celu, mantené apretado el texto para copiarlo y pegalo acá.</div>
      <textarea class="textarea" id="menu-text" style="min-height:130px" placeholder="lunes: milanesa con puré…">${esc(S.menuText)}</textarea>
      <button class="btn ink press" data-act="menu-read" style="height:52px;font:800 18px var(--font);letter-spacing:-.03em">leer menú.</button>
      ${S.menuRows ? S.menuRows.map((m, i) => `<div class="menu-day"><div class="d">${esc(week[i].label)}</div><input class="input sm" style="height:48px" data-menu="${i}" value="${esc(m.text)}" placeholder="sin plato" aria-label="almuerzo ${esc(week[i].label)}">${chips(m.g, "menu:" + i, "small")}</div>`).join("") +
        `<button class="btn ink xl press" data-act="menu-save">guardar la semana.</button>` : ""}`;
  }

  /* ---------- actions ---------- */
  function eat(kind, id, meal) {
    const F = meal === "almuerzo" ? "almuerzo" : "cena", G = meal === "almuerzo" ? "gA" : "gC";
    let name, groups, extra = "";
    if (kind === "freezer") {
      const f = Store.find("freezer", id); if (!f) return;
      name = f.plato; groups = [...f.grupos];
      const n = Math.max(0, f.porciones - 1); Store.update("freezer", f.id, { porciones: n });
      extra = ` quedan ${n} en el freezer.`;
    } else {
      const r = Store.find("recetas", id); if (!r) return;
      name = r.nombre; groups = [...r.grupos];
      Store.update("recetas", r.id, { ultima: S.today });
    }
    saveDay({ [F]: name, [G]: groups });
    toast(`${meal === "almuerzo" ? "almuerzo guardado" : "cena guardada"}: ${low(name)}.${extra}`);
  }
  function addToList(recId) {
    const r = Store.find("recetas", recId); if (!r) return;
    const st = L.stockOf(r, Object.fromEntries(Store.data.despensa.map(x => [x.id, x])));
    const todo = [...st.falta, ...st.sinDato].filter(i => i.estado !== "No tengo");
    todo.forEach(i => Store.update("despensa", i.id, { estado: "No tengo" }));
    toast(todo.length || st.falta.length ? "sumado a la lista de compras." : "no falta nada.");
  }
  function openRecipe(kind, id) {
    const meal = S.tab === "qc" ? currentMode() : "cena";
    if (kind === "freezer") return openSheet("r", { freezerId: id, meal });
    openSheet("r", { id, meal });
    if (!S.recText[id] && !String(id).startsWith("tmp")) {
      Store.pageText(id).then(t => { S.recText[id] = t; }).catch(() => { S.recText[id] = { error: true }; })
        .finally(() => { if (S.sheet && S.sheet.id === id) renderSheet(); });
    } else if (String(id).startsWith("tmp")) S.recText[id] = { text: "" };
  }
  function newRecipeForm() { return { name: "", link: "", time: "Rápida (-15 min)", estado: "Quiero probar", g: [], ings: [], newIng: "", steps: "" }; }
  function saveNewRecipe() {
    const nr = S.nr, name = nr.name.trim();
    if (!name) return toast("poné el nombre de la receta.");
    const nuevos = nr.newIng.split(",").map(s => s.trim()).filter(Boolean);
    const ingIds = [...nr.ings];
    for (const n of nuevos) {
      const ex = Store.data.despensa.find(p => L.norm(p.nombre) === L.norm(n));
      if (ex) { if (!ingIds.includes(ex.id)) ingIds.push(ex.id); }
      else ingIds.push(Store.create("despensa", { nombre: n.charAt(0).toUpperCase() + n.slice(1), estado: "No tengo", cat: "", salva: false }).id);
    }
    const ingNames = ingIds.map(id => Store.find("despensa", id)?.nombre).filter(Boolean);
    const steps = nr.steps.trim();
    const content = `ingredientes:\n${ingNames.map(n => "- " + n).join("\n") || "- (completar)"}\n${steps || (nr.link ? "ver el video del link." : "(completar el paso a paso)")}`;
    const rec = Store.create("recetas", { nombre: name, cat: "", tiempo: nr.time, estado: nr.estado, detalle: steps ? "Completa" : "Incompleta", grupos: nr.g.length ? nr.g : L.detect(name), fav: false, fuente: nr.link.trim(), ultima: "", ing: ingIds }, { content });
    S.recText[rec.id] = { text: content, links: nr.link ? [nr.link] : [] };
    closeSheet(); S.tab = "rec"; S.filter = "Todas"; S.q = ""; ls.set("morfi.tab", S.tab); render(true); window.scrollTo(0, 0);
    toast(`${low(name)} guardada en el recetario.`);
  }
  function saveWeek() {
    const week = L.workWeek(S.today); let n = 0;
    S.menuRows.forEach((m, i) => { if (!m.text.trim()) return; saveDayFor(week[i].s, { almuerzo: m.text.trim(), gA: m.g, casa: false }); L.learn(m.text, m.g); n++; });
    closeSheet(); render(true);
    toast(n ? "semana guardada. el almuerzo de cada día se carga solo." : "no había platos para guardar.");
  }
  function addWater(ml) {
    ml = Math.round(ml); if (!(ml > 0)) return;
    const d = draft(), v = Math.min(8000, (d.agua || 0) + ml);
    S.waterHist.push(v - (d.agua || 0)); saveDay({ agua: v });
  }

  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset, act = a.act;
    switch (act) {
      case "tab": S.tab = a.tab; S.more = false; ls.set("morfi.tab", S.tab); render(true); window.scrollTo(0, 0); break;
      case "retry": Store.refresh(); break;
      case "water": addWater(+a.ml); break;
      case "undo": { const last = S.waterHist.pop(); if (last != null) { saveDay({ agua: Math.max(0, (draft().agua || 0) - last) }); toast(`saqué ${last} ml.`); } break; }
      case "place": {
        const d = draft();
        if (a.v === "home" && !d.casa) { S.workBackup = { almuerzo: d.almuerzo, gA: d.gA }; saveDay({ casa: true, almuerzo: "", gA: [] }); }
        else if (a.v === "work" && d.casa) { const b = S.workBackup || {}; saveDay({ casa: false, ...(d.almuerzo ? {} : { almuerzo: b.almuerzo || "", gA: b.gA || [] }) }); }
        break; }
      case "chip": {
        const set = a.set, g = a.g;
        const flip = arr => arr.includes(g) ? arr.filter(x => x !== g) : [...arr, g];
        if (set === "gA" || set === "gC") { const d = draft(), nv = flip(d[set]); saveDay({ [set]: nv }); const txt = set === "gA" ? d.almuerzo : d.cena; if (txt) L.learn(txt, nv); }
        else if (set === "fz") { S.frz.g = flip(S.frz.g); render(true); }
        else if (set === "nr") { S.nr.g = flip(S.nr.g); renderSheet(); }
        else if (set.startsWith("menu:")) { const m = S.menuRows[+set.slice(5)]; m.g = flip(m.g); renderSheet(); }
        break; }
      case "menu": S.menuRows = null; openSheet("m"); break;
      case "ask": S.mode = a.meal; S.more = false; S.tab = "qc"; ls.set("morfi.tab", "qc"); render(true); window.scrollTo(0, 0); break;
      case "mode": S.mode = a.v; S.more = false; render(true); break;
      case "more": S.more = !S.more; render(true); break;
      case "eat": eat(a.kind, a.id, a.meal); if (S.sheet) { closeSheet(); S.tab = "hoy"; ls.set("morfi.tab", "hoy"); render(true); window.scrollTo(0, 0); } break;
      case "how": openRecipe(a.kind, a.id); break;
      case "to-list": addToList(a.id); break;
      case "new-rec": S.nr = newRecipeForm(); openSheet("n"); break;
      case "filter": S.filter = a.v; render(true); break;
      case "rec-fav": { const r = Store.find("recetas", a.id); if (r) { Store.update("recetas", r.id, { fav: !r.fav }); if (S.sheet) renderSheet(); } break; }
      case "rec-estado": Store.update("recetas", a.id, { estado: a.v }); renderSheet(); break;
      case "desview": S.desView = a.v; render(true); break;
      case "check": S.checked.has(a.id) ? S.checked.delete(a.id) : S.checked.add(a.id); render(true); break;
      case "bought": { const ids = [...S.checked]; ids.forEach(id => Store.update("despensa", id, { estado: "Tengo" })); S.checked.clear(); render(true); toast(`listo, ${ids.length} ${ids.length === 1 ? "cosa vuelve" : "cosas vuelven"} a «tengo».`); break; }
      case "banner-off": S.bannerOff = true; ls.set("morfi.bannerOff", true); render(true); break;
      case "stock": Store.update("despensa", a.id, { estado: a.v }); break;
      case "frz-fav": { const f = Store.find("freezer", a.id); if (f) Store.update("freezer", f.id, { fav: !f.fav }); break; }
      case "frz-n": { const f = Store.find("freezer", a.id); if (f) Store.update("freezer", f.id, { porciones: Math.max(0, f.porciones + Number(a.d)) }); break; }
      case "fz-n": S.frz.n = Math.max(1, S.frz.n + Number(a.d)); render(true); break;
      case "fz-who": S.frz.who = a.v; render(true); break;
      case "close": closeSheet(); break;
      case "nr-time": S.nr.time = a.v; renderSheet(); break;
      case "nr-estado": S.nr.estado = a.v; renderSheet(); break;
      case "nr-ing": { const i = S.nr.ings.indexOf(a.id); i >= 0 ? S.nr.ings.splice(i, 1) : S.nr.ings.push(a.id); t.setAttribute("aria-pressed", i < 0); break; }
      case "nr-save": saveNewRecipe(); break;
      case "menu-read": if (!S.menuText.trim()) { toast("pegá primero el texto del menú."); break; } S.menuRows = L.parseMenu(S.menuText); renderSheet(); break;
      case "menu-save": saveWeek(); break;
    }
  });
  document.addEventListener("input", ev => {
    const t = ev.target, id = t.id;
    if (id === "w-custom") { t.value = t.value.replace(/\D/g, ""); S.custom = t.value; }
    else if (id === "in-q") { S.q = t.value; const all = Store.data.recetas, q = L.norm(S.q), f = S.filter;
      const list = all.filter(r => (f === "Todas" || (f === "Favoritas" ? r.fav : f === "Incompletas" ? r.detalle === "Incompleta" : f === "Sin clasificar" ? !r.estado : r.estado === f)) && (!q || L.norm(r.nombre).includes(q))).sort((a, b) => (b.fav - a.fav) || a.nombre.localeCompare(b.nombre, "es"));
      $("#rec-list").innerHTML = recList(list); const m = $("#rec-list").previousElementSibling; if (m) m.textContent = `${list.length} de ${all.length} recetas`; }
    else if (id === "in-item") S.newItem = t.value;
    else if (id === "in-frz") { S.frz.name = t.value; S.frz.g = L.detect(t.value); const c = t.parentElement.querySelector(".chips"); if (c) c.outerHTML = chips(S.frz.g, "fz"); }
    else if (id === "nr-name") S.nr.name = t.value;
    else if (id === "nr-link") S.nr.link = t.value;
    else if (id === "nr-new") S.nr.newIng = t.value;
    else if (id === "nr-steps") S.nr.steps = t.value;
    else if (id === "menu-text") S.menuText = t.value;
    else if (t.dataset.menu != null) { const m = S.menuRows[+t.dataset.menu]; m.text = t.value; }
  });
  document.addEventListener("change", ev => {
    const t = ev.target, id = t.id;
    if (id === "in-almuerzo" || id === "in-cena") {
      const v = t.value.trim(), F = id === "in-almuerzo" ? "almuerzo" : "cena", G = F === "almuerzo" ? "gA" : "gC";
      if (v !== draft()[F]) saveDay({ [F]: v, [G]: L.detect(v) });
    }
    else if (id === "in-cat") S.newCat = t.value;
    else if (t.dataset.menu != null) { const i = +t.dataset.menu, m = S.menuRows[i]; m.g = L.detect(m.text); renderSheet(); }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && (ev.target.id === "in-almuerzo" || ev.target.id === "in-cena")) ev.target.blur();
    if (ev.key === "Escape" && S.sheet) closeSheet();
  });
  document.addEventListener("submit", ev => {
    ev.preventDefault(); const f = ev.target.dataset.form;
    if (f === "water") { const v = parseInt(S.custom || "0", 10); if (v > 0) { addWater(v); S.custom = ""; const i = $("#w-custom"); if (i) { i.value = ""; i.blur(); } } }
    else if (f === "add-item") {
      const name = (S.newItem || "").trim(); if (!name) return;
      if (Store.data.despensa.some(p => L.norm(p.nombre) === L.norm(name))) return toast("eso ya está en la despensa.");
      Store.create("despensa", { nombre: name.charAt(0).toUpperCase() + name.slice(1), estado: "No tengo", cat: S.newCat || "Verdura", salva: false });
      S.newItem = ""; render(true); toast(`${low(name)} sumado a la lista de compras.`);
    }
    else if (f === "frz") {
      const F = S.frz, name = F.name.trim(); if (!name) return toast("poné el nombre del plato.");
      Store.create("freezer", { plato: name.charAt(0).toUpperCase() + name.slice(1), porciones: F.n, origen: F.who, grupos: F.g.length ? F.g : L.detect(name), fav: false, fecha: S.today });
      S.frz = { name: "", n: 2, who: F.who, g: [] }; render(true); toast(`${low(name)} guardado en el freezer.`);
    }
  });

  /* ---------- boot ---------- */
  function newDayCheck() {
    const t = L.ymd(new Date());
    if (t !== S.today) { S.today = t; S.waterHist = []; S.mode = null; render(true); }
    if (Date.now() - Store.loadedAt > 5 * 60 * 1000) Store.refresh();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) newDayCheck(); });
  Store.restore();
  render(true);
  Store.refresh();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
