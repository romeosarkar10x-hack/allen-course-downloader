import { safeMkdir } from "@/utils/safe-mkdir";

const OUTPUT_DIR_NAME = "downloads";

export const outputDirectoryResultAsync = (function () {
    const dirPathname = OUTPUT_DIR_NAME;
    return safeMkdir(dirPathname).map(() => dirPathname);
})();
