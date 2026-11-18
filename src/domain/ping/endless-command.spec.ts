import { describe, expect, it } from "vitest";

import { commandNeverExits } from "#domain/ping/endless-command.ts";


describe("commandNeverExits", () => {
  it.each([
    "npm start",
    "npm run dev",
    "pnpm dev",
    "yarn run preview",
    "bun run serve",
    "npm --workspace @a-project/site start -- --port 3000",
    "cd site && npm start",
    "PORT=3000 npm start",
    "npm run dev 2>&1 | tee dev.log",
    "npx wrangler dev --port 8787",
    "npx wrangler pages dev ./dist",
    "npx vite dev",
    "npx next start",
    "npx astro preview",
    "npx nuxt dev",
    "npx vite serve",
    "npx --yes http-server -p 8080 .",
    "npx live-server",
    "nodemon server.js",
    "python -m http.server 8000",
    "npx tsc --watch",
    "npx vitest --watch",
    "tail -f server.log",
    "tail -n +1 -F build.log",
    "tail --follow=name server.log",
    "tail --follow server.log",
  ])("knows %s never exits", (command) => {
    expect(commandNeverExits(command)).toBe(true);
  });

  it.each([
    "npm run check",
    "npx vitest run",
    "npx vitest run --watch=false",
    "npm run check 2>&1 | tail -40; rm -f out.log",
    "npm run test:mutation 2>&1 | tail -30 && test -f reports/mutation.json",
    "npm install --save-dev vitest",
    "npm test --prefix D:/dev/a-project",
    "npm run test:coverage > dev.log",
    "pnpm --filter dev-tools test",
    "yarn build:dev",
    "npm run start-and-test",
    "npm run build -- --mode dev",
    "node scripts/serve-check.ts",
    "npx playwright test",
    "npx vite build",
    "npx vite build -- --mode dev",
    "node build.ts dev",
    "npx wrangler deploy",
    "tail -n 40 build.log",
    "sleep 180; echo done",
    "node scripts/render-video.ts > render.log",
    "",
  ])("knows %s exits", (command) => {
    expect(commandNeverExits(command)).toBe(false);
  });

  it("reads a line of nothing but environment as nothing", () => {
    expect(commandNeverExits("PORT=3000")).toBe(false);
  });
});
