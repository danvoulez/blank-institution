import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const privateNoStore = { "cache-control": "private, no-store" } as const;
const noStore = { "cache-control": "no-store" } as const;

// Eve's own modules import each other through its package `imports` field
// (`#*.js` -> `./dist/src/*.js`). Nuxt 4 aliases the bare specifier `#shared`
// to this project's shared/ directory, and that alias wins inside the Nitro
// bundle, so `#shared/tool-schema.js` resolved to `<root>/shared//tool-schema.js`
// and the server build failed to load it.
//
// Eve's internal specifiers always carry the .js extension and ours never do,
// which is enough to tell them apart and send only Eve's back to Eve.
const eveDist = resolve(dirname(createRequire(import.meta.url).resolve("eve/package.json")), "dist/src");

const resolveEveInternalImports = {
  name: "eve-internal-subpath-imports",
  resolveId(id: string) {
    const match = /^#(.+)\.js$/.exec(id);
    return match ? resolve(eveDist, `${match[1]}.js`) : null;
  },
};

export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@comark/nuxt", "eve/nuxt", "@nuxthub/core", "@vercel/analytics"],
  typescript: {
    // The domain tests run under `node --experimental-strip-types`, which
    // requires relative imports to carry the .ts extension. Nuxt emits a
    // separate tsconfig per layer, so the option has to be set on each one
    // that covers a test file.
    tsConfig: { compilerOptions: { allowImportingTsExtensions: true } },
    sharedTsConfig: { compilerOptions: { allowImportingTsExtensions: true } },
  },
  eve: {
    eveBuildCommand: "pnpm process:generate && eve build",
  },
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  compatibilityDate: "latest",
  experimental: {
    payloadExtraction: true,
    viewTransition: true,
  },
  routeRules: {
    "/login": { prerender: true },
    "/": { ssr: true, headers: privateNoStore },
    "/chat/**": { ssr: true, headers: privateNoStore },
    "/processes/**": { ssr: true, headers: privateNoStore },
    "/settings/**": { ssr: true, headers: privateNoStore },
    "/api/auth/**": { headers: noStore },
    "/api/internal/**": { headers: noStore },
    "/api/profile": { headers: privateNoStore },
    "/api/profile/**": { headers: privateNoStore },
    "/api/threads": { headers: privateNoStore },
    "/api/threads/**": { headers: privateNoStore },
    "/api/memory": { headers: privateNoStore },
    "/api/memory/**": { headers: privateNoStore },
    "/api/connectors": { headers: privateNoStore },
    "/api/processes": { headers: privateNoStore },
    "/api/processes/**": { headers: privateNoStore },
    "/api/process-intakes/**": { headers: privateNoStore },
    "/api/process-types": { headers: privateNoStore },
    "/api/process-api-tokens/**": { headers: privateNoStore },
    "/api/runtime": { headers: privateNoStore },
    "/api/mcp": { headers: noStore },
    "/api/slack/**": { headers: privateNoStore },
    "/api/integrations/**": { headers: privateNoStore },
  },
  nitro: {
    typescript: { tsConfig: { compilerOptions: { allowImportingTsExtensions: true } } },
    rollupConfig: { plugins: [resolveEveInternalImports] },
    compressPublicAssets: true,
    prerender: {
      routes: ["/login"],
      crawlLinks: false,
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Eve Institution",
      titleTemplate: "%s",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      meta: [
        {
          name: "description",
          content:
            "A durable process institution powered by Eve: every intake is analyzed, assigned, executed, reviewed, and recovered.",
        },
        { name: "theme-color", content: "#1b1718" },
        { name: "color-scheme", content: "light dark" },
        { name: "robots", content: "index, follow" },
      ],
      link: [
        { rel: "icon", href: "/favicon.ico" },
      ],
    },
  },

  fonts: {
    families: [
      { name: 'Geist', weights: ['100 900'], global: true },
      { name: 'Geist Mono', weights: ['100 900'], global: true },
    ],
  },

  hub: {
    db: "sqlite",
  },
  runtimeConfig: {
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || "",
    },
  },
});
