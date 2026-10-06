// Morfi — configuración
// WORKER_URL: el Worker de Cloudflare que guarda el token de Notion y reenvía los pedidos.
window.MORFI_CONFIG = {
WORKER_URL: "https://morfi.felicitasgonzalezc.workers.dev",  DB: {
    recetas:  "b8938a0932994ec285877efb63e96217", // 👩🏼‍🍳 Recetario
    dias:     "c0bb3c9098c7447ca6cba9d0faba0a66", // 🗓️ Planificador semanal
    despensa: "13abd5f360a545a681eeea17dea76530", // 🛒 Despensa
    freezer:  "79da5c7e821040a99731f1f51f3e088d", // 🧊 Freezer
  },
  WATER_GOAL_ML: 2000,
};
