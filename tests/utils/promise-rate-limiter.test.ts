import { describe, test, expect, vi, beforeEach } from "vitest";
import { PromiseRateLimiter } from "@/utils/promise-rate-limiter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flushPromises(rounds = 20) {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

// ===========================================================================
describe("PromiseRateLimiter", () => {
    // -----------------------------------------------------------------------
    describe("constructor — concurrency clamping (Math.max)", () => {
        test("concurrency=5 is preserved", () => {
            expect(new PromiseRateLimiter(5).concurrency).toBe(5);
        });

        test("concurrency=1 stays 1", () => {
            expect(new PromiseRateLimiter(1).concurrency).toBe(1);
        });

        test("concurrency=0 is clamped up to 1", () => {
            expect(new PromiseRateLimiter(0).concurrency).toBe(1);
        });

        test("negative concurrency is clamped up to 1", () => {
            expect(new PromiseRateLimiter(-3).concurrency).toBe(1);
        });

        test("fractional concurrency is floored (3.9 → 3)", () => {
            expect(new PromiseRateLimiter(3.9).concurrency).toBe(3);
        });

        test("fractional concurrency < 1 is clamped to 1 (0.99 → floor 0 → max 1)", () => {
            expect(new PromiseRateLimiter(0.99).concurrency).toBe(1);
        });

        test("large concurrency is preserved", () => {
            expect(new PromiseRateLimiter(100).concurrency).toBe(100);
        });
    });

    // -----------------------------------------------------------------------
    describe("schedule() — basic task execution", () => {
        test("resolves with the task's return value", async () => {
            const limiter = new PromiseRateLimiter(1);
            expect(await limiter.schedule(() => Promise.resolve(42))).toBe(42);
        });

        test("resolves with a string value", async () => {
            const limiter = new PromiseRateLimiter(1);
            expect(await limiter.schedule(() => Promise.resolve("hello"))).toBe("hello");
        });

        test("resolves with an object value", async () => {
            const limiter = new PromiseRateLimiter(1);
            const obj = { a: 1, b: "two" };
            expect(await limiter.schedule(() => Promise.resolve(obj))).toEqual(obj);
        });

        test("resolves with undefined when task returns void", async () => {
            const limiter = new PromiseRateLimiter(1);
            expect(await limiter.schedule(async () => {})).toBeUndefined();
        });

        test("rejects with the task's rejection reason", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => Promise.reject(new Error("task failed"))),
            ).rejects.toThrow("task failed");
        });

        test("rejects with non-Error rejection reasons", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => Promise.reject("string reason")),
            ).rejects.toBe("string reason");
        });

        test("executes the task function exactly once", async () => {
            const limiter = new PromiseRateLimiter(1);
            const fn = vi.fn().mockResolvedValue("ok");
            await limiter.schedule(fn);
            expect(fn).toHaveBeenCalledOnce();
        });

        test("schedule returns a proper Promise (thenable)", () => {
            const limiter = new PromiseRateLimiter(1);
            const p = limiter.schedule(async () => "val");
            expect(p).toBeInstanceOf(Promise);
            return p;
        });
    });

    // -----------------------------------------------------------------------
    describe("schedule() — sequential execution (concurrency=1)", () => {
        test("runs tasks one at a time", async () => {
            const limiter = new PromiseRateLimiter(1);
            const order: string[] = [];
            const gate1 = deferred();
            const gate2 = deferred();

            const p1 = limiter.schedule(async () => {
                order.push("start-1");
                await gate1.promise;
                order.push("end-1");
                return "a";
            });
            const p2 = limiter.schedule(async () => {
                order.push("start-2");
                await gate2.promise;
                order.push("end-2");
                return "b";
            });

            await flushPromises();
            expect(order).toEqual(["start-1"]);

            gate1.resolve();
            await flushPromises();
            expect(order).toEqual(["start-1", "end-1", "start-2"]);

            gate2.resolve();
            await Promise.all([p1, p2]);
            expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
            expect(await p1).toBe("a");
            expect(await p2).toBe("b");
        });

        test("tasks run in FIFO order", async () => {
            const limiter = new PromiseRateLimiter(1);
            const executionOrder: number[] = [];
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(limiter.schedule(async () => { executionOrder.push(i); return i; }));
            }
            const results = await Promise.all(promises);
            expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
            expect(results).toEqual([0, 1, 2, 3, 4]);
        });

        test("three sequential tasks complete in order", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];
            const g1 = deferred(), g2 = deferred(), g3 = deferred();

            const p1 = limiter.schedule(async () => { log.push("s1"); await g1.promise; log.push("e1"); });
            const p2 = limiter.schedule(async () => { log.push("s2"); await g2.promise; log.push("e2"); });
            const p3 = limiter.schedule(async () => { log.push("s3"); await g3.promise; log.push("e3"); });

            await flushPromises();
            expect(log).toEqual(["s1"]);
            g1.resolve(); await flushPromises();
            expect(log).toEqual(["s1", "e1", "s2"]);
            g2.resolve(); await flushPromises();
            expect(log).toEqual(["s1", "e1", "s2", "e2", "s3"]);
            g3.resolve(); await Promise.all([p1, p2, p3]);
            expect(log).toEqual(["s1", "e1", "s2", "e2", "s3", "e3"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("concurrency > 1 — parallel execution", () => {
        test("concurrency=3 runs up to 3 tasks in parallel", async () => {
            const limiter = new PromiseRateLimiter(3);
            const log: string[] = [];
            const gates = [deferred(), deferred(), deferred(), deferred()];

            const p1 = limiter.schedule(async () => { log.push("s1"); await gates[0].promise; log.push("e1"); });
            const p2 = limiter.schedule(async () => { log.push("s2"); await gates[1].promise; log.push("e2"); });
            const p3 = limiter.schedule(async () => { log.push("s3"); await gates[2].promise; log.push("e3"); });
            const p4 = limiter.schedule(async () => { log.push("s4"); await gates[3].promise; log.push("e4"); });

            await flushPromises();
            // First 3 tasks started in parallel, 4th is queued
            expect(log).toEqual(["s1", "s2", "s3"]);

            // Complete task 1 → task 4 should start
            gates[0].resolve();
            await flushPromises();
            expect(log).toContain("e1");
            expect(log).toContain("s4");

            gates[1].resolve(); gates[2].resolve(); gates[3].resolve();
            await Promise.all([p1, p2, p3, p4]);
        });

        test("concurrency=2 allows exactly 2 concurrent tasks", async () => {
            const limiter = new PromiseRateLimiter(2);
            const log: string[] = [];
            const g1 = deferred(), g2 = deferred(), g3 = deferred();

            const p1 = limiter.schedule(async () => { log.push("s1"); await g1.promise; log.push("e1"); });
            const p2 = limiter.schedule(async () => { log.push("s2"); await g2.promise; log.push("e2"); });
            const p3 = limiter.schedule(async () => { log.push("s3"); await g3.promise; log.push("e3"); });

            await flushPromises();
            expect(log).toEqual(["s1", "s2"]); // Only 2 started

            g1.resolve(); await flushPromises();
            expect(log).toContain("e1");
            expect(log).toContain("s3"); // 3rd starts after 1st finishes

            g2.resolve(); g3.resolve();
            await Promise.all([p1, p2, p3]);
        });
    });

    // -----------------------------------------------------------------------
    describe("tick() — recursive draining", () => {
        test("automatically picks up next task after one completes", async () => {
            const limiter = new PromiseRateLimiter(1);
            const results: number[] = [];
            const p1 = limiter.schedule(async () => { results.push(1); return 1; });
            const p2 = limiter.schedule(async () => { results.push(2); return 2; });
            await Promise.all([p1, p2]);
            expect(results).toEqual([1, 2]);
        });

        test("does not start a task when numActive equals concurrency", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];
            const gate = deferred();

            const p1 = limiter.schedule(async () => { log.push("task-1"); await gate.promise; });
            const p2 = limiter.schedule(async () => { log.push("task-2"); });

            await flushPromises();
            expect(log).toEqual(["task-1"]);

            gate.resolve();
            await Promise.all([p1, p2]);
            expect(log).toEqual(["task-1", "task-2"]);
        });

        test("does nothing when the queue is empty", async () => {
            const limiter = new PromiseRateLimiter(1);
            await limiter.schedule(async () => "done");
            // No error, no hang
        });
    });

    // -----------------------------------------------------------------------
    describe("error isolation — one rejection does not affect others", () => {
        test("a rejected task does not prevent subsequent tasks from running", async () => {
            const limiter = new PromiseRateLimiter(1);
            const p1 = limiter.schedule(() => Promise.reject(new Error("fail-1")));
            const p2 = limiter.schedule(() => Promise.resolve("success"));
            await expect(p1).rejects.toThrow("fail-1");
            expect(await p2).toBe("success");
        });

        test("a rejected task does not affect a previously resolved task", async () => {
            const limiter = new PromiseRateLimiter(1);
            const p1 = limiter.schedule(() => Promise.resolve("first-ok"));
            const p2 = limiter.schedule(() => Promise.reject(new Error("second-fail")));
            const p3 = limiter.schedule(() => Promise.resolve("third-ok"));
            expect(await p1).toBe("first-ok");
            await expect(p2).rejects.toThrow("second-fail");
            expect(await p3).toBe("third-ok");
        });

        test("multiple sequential failures do not break the limiter", async () => {
            const limiter = new PromiseRateLimiter(1);
            const p1 = limiter.schedule(() => Promise.reject(new Error("err-1")));
            const p2 = limiter.schedule(() => Promise.reject(new Error("err-2")));
            const p3 = limiter.schedule(() => Promise.resolve("recovered"));
            await expect(p1).rejects.toThrow("err-1");
            await expect(p2).rejects.toThrow("err-2");
            expect(await p3).toBe("recovered");
        });
    });

    // -----------------------------------------------------------------------
    describe("sync throw in task fn — try/catch in tick()", () => {
        // The catch block calls reject(error), decrements numActive,
        // and calls tick() to drain remaining queued tasks.

        test("rejects the scheduled promise with the thrown error", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => { throw new Error("sync-boom"); }),
            ).rejects.toThrow("sync-boom");
        });

        test("numActive is decremented — subsequent tasks still run", async () => {
            const limiter = new PromiseRateLimiter(1);

            await expect(
                limiter.schedule(() => { throw new Error("sync"); }),
            ).rejects.toThrow("sync");

            const result = await limiter.schedule(async () => "recovered");
            expect(result).toBe("recovered");
        });

        test("queued tasks are drained via tick() in catch block", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];

            const p1 = limiter.schedule(() => { throw new Error("sync"); });
            const p2 = limiter.schedule(async () => { log.push("task-2"); return "ok"; });

            await expect(p1).rejects.toThrow("sync");
            expect(await p2).toBe("ok");
            expect(log).toEqual(["task-2"]);
        });

        test("sync throw does not break subsequent tasks", async () => {
            const limiter = new PromiseRateLimiter(1);

            const p1 = limiter.schedule(() => { throw new Error("sync-1"); });
            const p2 = limiter.schedule(() => { throw new Error("sync-2"); });
            const p3 = limiter.schedule(async () => "success");

            await expect(p1).rejects.toThrow("sync-1");
            await expect(p2).rejects.toThrow("sync-2");
            expect(await p3).toBe("success");
        });
    });

    // -----------------------------------------------------------------------
    describe("task queue management (Set-based ordering)", () => {
        test("tasks are dequeued in insertion order (Set iteration order)", async () => {
            const limiter = new PromiseRateLimiter(1);
            const order: string[] = [];
            const gate = deferred();

            const p1 = limiter.schedule(async () => { order.push("A"); await gate.promise; });
            const p2 = limiter.schedule(async () => { order.push("B"); });
            const p3 = limiter.schedule(async () => { order.push("C"); });
            const p4 = limiter.schedule(async () => { order.push("D"); });

            await flushPromises();
            expect(order).toEqual(["A"]);

            gate.resolve();
            await Promise.all([p1, p2, p3, p4]);
            expect(order).toEqual(["A", "B", "C", "D"]);
        });

        test("task is removed from the set before execution (no double-run)", async () => {
            const limiter = new PromiseRateLimiter(1);
            let runCount = 0;
            await limiter.schedule(async () => { runCount++; });
            expect(runCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("generic type propagation", () => {
        test("preserves return type through Promise<T>", async () => {
            const limiter = new PromiseRateLimiter(1);
            const num: number = await limiter.schedule(() => Promise.resolve(42));
            const str: string = await limiter.schedule(() => Promise.resolve("text"));
            const obj: { x: number } = await limiter.schedule(() => Promise.resolve({ x: 1 }));
            expect(num).toBe(42);
            expect(str).toBe("text");
            expect(obj).toEqual({ x: 1 });
        });
    });

    // -----------------------------------------------------------------------
    describe("stress / edge cases", () => {
        test("handles a large number of tasks without hanging", async () => {
            const limiter = new PromiseRateLimiter(1);
            const N = 100;
            const promises: Promise<number>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(limiter.schedule(async () => i));
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(N);
            expect(results).toEqual(Array.from({ length: N }, (_, i) => i));
        });

        test("handles large batch with higher concurrency", async () => {
            const limiter = new PromiseRateLimiter(5);
            const N = 50;
            const promises: Promise<number>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(limiter.schedule(async () => i));
            }
            const results = await Promise.all(promises);
            expect(results).toEqual(Array.from({ length: N }, (_, i) => i));
        });

        test("interleaved schedule calls after awaiting previous ones", async () => {
            const limiter = new PromiseRateLimiter(1);
            expect(await limiter.schedule(async () => 1)).toBe(1);
            expect(await limiter.schedule(async () => 2)).toBe(2);
            expect(await limiter.schedule(async () => 3)).toBe(3);
        });

        test("scheduling after all previous tasks have completed works fine", async () => {
            const limiter = new PromiseRateLimiter(1);
            await limiter.schedule(async () => "batch-1");
            await flushPromises();
            expect(await limiter.schedule(async () => "batch-2")).toBe("batch-2");
        });
    });

    // -----------------------------------------------------------------------
    describe("async task timing", () => {
        test("scheduled promise resolves only after the async task body finishes", async () => {
            const limiter = new PromiseRateLimiter(1);
            let taskFinished = false;
            const gate = deferred();

            const p = limiter.schedule(async () => {
                await gate.promise;
                taskFinished = true;
                return "done";
            });

            await flushPromises();
            expect(taskFinished).toBe(false);

            gate.resolve();
            expect(await p).toBe("done");
            expect(taskFinished).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("numActive bookkeeping", () => {
        test("numActive returns to 0 after all tasks complete", async () => {
            const limiter = new PromiseRateLimiter(1);
            await limiter.schedule(async () => "a");
            await limiter.schedule(async () => "b");

            const log: string[] = [];
            await limiter.schedule(async () => { log.push("started"); });
            expect(log).toEqual(["started"]);
        });

        test("numActive decrements even when task rejects", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => Promise.reject(new Error("fail"))),
            ).rejects.toThrow("fail");

            expect(await limiter.schedule(async () => "after-fail")).toBe("after-fail");
        });
    });

    // -----------------------------------------------------------------------
    describe("finally-based tick() in schedule()", () => {
        test("tick() is called via finally even for the first schedule call", async () => {
            const limiter = new PromiseRateLimiter(1);
            const fn = vi.fn().mockResolvedValue("executed");
            expect(await limiter.schedule(fn)).toBe("executed");
            expect(fn).toHaveBeenCalledOnce();
        });

        test("multiple rapid schedule() calls all eventually resolve", async () => {
            const limiter = new PromiseRateLimiter(1);
            const results = await Promise.all([
                limiter.schedule(async () => 1),
                limiter.schedule(async () => 2),
                limiter.schedule(async () => 3),
                limiter.schedule(async () => 4),
                limiter.schedule(async () => 5),
            ]);
            expect(results).toEqual([1, 2, 3, 4, 5]);
        });
    });

    // -----------------------------------------------------------------------
    describe("mixed resolve / reject ordering", () => {
        test("alternating success and failure maintains order", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: Array<{ type: string; value: any }> = [];

            const p1 = limiter.schedule(async () => { log.push({ type: "resolve", value: 1 }); return 1; });
            const p2 = limiter.schedule(async () => { log.push({ type: "reject", value: 2 }); throw new Error("err-2"); });
            const p3 = limiter.schedule(async () => { log.push({ type: "resolve", value: 3 }); return 3; });
            const p4 = limiter.schedule(async () => { log.push({ type: "reject", value: 4 }); throw new Error("err-4"); });

            expect(await p1).toBe(1);
            await expect(p2).rejects.toThrow("err-2");
            expect(await p3).toBe(3);
            await expect(p4).rejects.toThrow("err-4");

            expect(log).toEqual([
                { type: "resolve", value: 1 },
                { type: "reject", value: 2 },
                { type: "resolve", value: 3 },
                { type: "reject", value: 4 },
            ]);
        });
    });

    // -----------------------------------------------------------------------
    describe("tasks scheduled from within tasks", () => {
        test("inner task (not awaited) runs after outer completes", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];

            const outerP = limiter.schedule(async () => {
                log.push("outer-start");
                limiter.schedule(async () => { log.push("inner"); });
                log.push("outer-end");
            });

            await outerP;
            await flushPromises();
            expect(log).toEqual(["outer-start", "outer-end", "inner"]);
        });

        test("awaiting inner task from outer causes deadlock with concurrency=1", async () => {
            const limiter = new PromiseRateLimiter(1);

            const outerP = limiter.schedule(async () => {
                return await limiter.schedule(async () => "inner-result");
            });

            await flushPromises(50);

            const result = await Promise.race([
                outerP.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });

        test("awaiting inner task works fine with higher concurrency", async () => {
            const limiter = new PromiseRateLimiter(2);

            const result = await limiter.schedule(async () => {
                return await limiter.schedule(async () => "inner-result");
            });

            expect(result).toBe("inner-result");
        });
    });

    // -----------------------------------------------------------------------
    describe("re-usability after drain", () => {
        test("limiter can be reused after all tasks have completed", async () => {
            const limiter = new PromiseRateLimiter(1);

            const batch1 = await Promise.all([
                limiter.schedule(async () => "a"),
                limiter.schedule(async () => "b"),
            ]);
            expect(batch1).toEqual(["a", "b"]);

            const batch2 = await Promise.all([
                limiter.schedule(async () => "c"),
                limiter.schedule(async () => "d"),
            ]);
            expect(batch2).toEqual(["c", "d"]);
        });

        test("limiter can be reused after errors", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => Promise.reject(new Error("oops"))),
            ).rejects.toThrow("oops");
            expect(await limiter.schedule(async () => "fine")).toBe("fine");
        });
    });
});
