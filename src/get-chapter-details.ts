import { fromPromise } from "neverthrow";
import { EnvResultAsync } from "./lib/env";
import { PP } from "@/lib/pp";
import { parseResponseJSON } from "./utils/parse-response-json";
import { zodParseAsync } from "./utils/zod-parse-async";
import { ChapterDetailsResponseSchema } from "./schemas/chapter-details";
import { commonHeaders } from "./constants";

export function getChapterDetails({
    id,
    name,
    subjectID,
    batchIDs,
    selectedBatchList,
    selectedCourseID,
    stream,
    taxonomy,
    bearerToken,
}: {
    id: string;
    name: string;
    stream: string;
    taxonomy: string;
    batchIDs: string[];
    subjectID: string;
    selectedBatchList: string[];
    selectedCourseID: string;
    bearerToken: string;
}) {
    const url = "https://api.allen-live.in/api/v1/pages/getPage";

    const searchParams = new URLSearchParams();
    searchParams.append("batch_id", batchIDs.join(","));
    searchParams.append("selected_batch_list", selectedBatchList.join(","));
    searchParams.append("selected_course_id", selectedCourseID);
    searchParams.append("stream", stream);
    searchParams.append("subject_id", subjectID);
    searchParams.append("taxonomy_id", taxonomy);
    searchParams.append("topic_id", id);

    const payload = {
        page_url: "/topic-details?" + searchParams.toString(),
    };

    const task = () =>
        fetch(url, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${bearerToken}`,
                ...commonHeaders,
            },
        });

    const taskMetadata = { fetch: { path: "/topic-details", subjectID, topicID: id } };

    return fromPromise(PP.schedule(task, taskMetadata).promise, error => error as Error)
        .andThen(parseResponseJSON)
        .andThen(zodParseAsync(ChapterDetailsResponseSchema))
        .map(details => ({
            $: details,
            name,
        }));
}
