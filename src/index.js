import fs from "fs";
import { outputCourseMapPathname, selectedCourseID } from "./config.js";
import getCourseContents from "./getCourseContents.js";
import filter from "./filter.js";
import recurse from "./recurse.js";
import download from "./download.js";
import PersistentState from "./utilities/PersistentState.js";

(async function main() {
    const course = new PersistentState(`out/${selectedCourseID}.json`, getCourseContents);
    const courseObj = await course.getStateObj();
    filter(courseObj);
    fs.writeFileSync(outputCourseMapPathname, recurse(courseObj), "utf8");
    await course.close();
    download(courseObj);
})();
