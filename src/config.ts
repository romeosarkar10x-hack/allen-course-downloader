import "dotenv/config";
import fs from "fs";

const uri = "https://api.allen-live.in/api/v1/pages/getPage";
const batchID = ["bt_B8pZxUP9RdEsaiKZNddiH"];
const selectedBatchList = ["bt_B8pZxUP9RdEsaiKZNddiH"];
const selectedCourseID = "course_bxMhJk4o1MGkEp3CKKAad";
const stream = "STREAM_JEE_MAIN_ADVANCED";
const taxonomyID = "1699072624yb";

const subjects = [
    { title: "Physics", subjectID: "354" },
    { title: "Chemistry", subjectID: "2" },
    { title: "Mathematics", subjectID: "152" },
];

const outputDirPathname = "./out";
const outputCourseMapPathname = `${outputDirPathname}/${selectedCourseID}.map`;
// const outputCourseDirPathname = `${outputDirPathname}/${selectedCourseID}`;

if (!fs.existsSync(outputDirPathname)) {
    fs.mkdirSync(outputDirPathname);
}

/*
if (!fs.existsSync(outputCourseDirPathname)) {
    fs.mkdirSync(outputCourseDirPathname);
}
    */

export {
    subjects,
    uri,
    batchID,
    selectedBatchList,
    selectedCourseID,
    stream,
    taxonomyID,
    outputCourseMapPathname,
    outputDirPathname,
};
