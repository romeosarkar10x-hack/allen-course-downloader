import { fromPromise } from "neverthrow";
import { commonHeaders } from "./constants";
import { EnvResultAsync } from "./lib/env";
import { PP } from "./lib/pp";
import { parseResponseJSON } from "./utils/parse-response-json";
import { zodParseAsync } from "./utils/zod-parse-async";
import { StudentDetailsSchema } from "./schemas/student-details";

export function getStudentDetails({ bearerToken }: { bearerToken: string }) {
    const url = "https://api.allen-live.in/api/v1/user/studentInfo";

    const task = () =>
        fetch(url, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${bearerToken}`,
                ...commonHeaders,
            },
        });

    const taskMetadata = { fetch: { path: "/student-info" } };

    return fromPromise(PP.schedule(task, taskMetadata).promise, error => error as Error)
        .andThen(parseResponseJSON)
        .andThen(zodParseAsync(StudentDetailsSchema));
}
