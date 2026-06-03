import { fromPromise } from "neverthrow";
import { EnvResultAsync } from "./lib/env";
import { PRL } from "@/lib/prl";
import { parseResponseJSON } from "./utils/parse-response-json";
import { zodParseAsync } from "./utils/zod-parse-async";
import { SubjectDetailsResponseSchema } from "./schemas/subject-details";

export function getSubjectDetails({ id }: { id: string }) {
    return EnvResultAsync.andThen(env => {
        const url = "https://api.allen-live.in/api/v1/pages/getPage";

        const searchParams = new URLSearchParams();
        searchParams.append("batch_id", env.BATCH_ID.join(","));
        searchParams.append("selected_batch_list", env.SELECTED_BATCH_LIST.join(","));
        searchParams.append("selected_course_id", env.SELECTED_COURSE_ID);
        searchParams.append("stream", env.STREAM);
        searchParams.append("subject_id", id);
        searchParams.append("taxonomy", env.TAXONOMY);

        const payload = {
            page_url: "/subject-details?" + searchParams.toString(),
        };

        const task = () =>
            fetch(url, {
                body: JSON.stringify(payload),
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${env.BEARER_TOKEN}`,
                },
            });

        return fromPromise(PRL.schedule(task), error => error as Error)
            .andThen(parseResponseJSON)
            .andThen(zodParseAsync(SubjectDetailsResponseSchema));
    });
}
