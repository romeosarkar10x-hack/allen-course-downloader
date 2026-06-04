import "dotenv/config";
import z from "zod";
import { zodParseAsync } from "@/utils/zod-parse-async";

const EnvSchema = z.object({
    BEARER_TOKEN: z.jwt(),
    STREAM: z.string(),
    TAXONOMY: z.string(),
    SELECTED_COURSE_ID: z.string(),
    SELECTED_BATCH_LIST: z.string().transform(list => list.split(",")),
    BATCH_ID: z.string().transform(list => list.split(",")),
});

export const EnvResultAsync = zodParseAsync(EnvSchema)(process.env);
