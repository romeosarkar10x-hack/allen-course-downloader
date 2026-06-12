import { PP } from "./lib/pp";
import { getCourse } from "./get-course";
import { printTree } from "./utils/print-tree";

PP.addEventListener((eventType, id, metadata) => {
    console.log("Event:", eventType, "for id:", id, "metadata:", JSON.stringify(metadata));
});

(async function dryRun() {
    const course = (await getCourse())._unsafeUnwrap();
    console.log(printTree(course));
})();
