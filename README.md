# Morfi

App personal de comidas: qué almorzar, qué cenar, qué hay en casa y cuánta agua tomé. Es una web app instalable (PWA) que lee y escribe en Notion a través de un Worker de Cloudflare.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `styles.css` | La app y el diseño (tokens del handoff de Claude Design) |
| `app.js` | Pantallas, hojas y acciones |
| `logic.js` | Detección de grupos por palabras clave, sugerencias, semana, menú y agua |
| `notion.js` | Lectura y escritura en Notion, cache en el celu y cola de cambios sin conexión |
| `config.js` | Dirección del Worker e IDs de las bases de Notion |
| `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` | Instalación en el celu y funcionamiento offline |
| `worker/notion-proxy.js` | Worker de referencia, por si el actual no reenvía estas rutas |

## Puesta en marcha

1. **Compartir las bases con la integración de Notion.** En Notion, abrí la página *mis recetas* → `•••` → *Conexiones* → sumá la misma integración que usa la app de finanzas. Así el token puede leer Recetario, Planificador semanal, Despensa y Freezer.
2. **Worker.** Morfi llama a estas rutas, con el mismo formato que la API de Notion:
   - `POST /v1/databases/{id}/query`
   - `POST /v1/pages`
   - `PATCH /v1/pages/{id}`
   - `GET /v1/blocks/{id}/children`
3. **`config.js`:** completar `WORKER_URL` con la dirección del Worker.
4. **Publicar** la carpeta (GitHub Pages u otro hosting estático) y abrirla en el celu → *Agregar a pantalla de inicio*.

## Notas

- Todo se guarda solo: cada cambio va a Notion y el indicador pasa a «guardando…» y después a «notion al día».
- Sin conexión, los cambios quedan en el celu y se mandan cuando vuelve la conexión (o con «reintentar»).
- Cuando corregís los grupos de un plato, Morfi lo recuerda para la próxima vez que lo escribas.
- Las vistas «App» que hay en las bases de Notion son de la versión anterior dentro de Claude; esta app no las necesita.
