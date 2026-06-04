import { PromiseRateLimiter } from "@/utils/promise-rate-limiter";

export const PRL = new PromiseRateLimiter(4);
