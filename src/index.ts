import { PP } from "./lib/pp";
import { getCourse } from "./get-course";
import { downloadTree } from "./download-tree";

PP.addEventListener((eventType, id, metadata) => {
    console.log("Event:", eventType, "for id:", id, "metadata:", JSON.stringify(metadata));
});

(async function dryRun() {
    const courseTree = (await getCourse())._unsafeUnwrap();
    downloadTree(courseTree);
})();
