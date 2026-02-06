/**
 * Main server entry point with WebSocket support for live recording.
 */

import { createServer } from "@/server/bootstrap/create-server";

const server = createServer();
console.log(`Server running at ${server.url}`);
