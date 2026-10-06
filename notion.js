// Morfi — capa de datos: Notion vía el Worker, cache en el celu y cola de cambios offline.
(function () {
  const cfg = window.MORFI_CONFIG;
  const LS_DATA = "morfi.data.v1", LS_QUEUE = "morfi.queue.v1";
  const clean = id => String(id || "").replace(/-/g, "");

  /* ---------- HTTP ---------- */
  async function api(path, { method = "GET", body } = {}) {
    if (!cfg.WORKER_URL) throw { offline: true, message: "Falta configurar la dirección del Worker." };
    let res;
    try {
      res = await fetch(cfg.WORKER_URL.replace(/\/$/, "") + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cfg.headers ? cfg.headers() : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw { offline: true, message: "Sin conexión." }; }
    if (!res.ok) {
      let msg = ""; try { const j = await res.json(); msg = j.message || JSON.stringify(j); } catch (e) { msg = await res.text().catch(() => ""); }
      throw { status: res.status, offline: res.status >= 500 || res.status === 429, message: msg };
    }
    return res.json();
  }
  async function queryAll(db, body = {}) {
    const out = []; let cursor;
    do {
      const r = await api(`/v1/databases/${db}/query`, { method: "POST", body: { page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) } });
      out.push(...r.results); cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    return out;
  }

  /* ---------- property helpers ---------- */
  const R = {
    title: p => (p?.title || []).map(t => t.plain_text).join("").replace(/\*\*/g, "").trim(),
    text: p => (p?.rich_text || []).map(t => t.plain_text).join("").trim(),
    select: p => p?.select?.name || "",
    multi: p => (p?.multi_select || []).map(o => o.name),
    check: p => !!p?.checkbox,
    num: p => (typeof p?.number === "number" ? p.number : 0),
    date: p => p?.date?.start || "",
    rel: p => (p?.relation || []).map(r => clean(r.id)),
  };
  const W = {
    title: s => ({ title: [{ text: { content: String(s || "") } }] }),
    text: s => ({ rich_text: s ? [{ text: { content: String(s).slice(0, 1990) } }] : [] }),
    select: s => ({ select: s ? { name: s } : null }),
    multi: a => ({ multi_select: (a || []).map(name => ({ name })) }),
    check: b => ({ checkbox: !!b }),
    num: n => ({ number: n == null ? null : Number(n) }),
    date: s => ({ date: s ? { start: s } : null }),
    rel: ids => ({ relation: (ids || []).filter(id => !String(id).startsWith("tmp")).map(id => ({ id })) }),
  };

  /* ---------- mappers ---------- */
  const MAP = {
    recetas: pg => { const p = pg.properties; return {
      id: clean(pg.id), nombre: R.title(p["Nombre"]) || "sin nombre", cat: R.select(p["Categoría"]), base: R.select(p["Base"]),
      tiempo: R.select(p["Tiempo"]), estado: R.select(p["Estado"]), detalle: R.select(p["Detalle"]), grupos: R.multi(p["Grupos"]),
      fav: R.check(p["Favorita"]), fuente: R.text(p["Fuente"]), notas: R.text(p["Notas"]), ultima: R.date(p["Última vez que la hice"]),
      ing: R.rel(p["Ingredientes"]) }; },
    dias: pg => { const p = pg.properties; return {
      id: clean(pg.id), fecha: R.date(p["Fecha"]).slice(0, 10), dia: R.title(p["Día"]), almuerzo: R.text(p["Almuerzo"]), cena: R.text(p["Cena"]),
      gA: R.multi(p["Grupos almuerzo"]), gC: R.multi(p["Grupos cena"]), agua: R.num(p["Agua (ml)"]), casa: R.check(p["Almuerzo en casa"]) }; },
    despensa: pg => { const p = pg.properties; return {
      id: clean(pg.id), nombre: R.title(p["Ingrediente"]), estado: R.select(p["Estado"]), cat: R.select(p["Categoría"]), salva: R.check(p["Salvavidas"]) }; },
    freezer: pg => { const p = pg.properties; return {
      id: clean(pg.id), plato: R.title(p["Plato"]), porciones: R.num(p["Porciones"]), origen: R.select(p["Origen"]),
      grupos: R.multi(p["Grupos"]), fav: R.check(p["Favorito"]), fecha: R.date(p["Congelado el"]) }; },
  };
  // local field -> Notion property
  const TO = {
    recetas: { nombre: ["Nombre", W.title], cat: ["Categoría", W.select], tiempo: ["Tiempo", W.select], estado: ["Estado", W.select], detalle: ["Detalle", W.select],
      grupos: ["Grupos", W.multi], fav: ["Favorita", W.check], fuente: ["Fuente", W.text], ultima: ["Última vez que la hice", W.date], ing: ["Ingredientes", W.rel] },
    dias: { fecha: ["Fecha", W.date], dia: ["Día", W.title], almuerzo: ["Almuerzo", W.text], cena: ["Cena", W.text], gA: ["Grupos almuerzo", W.multi],
      gC: ["Grupos cena", W.multi], agua: ["Agua (ml)", W.num], casa: ["Almuerzo en casa", W.check] },
    despensa: { nombre: ["Ingrediente", W.title], estado: ["Estado", W.select], cat: ["Categoría", W.select], salva: ["Salvavidas", W.check] },
    freezer: { plato: ["Plato", W.title], porciones: ["Porciones", W.num], origen: ["Origen", W.select], grupos: ["Grupos", W.multi], fav: ["Favorito", W.check], fecha: ["Congelado el", W.date] },
  };
  function toProps(kind, patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) { const m = TO[kind][k]; if (m) out[m[0]] = m[1](v); }
    return out;
  }

  /* ---------- page content -> text ---------- */
  async function children(id) {
    const out = []; let cursor;
    do {
      const r = await api(`/v1/blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
      out.push(...r.results); cursor = r.has_more ? r.next_cursor : null;
    } while (cursor);
    return out;
  }
  async function pageText(id) {
    const lines = [], links = [];
    const rt = a => (a || []).map(t => { if (t.href) links.push(t.href); return t.plain_text; }).join("");
    async function walk(blocks) {
      let n = 0;
      for (const b of blocks) {
        const t = b.type, d = b[t] || {};
        if (t !== "numbered_list_item") n = 0;
        if (t === "paragraph") lines.push(rt(d.rich_text));
        else if (t.startsWith("heading_")) lines.push("", rt(d.rich_text).toLowerCase());
        else if (t === "bulleted_list_item" || t === "to_do") lines.push("– " + rt(d.rich_text));
        else if (t === "numbered_list_item") lines.push(`${++n}. ` + rt(d.rich_text));
        else if (t === "quote" || t === "callout") lines.push(rt(d.rich_text));
        else if (["bookmark", "embed", "video", "link_preview"].includes(t)) { const u = d.url || d.external?.url; if (u) links.push(u); }
        if (b.has_children && ["column_list", "column", "toggle", "bulleted_list_item", "numbered_list_item", "callout", "synced_block"].includes(t)) await walk(await children(b.id));
      }
    }
    await walk(await children(id));
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text, links: [...new Set(links)] };
  }
  const textToBlocks = text => String(text || "").split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 90).map(l => {
    const num = l.match(/^\d+[.)]\s*(.*)$/), bul = l.match(/^[-–•]\s*(.*)$/);
    const type = num ? "numbered_list_item" : bul ? "bulleted_list_item" : "paragraph";
    return { object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: (num ? num[1] : bul ? bul[1] : l).slice(0, 1990) } }] } };
  });

  /* ---------- store ---------- */
  const listeners = new Set();
  const Store = {
    data: { recetas: [], dias: [], despensa: [], freezer: [] },
    loadedAt: 0, queue: [], status: "idle", lastError: null, busy: false,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
    persist() {
      try { localStorage.setItem(LS_DATA, JSON.stringify({ data: this.data, loadedAt: this.loadedAt })); } catch (e) {}
      try { localStorage.setItem(LS_QUEUE, JSON.stringify(this.queue)); } catch (e) {}
    },
    restore() {
      try { const j = JSON.parse(localStorage.getItem(LS_DATA) || "null"); if (j) { this.data = { ...this.data, ...j.data }; this.loadedAt = j.loadedAt || 0; } } catch (e) {}
      try { this.queue = JSON.parse(localStorage.getItem(LS_QUEUE) || "[]"); } catch (e) { this.queue = []; }
      return this.loadedAt > 0;
    },
    find(kind, id) { return this.data[kind].find(x => x.id === id); },

    async refresh() {
      this.status = "loading"; this.emit();
      const since = new Date(); since.setDate(since.getDate() - 40);
      const sinceS = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
      try {
        const [rec, dias, des, frz] = await Promise.all([
          queryAll(cfg.DB.recetas),
          queryAll(cfg.DB.dias, { filter: { property: "Fecha", date: { on_or_after: sinceS } }, sorts: [{ property: "Fecha", direction: "descending" }] }),
          queryAll(cfg.DB.despensa),
          queryAll(cfg.DB.freezer),
        ]);
        this.data = { recetas: rec.map(MAP.recetas), dias: dias.map(MAP.dias), despensa: des.map(MAP.despensa), freezer: frz.map(MAP.freezer) };
        this.applyPending();
        this.loadedAt = Date.now(); this.lastError = null; this.status = "ok";
        this.persist(); this.emit();
        this.flush();
      } catch (e) {
        this.lastError = e; this.status = "off"; this.emit();
      }
    },
    // re-apply changes not yet sent, on top of fresh data
    applyPending() {
      for (const op of this.queue) {
        if (op.type === "create") { if (!this.find(op.kind, op.tmp)) this.data[op.kind].push({ ...op.item }); }
        else { const it = this.find(op.kind, op.id); if (it) Object.assign(it, op.patch); }
      }
    },

    /* local-first mutations */
    update(kind, id, patch) {
      const it = this.find(kind, id); if (it) Object.assign(it, patch);
      const waiting = this.busy ? this.queue.slice(1) : this.queue; // queue[0] may be in flight
      const pendingUpdate = waiting.find(op => op.type === "update" && op.kind === kind && op.id === id);
      const pendingCreate = waiting.find(op => op.type === "create" && op.tmp === id);
      if (pendingUpdate) Object.assign(pendingUpdate.patch, patch);
      else if (pendingCreate) { Object.assign(pendingCreate.patch, patch); Object.assign(pendingCreate.item, patch); }
      else this.queue.push({ type: "update", kind, id, patch: { ...patch } });
      this.persist(); this.emit(); this.flush();
    },
    create(kind, item, { content } = {}) {
      const tmp = "tmp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const full = { ...item, id: tmp };
      this.data[kind].push(full);
      this.queue.push({ type: "create", kind, tmp, patch: { ...item }, item: full, content: content || "" });
      this.persist(); this.emit(); this.flush();
      return full;
    },

    async flush() {
      if (this.busy || !this.queue.length || !cfg.WORKER_URL) { if (!this.queue.length && this.status === "saving") { this.status = "ok"; this.emit(); } return; }
      this.busy = true; this.status = "saving"; this.emit();
      while (this.queue.length) {
        const op = this.queue[0];
        try {
          if (op.type === "update") {
            if (String(op.id).startsWith("tmp")) { this.queue.shift(); continue; } // its create failed; nothing to update
            await api(`/v1/pages/${op.id}`, { method: "PATCH", body: { properties: toProps(op.kind, op.patch) } });
          } else {
            const body = { parent: { database_id: cfg.DB[op.kind] }, properties: toProps(op.kind, op.patch) };
            if (op.content) body.children = textToBlocks(op.content);
            const pg = await api(`/v1/pages`, { method: "POST", body });
            const real = clean(pg.id);
            const it = this.find(op.kind, op.tmp); if (it) it.id = real;
            for (const o of this.queue) {
              if (o.id === op.tmp) o.id = real;
              if (o.patch && Array.isArray(o.patch.ing)) o.patch.ing = o.patch.ing.map(x => x === op.tmp ? real : x);
            }
            for (const r of this.data.recetas) r.ing = r.ing.map(x => x === op.tmp ? real : x);
            // a recipe created before its new ingredients existed: send the relation now
            const recs = this.data.recetas.filter(r => r.ing.includes(real) && !String(r.id).startsWith("tmp"));
            for (const r of recs) if (!this.queue.some(o => o.type === "update" && o.id === r.id)) this.queue.push({ type: "update", kind: "recetas", id: r.id, patch: { ing: [...r.ing] } });
          }
          this.queue.shift(); this.lastError = null; this.persist();
        } catch (e) {
          this.lastError = e;
          if (e.offline) { this.status = "off"; this.busy = false; this.emit(); return; }
          // Notion refused this change (e.g. a property mismatch): drop it so the rest can go
          console.warn("Notion rechazó un cambio", op, e);
          this.queue.shift(); this.persist();
          Store.onReject && Store.onReject(e);
        }
      }
      this.busy = false; this.status = "ok"; this.emit();
    },
    pageText,
  };
  window.Store = Store;
  window.addEventListener("online", () => Store.flush());
})();
