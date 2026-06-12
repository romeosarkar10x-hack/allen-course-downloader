import { build } from "esbuild";

await build({
    entryPoints: ["src/dry-run.ts"],
    bundle: true,
    platform: "node",
    outdir: "dist",
    outExtension: {
        ".js": ".cjs",
    },
});
