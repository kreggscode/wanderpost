import { defineConfig } from "vitest/config";

// Served from GitHub Pages at /wanderpost/.
export default defineConfig({
    base: "/wanderpost/",
    build: {
        outDir: "dist",
        sourcemap: false,
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
