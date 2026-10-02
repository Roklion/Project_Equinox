import { buildSync } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const result = buildSync({ entryPoints: ["scripts/chart-fixture-client.tsx"], bundle: true, write: false,
  platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const css = readFileSync("src/app/globals.css", "utf8");
mkdirSync(".next", { recursive: true });
writeFileSync(".next/chart-fixture.html", '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'
  + css + '</style></head><body><div id="root"></div><script>' + result.outputFiles[0].text + '</script></body></html>');
