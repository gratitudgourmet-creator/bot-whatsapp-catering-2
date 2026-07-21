"use strict";

const {
  createAdmsServer,
  createZktecoService,
  loadZktecoConfig,
} = require("./lib/zkteco-adms");

async function main() {
  const config = loadZktecoConfig(process.env, { baseDir: __dirname });
  if (!config.enabled) {
    console.log("[zkteco] receptor desactivado. Defina ZKTECO_ENABLED=true para iniciarlo.");
    return;
  }

  const service = createZktecoService({ config, logger: console });
  const server = createAdmsServer({ service, logger: console });
  server.on("error", (error) => {
    service.close();
    if (error?.code === "EADDRINUSE") {
      console.error(`[zkteco] El puerto ZKTeco ${config.port} ya está ocupado. Cerrá el proceso anterior o cambiá ZKTECO_PORT.`);
    } else {
      console.error(`[zkteco] no se pudo iniciar el receptor: ${error?.message || error}`);
    }
    process.exit(1);
  });
  server.listen(config.port, config.bindHost, () => {
    console.log(`[zkteco] receptor ADMS escuchando en ${config.bindHost}:${config.port}`);
    console.log(`[zkteco] DB: ${config.dbFile}`);
  });

  const shutdown = () => {
    console.log("[zkteco] cerrando receptor ADMS...");
    server.close(() => {
      service.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[zkteco] no se pudo iniciar:", error.message);
  process.exit(1);
});
