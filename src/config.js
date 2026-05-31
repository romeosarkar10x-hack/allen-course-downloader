import "dotenv/config";
import fs from "fs";

const uri = "https://api.allen-live.in/api/v1/pages/getPage";
const batchID = [
    "bt_ORA8IvlO0uJrgUzCpqDD2",
    "bt_6iTAx9qGKWOtlHNKHXtAy",
    "bt_Eu5fNGJVdWnOsYx0Gln0c",
    "bt_1q5nGW30RrJUQGMVBzP6e",
    "bt_ZRcfokhD8PuAGgCo0r6Ig",
];
const selectedBatchList = [
    "bt_ORA8IvlO0uJrgUzCpqDD2",
    "bt_6iTAx9qGKWOtlHNKHXtAy",
    "bt_4lsHiXc2Q4n7ixreMiqFf",
    "bt_6LlBjESE33kt0khvPQdgu",
    "bt_n5tA1oHiHB5X1y1XOkkZc",
    "bt_3scoa5ObDiRg5C7BgcasI",
    "bt_lgugkrexGcdNFoMB5B7T9",
    "bt_fvy9VMozVEbyFtR6axQhi",
    "bt_r1sCnVh70lmgIDWLjoPZT",
    "bt_hC1SBV6mmRPc2HsHzTAbd",
    "bt_GdnoJEv5jveY2NP6CKaUU",
    "bt_Eu5fNGJVdWnOsYx0Gln0c",
    "bt_1q5nGW30RrJUQGMVBzP6e",
    "bt_2ZtJAkCb30rjG3BtWTjki",
    "bt_nYFmT9pVTYBEsEit4Pcnv",
    "bt_NuEXZHxrL8iq6cbuXzX2c",
    "bt_9ZcSWPclJdOZLlV0j1b4y",
    "bt_ZRcfokhD8PuAGgCo0r6Ig",
];
const selectedCourseID = "cr_ifsxXemTSLnySt6Duju9v";
const stream = "STREAM_JEE_MAIN_ADVANCED";
const taxonomyID = "1739171216OJ";

const subjects = [
    { title: "Physics", subjectID: "1160" },
    { title: "Chemistry", subjectID: "746" },
    { title: "Mathematics", subjectID: "1264" },
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
