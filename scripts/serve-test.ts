import html from "./test-resizable.html";

Bun.serve({
  port: 3001,
  routes: {
    "/": html,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Test server running at http://localhost:3001/");
