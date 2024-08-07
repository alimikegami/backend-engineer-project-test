import Hapi from "@hapi/hapi";
import routes from "./routes/index.js";
import Inert from "@hapi/inert";
import Path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const init = async () => {
  const server = Hapi.server({
    port: 5173,
    host: "0.0.0.0",
  });

  server.route(routes);

  await server.start();
  console.log("Server running at:", server.info.uri);
};

init();
