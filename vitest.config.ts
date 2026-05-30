import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        alias: {
            "@": "src/",
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "coverage",
            reporter: ["html", "lcov", "text"],
            cleanOnRerun: true,
        },
    },
});
