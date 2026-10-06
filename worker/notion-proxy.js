// Morfi — Worker de Cloudflare (referencia).
// Guarda el token de Notion y reenvía a la API solo los pedidos que Morfi necesita.
// Variables del Worker: NOTION_TOKEN (secreto), ALLOWED_ORIGIN (la URL de la app), APP_KEY (opcional).
const NOTION = "https://api.notion.com";
const DATABASES = new Set([
  "b8938a0932994ec285877efb63e96217", // Recetario
  "c0bb3c9098c7447ca6cba9d0faba0a66", // Planificador semanal
  "13abd5f360a545a681eeea17dea76530", // Despensa
  "79da5c7e821040a99731f1f51f3e088d", // Freezer
]);
const clean = id => String(id || "").replace(/-/g, "");

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(",").map(s => s.trim()) : ["*"];
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0]),
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-App-Key",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const deny = (status, message) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) return deny(401, "clave incorrecta");

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "");
    let body = null;
    if (req.method === "POST" || req.method === "PATCH") body = await req.text();

    // only the routes Morfi uses
    let m, ok = false;
    if (req.method === "POST" && (m = path.match(/^\/v1\/databases\/([\w-]+)\/query$/))) ok = DATABASES.has(clean(m[1]));
    else if (req.method === "POST" && path === "/v1/pages") { try { ok = DATABASES.has(clean(JSON.parse(body).parent.database_id)); } catch (e) {} }
    else if (req.method === "PATCH" && /^\/v1\/pages\/[\w-]+$/.test(path)) ok = true;
    else if (req.method === "GET" && /^\/v1\/blocks\/[\w-]+\/children$/.test(path)) ok = true;
    if (!ok) return deny(403, "ruta no permitida");

    const res = await fetch(NOTION + path + url.search, {
      method: req.method,
      headers: { "Authorization": `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body,
    });
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
