import { fromPromise } from "neverthrow";
import { EnvResultAsync } from "./lib/env";
import { PP } from "@/lib/pp";
import { parseResponseJSON } from "./utils/parse-response-json";
import { zodParseAsync } from "./utils/zod-parse-async";
import { ChapterDetailsResponseSchema } from "./schemas/chapter-details";
import { commonHeaders } from "./constants";

export function getChapterDetails({ subjectID, id, name }: { subjectID: string; id: string; name: string }) {
    return EnvResultAsync.andThen(env => {
        const url = "https://api.allen-live.in/api/v1/pages/getPage";

        const searchParams = new URLSearchParams();
        searchParams.append("batch_id", env.BATCH_ID.join(","));
        searchParams.append("selected_batch_list", env.SELECTED_BATCH_LIST.join(","));
        searchParams.append("selected_course_id", env.SELECTED_COURSE_ID);
        searchParams.append("stream", env.STREAM);
        searchParams.append("subject_id", subjectID);
        searchParams.append("taxonomy_id", env.TAXONOMY);
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
                    "Authorization": `Bearer ${env.BEARER_TOKEN}`,
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
    });
}
