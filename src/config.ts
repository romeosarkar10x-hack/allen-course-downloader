import fs from "fs";

const uri = "https://api.allen-live.in/api/v1/pages/getPage";

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
