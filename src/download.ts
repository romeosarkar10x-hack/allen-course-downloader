import fs from "fs";
import { outputDirPathname, selectedCourseID } from "./config.js";
import { rateLimiter } from "./globals.js";
import PersistentState from "./utilities/PersistentState.js";

const metadataFilePathname = `${outputDirPathname}/metadata.json`;
const downloadsMetadataState = new PersistentState(metadataFilePathname);

/*
let downloads = new Map();

try {
    fs.accessSync(metadataFilePathname, fs.constants.F_OK);
    const metadata = fs.readFileSync(metadataFilePathname, "utf-8");

    const obj = JSON.parse(metadata);

    for (let key in obj) {
        downloads.set(key, obj[key]);
    }
} catch (err) {
    console.log(err);
}

function saveMetadata() {
    const obj = {};

    downloads.forEach((value, key) => {
        obj[key] = value;
    });

    const metadata = JSON.stringify(obj);
    fs.writeFileSync(metadataFilePathname, metadata, "utf8");
}

*/
function callbackOnDownloadCompleted(event, obj) {
    if (event == "end") {
        if (400 <= obj.res.statusCode && obj.res.statusCode < 600) {
            console.log(`Failed to download \`${obj.reqID}\``);
        } else {
            // console.log("callbackOnDownloadCompleted", obj);
            console.log(`Downloaded \`${obj.reqID}\`!`);
            const reqID = obj.reqID;
            // downloads.set(obj.reqID, true);
            downloadsMetadataState.setStateObj(obj => {
                // console.log("callback for setState!", obj);
                const newState = {
                    ...obj,
                };
                // console.log("Obj.reqID:", reqID);
                newState[reqID] = true;
                // console.log("newState", newState);
                return newState;
            });
            // saveMetadata();
        }
    }
}

export default function download(course) {
    async function downloadRecursively(node, pathname) {
        try {
            if (!fs.existsSync(pathname)) {
                fs.mkdirSync(pathname);
            }
        } catch (err) {
            console.log(err);
            return;
        }

        if (node.cards) {
            node.cards.forEach(card => {
                downloadRecursively(card, pathname + "/" + node.title);
            });
            return;
        }

        const filePathname = pathname + "/" + node.title + ".mp4";

        if (!(await downloadsMetadataState.getStateObj())[filePathname]) {
            rateLimiter.request(
                node.uri,
                null,
                {
                    pathname: filePathname,
                },
                filePathname,
                callbackOnDownloadCompleted,
            );
        } else {
            console.log(`\`${filePathname}\` skipped!`);
        }
    }

    downloadRecursively(course, outputDirPathname);
}
