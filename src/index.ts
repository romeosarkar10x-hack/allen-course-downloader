import fs from "fs";
import { outputCourseMapPathname, selectedCourseID } from "./config";
import getCourseContents from "./get-course-contents.js";
import filter from "./filter";
import recurse from "./recurse";
import download from "./download";
import PersistentState from "./utils/persistent-state.js";

(async function main() {
    const course = new PersistentState(`out/${selectedCourseID}.json`, getCourseContents);
    const courseObj = await course.getStateObj();
    filter(courseObj);
    fs.writeFileSync(outputCourseMapPathname, recurse(courseObj), "utf8");
    await course.close();
    download(courseObj);
})();
