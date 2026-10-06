// Morfi — lógica sin datos externos: grupos, sugerencias, semana, menú y agua.
(function () {
  const GROUPS = ["Verdura", "Proteína", "Legumbre", "Carbohidrato", "Lácteo"];
  const GCOLOR = { Verdura: "var(--g-verdura)", Proteína: "var(--g-proteina)", Legumbre: "var(--g-legumbre)", Carbohidrato: "var(--g-carbo)", Lácteo: "var(--g-lacteo)" };
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseYmd = s => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);

  /* ---------- groups: keyword dictionary + what she corrected ---------- */
  const KW = [
    ["Verdura", /\b(verdur|ensalad|brocoli|zapallit|zucchini|calabaz|zapallo|zanahori|tomate|espinac|acelga|lechug|rucula|cebolla|puerro|morron|pimiento|berenjen|champi|hongo|repollo|coliflor|chaucha|arveja|pepino|apio|remolach|kale|wok|vegetal|salteado de verdura|soufle|souffle|primavera|caprese|jardinera)/],
    ["Proteína", /\b(pollo|supremas?|pechuga|carne|bife|asado|vacio|matambre|lomo|nalga|peceto|cuadril|bondiola|cerdo|costilla|milanesa(?! de (soja|lenteja|berenjena|espinaca|calabaza))|albondiga|hamburguesa(?! de (soja|lenteja|garbanzo|quinoa))|pescado|merluza|salmon|atun|caballa|sardina|mariscos?|langostino|huevo|omelette|omellete|tortilla de|revuelto|frittata|jamon|pavita|pavo|matambre|chorizo|salchich|pancho|bolognesa|carne picada|guiso de carne|pastel de papa|empanadas? de (carne|pollo|jamon|atun)|tarta de (atun|pollo|jamon))/],
    ["Legumbre", /\b(lenteja|garbanzo|poroto|soja|tofu|hummus|falafel|arvejas? partida|guiso de lenteja|hamburguesa de (lenteja|garbanzo)|milanesa de soja)/],
    ["Carbohidrato", /\b(fideo|pasta|spaghetti|tallarin|mostachol|penne|tirabuzon|ravioles?|sorrentino|canelon|lasagn|ñoqui|noqui|pastina|arroz|risotto|polenta|pure|papa|batata|pan\b|panes|sandwich|sanguche|tostad|tarta|tartas|empanada|pizza|fugazz|wrap|rapidit|tortilla(?! de)|tacos?|fajita|quesadilla|cuscus|quinoa|choclo|humita|galleta|budin|torta|medialuna|milanesa)/],
    ["Lácteo", /\b(queso|muzzarella|mozzarella|ricota|parmesano|reggianito|crema|leche|yogur|manteca|salsa blanca|gratin|fugazzeta|cuatro quesos|capresse|caprese)/],
  ];
  const LS_LEARN = "morfi.learned.v1";
  let learned = {}; try { learned = JSON.parse(localStorage.getItem(LS_LEARN) || "{}"); } catch (e) {}
  function detect(text) {
    const n = norm(text); if (!n) return [];
    if (learned[n]) return [...learned[n]];
    const out = KW.filter(([, re]) => re.test(n)).map(([g]) => g);
    if (/(ensalada|verdura|salteado)/.test(n) && !out.includes("Verdura")) out.push("Verdura");
    return GROUPS.filter(g => out.includes(g));
  }
  function learn(text, groups) {
    const n = norm(text); if (!n) return;
    learned[n] = [...groups];
    try { localStorage.setItem(LS_LEARN, JSON.stringify(learned)); } catch (e) {}
  }

  /* ---------- water ---------- */
  function waterLeft(ml, goal) {
    const rem = goal - ml;
    if (rem <= 0) return "llegaste a los 2 litros. lo que sumes es extra.";
    if (rem <= 550) return `te faltan ${rem} ml. menos de una botella.`;
    if (rem <= 850) return `te faltan ${rem} ml. con un termo llegás.`;
    if (rem <= 1400) return `te faltan ${rem} ml. un termo y una botella.`;
    return `te faltan ${rem} ml. dos termos y listo.`;
  }
  const fmtL = (ml, d = 2) => (ml / 1000).toLocaleString("es-AR", { maximumFractionDigits: d });

  /* ---------- week (monday to sunday) ---------- */
  function weekOf(today, dias, draft) {
    const t = parseYmd(today), dow = (t.getDay() + 6) % 7; // 0 = monday
    const mon = new Date(t); mon.setDate(t.getDate() - dow);
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); const s = ymd(d);
      const row = s === today ? draft : dias.find(x => x.fecha === s);
      const g = new Set([...(row?.gA || []), ...(row?.gC || [])]);
      return { s, letter: "LMMJVSD"[i], date: d, row, veg: g.has("Verdura"), prot: g.has("Proteína") || g.has("Legumbre"), leg: g.has("Legumbre"), agua: row?.agua || 0, today: s === today, past: s <= today };
    });
    const elapsed = days.filter(d => d.past).length;
    const aguaDays = days.filter(d => d.agua > 0);
    const sun = days[6].date;
    return {
      days, elapsed,
      veg: days.filter(d => d.veg).length, prot: days.filter(d => d.prot).length, leg: days.filter(d => d.leg).length,
      aguaAvg: aguaDays.length ? aguaDays.reduce((a, d) => a + d.agua, 0) / aguaDays.length : 0,
      range: `${mon.getDate()}${mon.getMonth() !== sun.getMonth() ? "/" + (mon.getMonth() + 1) : ""} al ${sun.getDate()}/${sun.getMonth() + 1}`,
    };
  }

  /* ---------- weekly work menu ---------- */
  function workWeek(today) {
    const t = parseYmd(today), dow = t.getDay();
    const mon = new Date(t); mon.setDate(t.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
    return [0, 1, 2, 3, 4].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { s: ymd(d), dia: DIAS[d.getDay()], label: `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` }; });
  }
  function parseMenu(text) {
    const out = ["", "", "", "", ""];
    const names = ["lunes", "martes", "miercoles", "jueves", "viernes"];
    const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
    let current = -1, found = false;
    for (const l of lines) {
      const n = norm(l).replace(/^[^a-z]+/, "");
      const i = names.findIndex(d => n.startsWith(d));
      if (i >= 0) {
        found = true; current = i;
        const rest = l.replace(/^[^a-zA-ZáéíóúÁÉÍÓÚ]*[a-zA-ZáéíóúÁÉÍÓÚ]+\s*\d{0,2}(\/\d{1,2})?\s*[:\-–—.]?\s*/, "").trim();
        out[i] = rest;
      } else if (found && current >= 0 && !out[current]) out[current] = l; // day name alone on its line
      else if (found && current >= 0 && out[current] && l.length < 60) out[current] += " / " + l; // options under the same day
    }
    if (!found) lines.slice(0, 5).forEach((l, i) => (out[i] = l));
    return out.map(t => ({ text: t, g: detect(t) }));
  }

  /* ---------- suggestions ---------- */
  const NOT_MEAL = new Set(["Desayuno", "Merienda", "Postre", "Picoteo"]);
  function stockOf(rec, desMap) {
    const ings = rec.ing.map(id => desMap[id]).filter(Boolean);
    return { ings, falta: ings.filter(i => i.estado === "No tengo"), poco: ings.filter(i => i.estado === "Poco"), sinDato: ings.filter(i => !i.estado), total: ings.length };
  }
  function recentlyEaten(name, dias, today) {
    const words = norm(name).split(/\s+/).filter(w => w.length > 3).slice(0, 2).join(" ");
    if (!words) return false;
    return dias.some(d => d.fecha < today && daysBetween(d.fecha, today) <= 3 && (norm(d.almuerzo).includes(words) || norm(d.cena).includes(words)));
  }
  function suggest({ meal, today, draft, dias, recetas, freezer, despensa }) {
    const t = parseYmd(today), weekend = t.getDay() === 0 || t.getDay() === 6;
    const yday = new Date(t); yday.setDate(t.getDate() - 1);
    const yRow = dias.find(d => d.fecha === ymd(yday));
    const ctx = new Set(meal === "cena" ? draft.gA : (yRow?.gC || []));
    const other = meal === "cena" ? "el almuerzo" : "la cena de anoche";
    const needVeg = !ctx.has("Verdura"), needProt = !(ctx.has("Proteína") || ctx.has("Legumbre"));
    const desMap = Object.fromEntries(despensa.map(d => [d.id, d]));
    const cands = [];
    freezer.filter(f => f.porciones > 0).forEach(f => cands.push({ kind: "freezer", ref: f, nombre: f.plato, grupos: f.grupos, fav: f.fav }));
    recetas.filter(r => r.estado !== "No va" && !NOT_MEAL.has(r.cat) && !/pendiente completar/i.test(r.nombre) && (r.detalle !== "Incompleta" || r.ing.length))
      .forEach(r => cands.push({ kind: "receta", ref: r, nombre: r.nombre, grupos: r.grupos, fav: r.fav || r.estado === "Se queda" }));
    for (const c of cands) {
      let s = 0; const why = []; const g = new Set(c.grupos);
      if (needVeg && g.has("Verdura")) { s += 3; why.push(`suma la verdura que no tuvo ${other}`); } else if (g.has("Verdura")) s += 1;
      if (needProt && (g.has("Proteína") || g.has("Legumbre"))) { s += 3; why.push(`aporta la proteína que no tuvo ${other}`); }
      if (ctx.has("Carbohidrato") && g.has("Carbohidrato")) s -= g.has("Verdura") ? 1 : 2;
      if (g.has("Legumbre")) s += 0.5;
      if (c.kind === "freezer") { s += 3; why.push(`está lista en el freezer (${c.ref.porciones} ${c.ref.porciones === 1 ? "porción" : "porciones"})`); c.time = "10 min"; c.tag = { kind: "freezer", text: `freezer · ${c.ref.porciones} porc.` }; }
      else {
        const r = c.ref; c.time = (r.tiempo || "").toLowerCase();
        if (r.tiempo.startsWith("Rápida")) { s += 2; why.push("sale en menos de 15 minutos"); }
        else if (r.tiempo === "Elaborada" && !weekend && meal === "cena") s -= 3;
        const st = stockOf(r, desMap); c.stock = st;
        if (st.total) {
          if (!st.falta.length && !st.sinDato.length) { s += 3; why.push("tenés todo en casa"); c.tag = { kind: "ok", text: "tenés todo" }; }
          else if (st.falta.length) { s -= st.falta.length >= 2 ? 3 : 0; c.tag = { kind: "miss", text: st.falta.length === 1 ? `falta: ${st.falta[0].nombre.toLowerCase()}` : `faltan ${st.falta.length}` }; }
          else c.tag = { kind: "miss", text: "revisá la despensa" };
        }
        if (r.ultima) { const ago = daysBetween(r.ultima, today); if (ago <= 3) s -= 3; else if (ago >= 10 && ago < 400) why.push(`hace ${ago} días que no la hacés`); }
        if (r.estado === "Quiero probar" && (weekend || meal === "almuerzo")) { s += 1; why.push("buen momento para probarla"); }
      }
      if (recentlyEaten(c.nombre, dias, today)) s -= 3;
      if (c.fav) { s += 1; why.push("es de tus favoritas"); }
      c.score = s; c.why = why.length ? why : ["suma variedad a la semana"];
    }
    return cands.sort((a, b) => b.score - a.score);
  }

  window.Logic = { GROUPS, GCOLOR, DIAS, norm, ymd, parseYmd, daysBetween, detect, learn, waterLeft, fmtL, weekOf, workWeek, parseMenu, suggest, stockOf };
})();
