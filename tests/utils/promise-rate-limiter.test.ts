import { describe, test, expect, vi, beforeEach } from "vitest";
import { PromiseRateLimiter } from "@/utils/promise-rate-limiter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for all micro-tasks and pending promise continuations to drain. */
async function flushPromises(rounds = 20) {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

/**
 * Creates a deferred promise — a promise whose resolve/reject can be
 * triggered externally.  Useful for controlling task execution timing.
 */
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
    describe("constructor — concurrency clamping", () => {
        // NOTE: The implementation uses `Math.min(1, Math.floor(concurrency))`
        // which means the effective concurrency is always ≤ 1.
        // This test suite documents that (possibly unintended) behavior.

        test("concurrency property is set to the clamped value", () => {
            const limiter = new PromiseRateLimiter(5);
            // Math.min(1, Math.floor(5)) = Math.min(1, 5) = 1
            expect(limiter.concurrency).toBe(1);
        });

        test("concurrency of 1 stays 1", () => {
            const limiter = new PromiseRateLimiter(1);
            expect(limiter.concurrency).toBe(1);
        });

        test("concurrency of 0 is clamped to 0 (Math.min(1, 0) = 0)", () => {
            const limiter = new PromiseRateLimiter(0);
            // Math.min(1, Math.floor(0)) = Math.min(1, 0) = 0
            expect(limiter.concurrency).toBe(0);
        });

        test("negative concurrency stays negative (Math.min(1, -3) = -3)", () => {
            const limiter = new PromiseRateLimiter(-3);
            expect(limiter.concurrency).toBe(-3);
        });

        test("fractional concurrency is floored then clamped", () => {
            const limiter = new PromiseRateLimiter(3.9);
            // Math.min(1, Math.floor(3.9)) = Math.min(1, 3) = 1
            expect(limiter.concurrency).toBe(1);
        });

        test("fractional concurrency < 1 is floored to 0", () => {
            const limiter = new PromiseRateLimiter(0.99);
            // Math.min(1, Math.floor(0.99)) = Math.min(1, 0) = 0
            expect(limiter.concurrency).toBe(0);
        });

        test("large concurrency is clamped to 1", () => {
            const limiter = new PromiseRateLimiter(100);
            expect(limiter.concurrency).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    describe("schedule() — basic task execution", () => {
        test("resolves with the task's return value", async () => {
            const limiter = new PromiseRateLimiter(1);
            const result = await limiter.schedule(() => Promise.resolve(42));
            expect(result).toBe(42);
        });

        test("resolves with a string value", async () => {
            const limiter = new PromiseRateLimiter(1);
            const result = await limiter.schedule(() => Promise.resolve("hello"));
            expect(result).toBe("hello");
        });

        test("resolves with an object value", async () => {
            const limiter = new PromiseRateLimiter(1);
            const obj = { a: 1, b: "two" };
            const result = await limiter.schedule(() => Promise.resolve(obj));
            expect(result).toEqual(obj);
        });

        test("resolves with undefined when task returns void", async () => {
            const limiter = new PromiseRateLimiter(1);
            const result = await limiter.schedule(async () => {});
            expect(result).toBeUndefined();
        });

        test("rejects with the task's rejection reason", async () => {
            const limiter = new PromiseRateLimiter(1);
            const error = new Error("task failed");
            await expect(
                limiter.schedule(() => Promise.reject(error)),
            ).rejects.toThrow("task failed");
        });

        test("rejects when the task function throws synchronously", async () => {
            const limiter = new PromiseRateLimiter(1);
            await expect(
                limiter.schedule(() => {
                    throw new Error("sync throw");
                }),
            ).rejects.toThrow("sync throw");
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

            // Give micro-tasks time to start the first task
            await flushPromises();

            // Only task 1 should have started
            expect(order).toEqual(["start-1"]);

            // Complete task 1
            gate1.resolve();
            await flushPromises();

            // Task 1 is done, task 2 starts
            expect(order).toEqual(["start-1", "end-1", "start-2"]);

            // Complete task 2
            gate2.resolve();
            await Promise.all([p1, p2]);

            expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
            expect(await p1).toBe("a");
            expect(await p2).toBe("b");
        });

        test("tasks run in FIFO order", async () => {
            const limiter = new PromiseRateLimiter(1);
            const executionOrder: number[] = [];

            // Schedule several tasks — all should start after the previous one finishes
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    limiter.schedule(async () => {
                        executionOrder.push(i);
                        return i;
                    }),
                );
            }

            const results = await Promise.all(promises);
            expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
            expect(results).toEqual([0, 1, 2, 3, 4]);
        });

        test("three sequential tasks complete in order", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];

            const g1 = deferred();
            const g2 = deferred();
            const g3 = deferred();

            const p1 = limiter.schedule(async () => {
                log.push("s1");
                await g1.promise;
                log.push("e1");
            });
            const p2 = limiter.schedule(async () => {
                log.push("s2");
                await g2.promise;
                log.push("e2");
            });
            const p3 = limiter.schedule(async () => {
                log.push("s3");
                await g3.promise;
                log.push("e3");
            });

            await flushPromises();
            expect(log).toEqual(["s1"]);

            g1.resolve();
            await flushPromises();
            expect(log).toEqual(["s1", "e1", "s2"]);

            g2.resolve();
            await flushPromises();
            expect(log).toEqual(["s1", "e1", "s2", "e2", "s3"]);

            g3.resolve();
            await Promise.all([p1, p2, p3]);
            expect(log).toEqual(["s1", "e1", "s2", "e2", "s3", "e3"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("tick() — recursive draining", () => {
        test("automatically picks up next task after one completes", async () => {
            const limiter = new PromiseRateLimiter(1);
            const results: number[] = [];

            const p1 = limiter.schedule(async () => {
                results.push(1);
                return 1;
            });
            const p2 = limiter.schedule(async () => {
                results.push(2);
                return 2;
            });

            await Promise.all([p1, p2]);
            expect(results).toEqual([1, 2]);
        });

        test("does not start a task when numActive equals concurrency", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];

            const gate = deferred();

            // First task blocks
            const p1 = limiter.schedule(async () => {
                log.push("task-1-running");
                await gate.promise;
            });

            // Second task should be queued, not started
            const p2 = limiter.schedule(async () => {
                log.push("task-2-running");
            });

            await flushPromises();

            // Only task-1 is running
            expect(log).toEqual(["task-1-running"]);

            gate.resolve();
            await Promise.all([p1, p2]);
            expect(log).toEqual(["task-1-running", "task-2-running"]);
        });

        test("does nothing when the queue is empty", async () => {
            const limiter = new PromiseRateLimiter(1);

            // Run a task and let it complete — tick() fires on empty queue
            await limiter.schedule(async () => "done");

            // No error, no hang — the limiter is idle
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

        test("BUG: sync throw in task fn deadlocks subsequent tasks (numActive is never decremented)", async () => {
            // When fn() throws synchronously, fn().then().catch().finally() never
            // executes because fn() throws before the promise chain is set up.
            // This means numActive is never decremented, permanently blocking
            // the limiter at capacity.
            const limiter = new PromiseRateLimiter(1);

            const p1 = limiter.schedule(() => {
                throw new Error("sync-boom");
            });

            // p1 rejects because tick()'s throw propagates through schedule()'s finally
            await expect(p1).rejects.toThrow("sync-boom");

            // But numActive is now stuck at 1, so the next task never starts
            const fn = vi.fn().mockResolvedValue("never-runs");
            const p2 = limiter.schedule(fn);

            await flushPromises(50);

            // Task 2 is stuck — it will never execute
            expect(fn).not.toHaveBeenCalled();

            // Verify the promise is still pending (deadlocked)
            const result = await Promise.race([
                p2.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });
    });

    // -----------------------------------------------------------------------
    describe("concurrency enforcement with Math.min bug", () => {
        // Because the constructor uses Math.min(1, floor(n)), effective
        // concurrency is always ≤ 1 — even for concurrency=5.
        // These tests document that behavior.

        test("concurrency=5 still runs tasks one at a time (due to Math.min bug)", async () => {
            const limiter = new PromiseRateLimiter(5);
            expect(limiter.concurrency).toBe(1);

            const log: string[] = [];
            const gate1 = deferred();

            const p1 = limiter.schedule(async () => {
                log.push("start-1");
                await gate1.promise;
                log.push("end-1");
            });

            const p2 = limiter.schedule(async () => {
                log.push("start-2");
            });

            await flushPromises();
            // Even with concurrency=5 passed, only one task runs at a time
            expect(log).toEqual(["start-1"]);

            gate1.resolve();
            await Promise.all([p1, p2]);
            expect(log).toEqual(["start-1", "end-1", "start-2"]);
        });
    });

    // -----------------------------------------------------------------------
    describe("concurrency=0 — tasks are never started", () => {
        // With concurrency=0, numActive (0) === concurrency (0) is true
        // from the start, so tick() returns immediately without running tasks.

        test("scheduled tasks never execute when concurrency is 0", async () => {
            const limiter = new PromiseRateLimiter(0);
            expect(limiter.concurrency).toBe(0);

            const fn = vi.fn().mockResolvedValue("should not run");
            const p = limiter.schedule(fn);

            await flushPromises(50);

            // Task function was never called
            expect(fn).not.toHaveBeenCalled();

            // The promise never settles — it stays pending forever.
            // We verify by racing it against a timeout.
            const result = await Promise.race([
                p.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });
    });

    // -----------------------------------------------------------------------
    describe("concurrency with negative values", () => {
        test("negative concurrency also blocks all tasks (numActive > concurrency is never true initially since 0 === -3 is false but 0 !== -3 ... wait, let me check)", async () => {
            // With concurrency=-3: numActive starts at 0.
            // tick() checks: if (0 === -3) return;  → false, so it proceeds!
            // This means it WILL run a task. Then numActive becomes 1.
            // After that task completes, numActive goes back to 0, and it ticks again.
            // So negative concurrency actually allows tasks to run one at a time
            // (because numActive can never equal a negative number).
            const limiter = new PromiseRateLimiter(-3);
            const fn = vi.fn().mockResolvedValue("ran");
            const result = await limiter.schedule(fn);
            expect(fn).toHaveBeenCalledOnce();
            expect(result).toBe("ran");
        });

        test("negative concurrency runs all tasks — numActive never matches", async () => {
            // numActive is always ≥ 0, so it can never equal a negative concurrency.
            // tick() never short-circuits on the concurrency check, meaning tasks
            // will actually be started eagerly (no limit) since numActive always != concurrency.
            const limiter = new PromiseRateLimiter(-1);
            const log: string[] = [];

            const gate1 = deferred();
            const gate2 = deferred();

            const p1 = limiter.schedule(async () => {
                log.push("start-1");
                await gate1.promise;
                log.push("end-1");
            });

            const p2 = limiter.schedule(async () => {
                log.push("start-2");
                await gate2.promise;
                log.push("end-2");
            });

            await flushPromises();

            // Both tasks should have started concurrently because
            // numActive (1) !== concurrency (-1) in tick() check
            expect(log).toContain("start-1");
            expect(log).toContain("start-2");

            gate1.resolve();
            gate2.resolve();
            await Promise.all([p1, p2]);
        });
    });

    // -----------------------------------------------------------------------
    describe("schedule() — try/finally ensures tick() always runs", () => {
        test("tick() runs even though the Promise constructor is synchronous", async () => {
            // The try/finally in schedule() ensures tick() is called after the
            // task is added to the set, regardless of how the Promise constructor behaves.
            const limiter = new PromiseRateLimiter(1);
            const result = await limiter.schedule(async () => "ok");
            expect(result).toBe("ok");
        });
    });

    // -----------------------------------------------------------------------
    describe("task queue management (Set-based ordering)", () => {
        test("tasks are dequeued in insertion order (Set iteration order)", async () => {
            const limiter = new PromiseRateLimiter(1);
            const order: string[] = [];

            // The first task blocks, ensuring tasks 2-4 pile up in the queue
            const gate = deferred();

            const p1 = limiter.schedule(async () => {
                order.push("A");
                await gate.promise;
            });

            const p2 = limiter.schedule(async () => { order.push("B"); });
            const p3 = limiter.schedule(async () => { order.push("C"); });
            const p4 = limiter.schedule(async () => { order.push("D"); });

            await flushPromises();
            expect(order).toEqual(["A"]);

            gate.resolve();
            await Promise.all([p1, p2, p3, p4]);

            // Insertion-order iteration of Set guarantees B → C → D
            expect(order).toEqual(["A", "B", "C", "D"]);
        });

        test("task is removed from the set before execution (no double-run)", async () => {
            const limiter = new PromiseRateLimiter(1);
            let runCount = 0;

            await limiter.schedule(async () => {
                runCount++;
            });

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

        test("interleaved schedule calls after awaiting previous ones", async () => {
            const limiter = new PromiseRateLimiter(1);

            const r1 = await limiter.schedule(async () => 1);
            const r2 = await limiter.schedule(async () => 2);
            const r3 = await limiter.schedule(async () => 3);

            expect(r1).toBe(1);
            expect(r2).toBe(2);
            expect(r3).toBe(3);
        });

        test("scheduling after all previous tasks have completed works fine", async () => {
            const limiter = new PromiseRateLimiter(1);

            await limiter.schedule(async () => "batch-1");
            await flushPromises();

            // Limiter is idle now. Schedule a new task.
            const result = await limiter.schedule(async () => "batch-2");
            expect(result).toBe("batch-2");
        });

        test("schedule returns a proper Promise (thenable)", () => {
            const limiter = new PromiseRateLimiter(1);
            const p = limiter.schedule(async () => "val");
            expect(p).toBeInstanceOf(Promise);
            return p; // let vitest handle await
        });
    });

    // -----------------------------------------------------------------------
    describe("async task timing — resolution happens after task completes", () => {
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
            const result = await p;

            expect(taskFinished).toBe(true);
            expect(result).toBe("done");
        });
    });

    // -----------------------------------------------------------------------
    describe("numActive bookkeeping", () => {
        test("numActive returns to 0 after all tasks complete", async () => {
            const limiter = new PromiseRateLimiter(1);

            await limiter.schedule(async () => "a");
            await limiter.schedule(async () => "b");

            // After all tasks complete, numActive should be 0.
            // We can verify indirectly: a new task should start immediately.
            const log: string[] = [];
            const p = limiter.schedule(async () => {
                log.push("started");
            });
            await p;
            expect(log).toEqual(["started"]);
        });

        test("numActive decrements even when task rejects", async () => {
            const limiter = new PromiseRateLimiter(1);

            await expect(
                limiter.schedule(() => Promise.reject(new Error("fail"))),
            ).rejects.toThrow("fail");

            // If numActive wasn't decremented, this task would never run
            const result = await limiter.schedule(async () => "after-fail");
            expect(result).toBe("after-fail");
        });

        test("BUG: numActive is NOT decremented when task throws synchronously (deadlock)", async () => {
            // This is the same underlying bug: fn() throws before the promise
            // chain (.then/.catch/.finally) is established, so the .finally()
            // that decrements numActive never runs.
            const limiter = new PromiseRateLimiter(1);

            await expect(
                limiter.schedule(() => { throw new Error("sync"); }),
            ).rejects.toThrow("sync");

            // numActive is now permanently 1 — next task is deadlocked
            const fn = vi.fn().mockResolvedValue("recovered");
            const p = limiter.schedule(fn);

            await flushPromises(50);
            expect(fn).not.toHaveBeenCalled();

            const result = await Promise.race([
                p.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });
    });

    // -----------------------------------------------------------------------
    describe("finally-based tick() in schedule()", () => {
        test("tick() is called via finally even for the first schedule call", async () => {
            // This test verifies the task actually runs (meaning tick() was called)
            const limiter = new PromiseRateLimiter(1);
            const fn = vi.fn().mockResolvedValue("executed");
            const result = await limiter.schedule(fn);
            expect(fn).toHaveBeenCalledOnce();
            expect(result).toBe("executed");
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

            const p1 = limiter.schedule(async () => {
                log.push({ type: "resolve", value: 1 });
                return 1;
            });

            const p2 = limiter.schedule(async () => {
                log.push({ type: "reject", value: 2 });
                throw new Error("err-2");
            });

            const p3 = limiter.schedule(async () => {
                log.push({ type: "resolve", value: 3 });
                return 3;
            });

            const p4 = limiter.schedule(async () => {
                log.push({ type: "reject", value: 4 });
                throw new Error("err-4");
            });

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
        test("inner task scheduled from outer task runs after outer completes (no await)", async () => {
            const limiter = new PromiseRateLimiter(1);
            const log: string[] = [];

            // Schedule an outer task that schedules an inner task but does NOT await it
            const outerP = limiter.schedule(async () => {
                log.push("outer-start");

                // This inner task is queued. It can't start until outer finishes
                // (since concurrency=1 and outer is still running).
                limiter.schedule(async () => {
                    log.push("inner");
                });

                log.push("outer-end");
            });

            await outerP;
            await flushPromises();

            // Inner task ran after outer completed and freed the slot
            expect(log).toEqual(["outer-start", "outer-end", "inner"]);
        });

        test("BUG: awaiting an inner task from an outer task causes deadlock with concurrency=1", async () => {
            // If the outer task awaits the inner task, it deadlocks because:
            // - Outer holds the only slot (numActive=1)
            // - Inner can't start until numActive < concurrency (needs 0)
            // - Outer can't finish until inner resolves
            const limiter = new PromiseRateLimiter(1);

            const outerP = limiter.schedule(async () => {
                // This will deadlock — outer waits for inner, inner waits for a free slot
                return await limiter.schedule(async () => "inner-result");
            });

            await flushPromises(50);

            const result = await Promise.race([
                outerP.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });
    });

    // -----------------------------------------------------------------------
    describe("re-usability after drain", () => {
        test("limiter can be reused after all tasks have completed", async () => {
            const limiter = new PromiseRateLimiter(1);

            // First batch
            const batch1 = await Promise.all([
                limiter.schedule(async () => "a"),
                limiter.schedule(async () => "b"),
            ]);
            expect(batch1).toEqual(["a", "b"]);

            // Second batch — limiter should work just the same
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

            const result = await limiter.schedule(async () => "fine");
            expect(result).toBe("fine");
        });
    });
});
