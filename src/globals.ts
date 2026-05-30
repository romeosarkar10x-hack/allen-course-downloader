import { uri, batchID, selectedBatchList, selectedCourseID, stream, taxonomyID } from "./config.js";
import RateLimiter from "./utilities/RateLimiter.js";
// const subject_id = "2"; // 354 for Physics, 152 for Maths, 2 for Chemistry

const commonParams = new URLSearchParams();

commonParams.append("batch_id", batchID.join(","));
commonParams.append("selected_batch_list", selectedBatchList.join(","));
commonParams.append("selected_course_id", selectedCourseID);
commonParams.append("stream", stream);
commonParams.append("taxonomy_id", taxonomyID);

const headers = {
    "Authorization": "Bearer " + process.env.BEARER_TOKEN,
    "X-Client-Type": "web",
    "X-Locale": "en",
    "X-Selected-Batch-List": commonParams.get("selected_batch_list"),
    "X-Selected-Course-Id": commonParams.get("selected_course_id"),
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
};

const rateLimiter = new RateLimiter(1);

export { uri, batchID, selectedBatchList, selectedCourseID, stream, taxonomyID, commonParams, headers, rateLimiter };
