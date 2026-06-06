import "dotenv/config";
import z from "zod";
import { zodParseAsync } from "@/utils/zod-parse-async";

const EnvSchema = z.object({
    BEARER_TOKEN: z.jwt(),
    TAXONOMY: z.string(),
    SELECTED_COURSE_ID: z.string(),
});

export const EnvResultAsync = zodParseAsync(EnvSchema)(process.env);
