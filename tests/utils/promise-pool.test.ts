import { describe, test, expect, vi, beforeEach } from "vitest";
import { PromisePool } from "@/utils/promise-pool";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush the microtask queue `rounds` times. Generous default because the pool
 *  runs tasks through `Promise.resolve().then(fn)`, adding extra microtask hops
 *  between scheduling, activation, resolution and the next tick. */
async function flushPromises(rounds = 50) {
    for (let i = 0; i < rounds; i++) {
        await Promise.resolve();
    }
}

function deferred<T = void>() {
    let resolve!: (value?: T) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res as (value?: T) => void;
        reject = rej;
    });
    return { promise, resolve, reject };
}

type Event = { type: string; id: number; meta: object | undefined };

/** Attach a recording listener and return the backing array. */
function record(pool: PromisePool): Event[] {
    const events: Event[] = [];
    pool.addEventListener((type, id, meta) => events.push({ type, id, meta }));
    return events;
}

/** Schedule `n` gated tasks. Each records its index in `started` when its body
 *  begins, then blocks until its gate is resolved. */
function gatedTasks(pool: PromisePool, n: number) {
    const started: number[] = [];
    const gates: ReturnType<typeof deferred<void>>[] = [];
    const promises: Promise<number>[] = [];
    for (let i = 0; i < n; i++) {
        const gate = deferred();
        gates.push(gate);
        promises.push(
            pool.schedule(async () => {
                started.push(i);
                await gate.promise;
                return i;
            }).promise,
        );
    }
    return { started, gates, promises };
}

beforeEach(() => {
    vi.restoreAllMocks();
    // Static counter is shared across every pool & test — reset so id assertions
    // are deterministic within this file.
    PromisePool.GlobalID = 0;
});

// ===========================================================================
describe("PromisePool", () => {
    // =======================================================================
    // schedule() return shape — { id, promise }
    // =======================================================================
    describe("schedule() — return shape", () => {
        test("returns an object with a numeric id and a Promise", () => {
            const pool = new PromisePool(1);
            const handle = pool.schedule(async () => "x");
            expect(handle).toHaveProperty("id");
            expect(handle).toHaveProperty("promise");
            expect(typeof handle.id).toBe("number");
            expect(handle.promise).toBeInstanceOf(Promise);
            return handle.promise; // avoid unhandled
        });

        test("schedule returns synchronously (does not block on the task)", () => {
            const pool = new PromisePool(1);
            let bodyRan = false;
            const handle = pool.schedule(async () => {
                bodyRan = true;
            });
            // The task body runs on a later microtask, never synchronously.
            expect(bodyRan).toBe(false);
            return handle.promise;
        });
    });

    // =======================================================================
    // Basic task execution / value propagation
    // =======================================================================
    describe("schedule() — basic value propagation", () => {
        test("resolves with a number", async () => {
            const pool = new PromisePool(1);
            expect(await pool.schedule(() => Promise.resolve(42)).promise).toBe(42);
        });

        test("resolves with a string", async () => {
            const pool = new PromisePool(1);
            expect(await pool.schedule(() => Promise.resolve("hello")).promise).toBe("hello");
        });

        test("resolves with an object (by reference)", async () => {
            const pool = new PromisePool(1);
            const obj = { a: 1, b: "two" };
            expect(await pool.schedule(() => Promise.resolve(obj)).promise).toBe(obj);
        });

        test("resolves with undefined when the task returns void", async () => {
            const pool = new PromisePool(1);
            expect(await pool.schedule(async () => {}).promise).toBeUndefined();
        });

        test("resolves with null", async () => {
            const pool = new PromisePool(1);
            expect(await pool.schedule(async () => null).promise).toBeNull();
        });

        test("resolves with falsy values (0, '', false)", async () => {
            const pool = new PromisePool(3);
            expect(await pool.schedule(async () => 0).promise).toBe(0);
            expect(await pool.schedule(async () => "").promise).toBe("");
            expect(await pool.schedule(async () => false).promise).toBe(false);
        });

        test("rejects with the task's Error rejection reason", async () => {
            const pool = new PromisePool(1);
            await expect(pool.schedule(() => Promise.reject(new Error("task failed"))).promise).rejects.toThrow(
                "task failed",
            );
        });

        test("rejects with a non-Error rejection reason", async () => {
            const pool = new PromisePool(1);
            await expect(pool.schedule(() => Promise.reject("string reason")).promise).rejects.toBe("string reason");
        });

        test("executes the task function exactly once", async () => {
            const pool = new PromisePool(1);
            const fn = vi.fn().mockResolvedValue("ok");
            await pool.schedule(fn).promise;
            expect(fn).toHaveBeenCalledOnce();
        });

        test("a synchronously-returning (non-async) fn still resolves with its value", async () => {
            const pool = new PromisePool(1);
            // Runtime accepts a sync fn because the pool wraps it in Promise.resolve().then(fn).
            expect(await pool.schedule((() => 7) as any).promise).toBe(7);
        });
    });

    // =======================================================================
    // id generation
    // =======================================================================
    describe("id generation (static GlobalID)", () => {
        test("ids are assigned in increasing order within a pool", () => {
            const pool = new PromisePool(1);
            const a = pool.schedule(async () => "a");
            const b = pool.schedule(async () => "b");
            const c = pool.schedule(async () => "c");
            expect(b.id).toBe(a.id + 1);
            expect(c.id).toBe(b.id + 1);
            return Promise.all([a.promise, b.promise, c.promise]);
        });

        test("ids are unique across DIFFERENT pools (shared static counter)", () => {
            const p1 = new PromisePool(1);
            const p2 = new PromisePool(1);
            const a = p1.schedule(async () => "a");
            const b = p2.schedule(async () => "b");
            const c = p1.schedule(async () => "c");
            const ids = [a.id, b.id, c.id];
            expect(new Set(ids).size).toBe(3);
            return Promise.all([a.promise, b.promise, c.promise]);
        });

        test("GlobalID increments by exactly one per schedule call", () => {
            const pool = new PromisePool(1);
            const before = PromisePool.GlobalID;
            const h = pool.schedule(async () => "x");
            expect(PromisePool.GlobalID).toBe(before + 1);
            expect(h.id).toBe(before);
            return h.promise;
        });
    });

    // =======================================================================
    // Sequential execution (concurrency = 1)
    // =======================================================================
    describe("sequential execution (concurrency=1)", () => {
        test("runs tasks strictly one at a time", async () => {
            const pool = new PromisePool(1);
            const order: string[] = [];
            const gate1 = deferred();
            const gate2 = deferred();

            const p1 = pool.schedule(async () => {
                order.push("start-1");
                await gate1.promise;
                order.push("end-1");
                return "a";
            }).promise;
            const p2 = pool.schedule(async () => {
                order.push("start-2");
                await gate2.promise;
                order.push("end-2");
                return "b";
            }).promise;

            await flushPromises();
            expect(order).toEqual(["start-1"]);

            gate1.resolve();
            await flushPromises();
            expect(order).toEqual(["start-1", "end-1", "start-2"]);

            gate2.resolve();
            expect(await Promise.all([p1, p2])).toEqual(["a", "b"]);
            expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
        });

        test("tasks run in FIFO order", async () => {
            const pool = new PromisePool(1);
            const executionOrder: number[] = [];
            const promises: Promise<number>[] = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    pool.schedule(async () => {
                        executionOrder.push(i);
                        return i;
                    }).promise,
                );
            }
            const results = await Promise.all(promises);
            expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
            expect(results).toEqual([0, 1, 2, 3, 4]);
        });

        test("only one task is active at a time even when many are queued", async () => {
            const pool = new PromisePool(1);
            const { started, gates, promises } = gatedTasks(pool, 5);

            await flushPromises();
            expect(started).toEqual([0]);

            gates[0]!.resolve();
            await flushPromises();
            expect(started).toEqual([0, 1]);

            gates[1]!.resolve();
            gates[2]!.resolve();
            gates[3]!.resolve();
            gates[4]!.resolve();
            expect(await Promise.all(promises)).toEqual([0, 1, 2, 3, 4]);
            expect(started).toEqual([0, 1, 2, 3, 4]);
        });
    });

    // =======================================================================
    // Parallel execution (concurrency > 1)
    // =======================================================================
    describe("parallel execution (concurrency>1)", () => {
        test("concurrency=3 starts up to 3 tasks in parallel, queues the rest", async () => {
            const pool = new PromisePool(3);
            const { started, gates, promises } = gatedTasks(pool, 4);

            await flushPromises();
            expect(started).toEqual([0, 1, 2]); // 4th queued

            gates[0]!.resolve();
            await flushPromises();
            expect(started).toEqual([0, 1, 2, 3]); // freeing one slot starts the 4th

            gates[1]!.resolve();
            gates[2]!.resolve();
            gates[3]!.resolve();
            expect(await Promise.all(promises)).toEqual([0, 1, 2, 3]);
        });

        test("concurrency=2 allows exactly 2 concurrent tasks", async () => {
            const pool = new PromisePool(2);
            const { started, gates, promises } = gatedTasks(pool, 3);

            await flushPromises();
            expect(started).toEqual([0, 1]);

            gates[0]!.resolve();
            await flushPromises();
            expect(started).toEqual([0, 1, 2]);

            gates[1]!.resolve();
            gates[2]!.resolve();
            await Promise.all(promises);
        });

        test("never exceeds the concurrency limit under a large burst", async () => {
            const concurrency = 4;
            const pool = new PromisePool(concurrency);
            let active = 0;
            let maxActive = 0;
            const promises: Promise<void>[] = [];
            for (let i = 0; i < 40; i++) {
                promises.push(
                    pool.schedule(async () => {
                        active++;
                        maxActive = Math.max(maxActive, active);
                        await flushPromises(3);
                        active--;
                    }).promise,
                );
            }
            await Promise.all(promises);
            expect(maxActive).toBeLessThanOrEqual(concurrency);
            expect(maxActive).toBe(concurrency); // saturates the pool
        });
    });

    // =======================================================================
    // Constructor — concurrency normalization
    // =======================================================================
    describe("constructor — concurrency normalization", () => {
        async function startedCountFor(concurrency: number, taskCount = 4) {
            const pool = new PromisePool(concurrency);
            const { started, gates, promises } = gatedTasks(pool, taskCount);
            await flushPromises();
            const count = started.length;
            gates.forEach(g => g.resolve());
            await Promise.all(promises);
            return count;
        }

        test("concurrency=1 → sequential", async () => {
            expect(await startedCountFor(1)).toBe(1);
        });

        test("concurrency=0 → clamped up to 1", async () => {
            expect(await startedCountFor(0)).toBe(1);
        });

        test("negative concurrency → clamped up to 1", async () => {
            expect(await startedCountFor(-5)).toBe(1);
        });

        test("fractional concurrency is floored (2.9 → 2)", async () => {
            expect(await startedCountFor(2.9)).toBe(2);
        });

        test("fractional below 1 (0.9) → clamped up to 1", async () => {
            expect(await startedCountFor(0.9)).toBe(1);
        });

        test("NaN concurrency → falls back to 1", async () => {
            expect(await startedCountFor(NaN)).toBe(1);
        });

        test("large finite concurrency runs everything in parallel", async () => {
            expect(await startedCountFor(100, 4)).toBe(4);
        });

        // --- POTENTIAL ISSUE (documented): Infinity collapses to the *most*
        // restrictive setting instead of "unlimited". See findings report.
        test("ISSUE: Infinity concurrency collapses to 1 (not unlimited)", async () => {
            expect(await startedCountFor(Infinity)).toBe(1);
        });

        test("ISSUE: -Infinity concurrency collapses to 1", async () => {
            expect(await startedCountFor(-Infinity)).toBe(1);
        });
    });

    // =======================================================================
    // tick() draining
    // =======================================================================
    describe("tick() — draining", () => {
        test("automatically picks up the next task after one completes", async () => {
            const pool = new PromisePool(1);
            const results: number[] = [];
            const p1 = pool.schedule(async () => {
                results.push(1);
                return 1;
            }).promise;
            const p2 = pool.schedule(async () => {
                results.push(2);
                return 2;
            }).promise;
            await Promise.all([p1, p2]);
            expect(results).toEqual([1, 2]);
        });

        test("does nothing harmful when the queue drains to empty", async () => {
            const pool = new PromisePool(1);
            await pool.schedule(async () => "done").promise;
            // scheduling again after a full drain still works
            expect(await pool.schedule(async () => "again").promise).toBe("again");
        });

        test("idle pool with no tasks does not throw", () => {
            // Just constructing & never scheduling must be safe.
            expect(() => new PromisePool(3)).not.toThrow();
        });
    });

    // =======================================================================
    // Error isolation
    // =======================================================================
    describe("error isolation", () => {
        test("a rejected task does not prevent subsequent tasks from running", async () => {
            const pool = new PromisePool(1);
            const p1 = pool.schedule(() => Promise.reject(new Error("fail-1"))).promise;
            const p2 = pool.schedule(() => Promise.resolve("success")).promise;
            await expect(p1).rejects.toThrow("fail-1");
            expect(await p2).toBe("success");
        });

        test("a rejection between two resolutions is isolated", async () => {
            const pool = new PromisePool(1);
            const p1 = pool.schedule(() => Promise.resolve("first-ok")).promise;
            const p2 = pool.schedule(() => Promise.reject(new Error("second-fail"))).promise;
            const p3 = pool.schedule(() => Promise.resolve("third-ok")).promise;
            expect(await p1).toBe("first-ok");
            await expect(p2).rejects.toThrow("second-fail");
            expect(await p3).toBe("third-ok");
        });

        test("multiple sequential failures do not break the pool", async () => {
            const pool = new PromisePool(1);
            const p1 = pool.schedule(() => Promise.reject(new Error("err-1"))).promise;
            const p2 = pool.schedule(() => Promise.reject(new Error("err-2"))).promise;
            const p3 = pool.schedule(() => Promise.resolve("recovered")).promise;
            await expect(p1).rejects.toThrow("err-1");
            await expect(p2).rejects.toThrow("err-2");
            expect(await p3).toBe("recovered");
        });

        test("rejecting with undefined/null reasons is handled", async () => {
            const pool = new PromisePool(1);
            await expect(pool.schedule(() => Promise.reject(undefined)).promise).rejects.toBeUndefined();
            await expect(pool.schedule(() => Promise.reject(null)).promise).rejects.toBeNull();
        });
    });

    // =======================================================================
    // Synchronous throw inside the task fn
    // (now caught by the promise chain — no try/catch in tick anymore)
    // =======================================================================
    describe("synchronous throw inside task fn", () => {
        test("rejects the scheduled promise with the thrown error", async () => {
            const pool = new PromisePool(1);
            await expect(
                pool.schedule(() => {
                    throw new Error("sync-boom");
                }).promise,
            ).rejects.toThrow("sync-boom");
        });

        test("a slot is freed — subsequent tasks still run", async () => {
            const pool = new PromisePool(1);
            await expect(
                pool.schedule(() => {
                    throw new Error("sync");
                }).promise,
            ).rejects.toThrow("sync");
            expect(await pool.schedule(async () => "recovered").promise).toBe("recovered");
        });

        test("queued tasks are drained after a sync throw", async () => {
            const pool = new PromisePool(1);
            const log: string[] = [];
            const p1 = pool.schedule(() => {
                throw new Error("sync");
            }).promise;
            const p2 = pool.schedule(async () => {
                log.push("task-2");
                return "ok";
            }).promise;
            await expect(p1).rejects.toThrow("sync");
            expect(await p2).toBe("ok");
            expect(log).toEqual(["task-2"]);
        });

        test("consecutive sync throws do not break the pool", async () => {
            const pool = new PromisePool(1);
            const p1 = pool.schedule(() => {
                throw new Error("sync-1");
            }).promise;
            const p2 = pool.schedule(() => {
                throw new Error("sync-2");
            }).promise;
            const p3 = pool.schedule(async () => "success").promise;
            await expect(p1).rejects.toThrow("sync-1");
            await expect(p2).rejects.toThrow("sync-2");
            expect(await p3).toBe("success");
        });
    });

    // =======================================================================
    // Stack-overflow safety (regression for issue #3)
    // =======================================================================
    describe("stack-overflow safety (issue #3 regression)", () => {
        test("a huge batch of sync-throwing tasks all reject without overflow", async () => {
            const N = 20000;
            const pool = new PromisePool(1);
            const promises: Promise<string>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(
                    pool
                        .schedule(() => {
                            throw new Error("boom");
                        })
                        .promise.then(
                            () => "resolved",
                            () => "caught",
                        ),
                );
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(N);
            expect(results.every(r => r === "caught")).toBe(true);
        });

        test("a huge batch of immediately-resolving tasks completes without overflow", async () => {
            const N = 20000;
            const pool = new PromisePool(1);
            const promises: Promise<number>[] = [];
            for (let i = 0; i < N; i++) {
                promises.push(pool.schedule(async () => i).promise);
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(N);
            expect(results[0]).toBe(0);
            expect(results[N - 1]).toBe(N - 1);
        });
    });

    // =======================================================================
    // Events — sequence & payload
    // =======================================================================
    describe("events — sequence", () => {
        test("'scheduled' and 'active' fire SYNCHRONOUSLY during schedule() when a slot is free", () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const { id, promise } = pool.schedule(async () => "x");
            // Both fire before schedule() returns.
            expect(events.map(e => e.type)).toEqual(["scheduled", "active"]);
            expect(events.every(e => e.id === id)).toBe(true);
            return promise;
        });

        test("a single task emits scheduled → active → resolved in order", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const { id, promise } = pool.schedule(async () => "ok");
            await promise;
            expect(events.map(e => e.type)).toEqual(["scheduled", "active", "resolved"]);
            expect(events.every(e => e.id === id)).toBe(true);
        });

        test("a failing task emits scheduled → active → rejected (never 'resolved')", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const { promise } = pool.schedule(async () => {
                throw new Error("nope");
            });
            await expect(promise).rejects.toThrow("nope");
            expect(events.map(e => e.type)).toEqual(["scheduled", "active", "rejected"]);
        });

        test("a queued task emits 'scheduled' immediately but 'active' only when a slot frees", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const gate = deferred();
            const a = pool.schedule(async () => {
                await gate.promise;
            });
            const b = pool.schedule(async () => "b");

            // Synchronously: a is scheduled+active, b is only scheduled.
            expect(events.map(e => `${e.type}:${e.id}`)).toEqual([
                `scheduled:${a.id}`,
                `active:${a.id}`,
                `scheduled:${b.id}`,
            ]);

            gate.resolve();
            await Promise.all([a.promise, b.promise]);

            expect(events.map(e => `${e.type}:${e.id}`)).toEqual([
                `scheduled:${a.id}`,
                `active:${a.id}`,
                `scheduled:${b.id}`,
                `resolved:${a.id}`,
                `active:${b.id}`,
                `resolved:${b.id}`,
            ]);
        });

        test("every scheduled task emits exactly one terminal (resolved|rejected) event", async () => {
            const pool = new PromisePool(2);
            const events = record(pool);
            const handles = [
                pool.schedule(async () => 1),
                pool.schedule(async () => {
                    throw new Error("e");
                }),
                pool.schedule(async () => 3),
            ];
            await Promise.allSettled(handles.map(h => h.promise));

            for (const h of handles) {
                const mine = events.filter(e => e.id === h.id);
                expect(mine.filter(e => e.type === "scheduled")).toHaveLength(1);
                expect(mine.filter(e => e.type === "active")).toHaveLength(1);
                expect(mine.filter(e => e.type === "resolved" || e.type === "rejected")).toHaveLength(1);
            }
        });
    });

    // =======================================================================
    // Events — metadata
    // =======================================================================
    describe("events — metadata", () => {
        test("metadata is forwarded (same reference) to every event for that task", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const meta = { url: "https://example.com", n: 1 };
            await pool.schedule(async () => "x", meta).promise;

            const types = events.map(e => e.type);
            expect(types).toEqual(["scheduled", "active", "resolved"]);
            expect(events.every(e => e.meta === meta)).toBe(true);
        });

        test("metadata is forwarded to the 'rejected' event too", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const meta = { tag: "fail" };
            await expect(
                pool.schedule(async () => {
                    throw new Error("x");
                }, meta).promise,
            ).rejects.toThrow();
            expect(events.every(e => e.meta === meta)).toBe(true);
        });

        test("metadata is undefined in events when none is supplied", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            await pool.schedule(async () => "x").promise;
            expect(events.every(e => e.meta === undefined)).toBe(true);
        });

        test("each task carries its own metadata independently", async () => {
            const pool = new PromisePool(1);
            const events = record(pool);
            const m1 = { i: 1 };
            const m2 = { i: 2 };
            const h1 = pool.schedule(async () => 1, m1);
            const h2 = pool.schedule(async () => 2, m2);
            await Promise.all([h1.promise, h2.promise]);

            expect(events.filter(e => e.id === h1.id).every(e => e.meta === m1)).toBe(true);
            expect(events.filter(e => e.id === h2.id).every(e => e.meta === m2)).toBe(true);
        });
    });

    // =======================================================================
    // Events — listener management
    // =======================================================================
    describe("events — listener management", () => {
        test("multiple listeners all receive every event", async () => {
            const pool = new PromisePool(1);
            const a = vi.fn();
            const b = vi.fn();
            pool.addEventListener(a);
            pool.addEventListener(b);
            await pool.schedule(async () => "x").promise;
            expect(a).toHaveBeenCalledTimes(3); // scheduled, active, resolved
            expect(b).toHaveBeenCalledTimes(3);
        });

        test("adding the same listener twice registers it once (Set semantics)", async () => {
            const pool = new PromisePool(1);
            const fn = vi.fn();
            pool.addEventListener(fn);
            pool.addEventListener(fn);
            await pool.schedule(async () => "x").promise;
            expect(fn).toHaveBeenCalledTimes(3);
        });

        test("removeEventListener stops further events", async () => {
            const pool = new PromisePool(1);
            const fn = vi.fn();
            pool.addEventListener(fn);
            await pool.schedule(async () => "first").promise;
            const callsAfterFirst = fn.mock.calls.length;

            pool.removeEventListener(fn);
            await pool.schedule(async () => "second").promise;
            expect(fn.mock.calls.length).toBe(callsAfterFirst);
        });

        test("removing a never-added listener is a no-op", () => {
            const pool = new PromisePool(1);
            expect(() => pool.removeEventListener(() => {})).not.toThrow();
        });

        test("a listener may be removed mid-flight and stops receiving the terminal event", async () => {
            const pool = new PromisePool(1);
            const seen: string[] = [];
            const listener = (type: string) => {
                seen.push(type);
                if (type === "active") {
                    pool.removeEventListener(listener);
                }
            };
            await pool.schedule(async () => "x").promise;
            // listener wasn't attached yet above — attach & re-run properly:
            seen.length = 0;
            pool.addEventListener(listener);
            await pool.schedule(async () => "y").promise;
            // Removed itself during 'active', so 'resolved' is not seen.
            expect(seen).toEqual(["scheduled", "active"]);
        });

        test("listener added AFTER schedule() misses synchronous scheduled/active but catches resolved", async () => {
            const pool = new PromisePool(1);
            const { id, promise } = pool.schedule(async () => "x");
            const fn = vi.fn();
            pool.addEventListener(fn);
            await promise;
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith("resolved", id, undefined);
        });
    });

    // =======================================================================
    // Events — listener fault isolation
    // =======================================================================
    describe("events — listener fault isolation", () => {
        test("a throwing listener does not break the task", async () => {
            const pool = new PromisePool(1);
            pool.addEventListener(() => {
                throw new Error("listener boom");
            });
            await expect(pool.schedule(async () => "ok").promise).resolves.toBe("ok");
        });

        test("a throwing listener does not prevent other listeners from firing", async () => {
            const pool = new PromisePool(1);
            const good = vi.fn();
            pool.addEventListener(() => {
                throw new Error("boom");
            });
            pool.addEventListener(good);
            await pool.schedule(async () => "ok").promise;
            expect(good).toHaveBeenCalledTimes(3);
        });

        test("a throwing listener does not stop the queue from draining", async () => {
            const pool = new PromisePool(1);
            pool.addEventListener(() => {
                throw new Error("boom");
            });
            const r1 = await pool.schedule(async () => 1).promise;
            const r2 = await pool.schedule(async () => 2).promise;
            expect([r1, r2]).toEqual([1, 2]);
        });
    });

    // =======================================================================
    // Re-entrancy: scheduling from within tasks / listeners
    // =======================================================================
    describe("re-entrancy", () => {
        test("inner task scheduled from a task (not awaited) runs after the outer finishes", async () => {
            const pool = new PromisePool(1);
            const log: string[] = [];
            const outer = pool.schedule(async () => {
                log.push("outer-start");
                pool.schedule(async () => {
                    log.push("inner");
                });
                log.push("outer-end");
            });
            await outer.promise;
            await flushPromises();
            expect(log).toEqual(["outer-start", "outer-end", "inner"]);
        });

        test("awaiting an inner task from the outer DEADLOCKS at concurrency=1", async () => {
            const pool = new PromisePool(1);
            const outer = pool.schedule(async () => {
                return await pool.schedule(async () => "inner-result").promise;
            });
            const result = await Promise.race([
                outer.promise.then(() => "resolved"),
                new Promise(r => setTimeout(r, 50, "timeout")),
            ]);
            expect(result).toBe("timeout");
        });

        test("awaiting an inner task works with concurrency>=2", async () => {
            const pool = new PromisePool(2);
            const result = await pool.schedule(async () => {
                return await pool.schedule(async () => "inner-result").promise;
            }).promise;
            expect(result).toBe("inner-result");
        });

        test("scheduling from within an event listener does not break the pool", async () => {
            const pool = new PromisePool(2);
            const extra: Promise<string>[] = [];
            let scheduledOnce = false;
            const listener = (type: string) => {
                if (type === "resolved" && !scheduledOnce) {
                    scheduledOnce = true;
                    extra.push(pool.schedule(async () => "from-listener").promise);
                }
            };
            pool.addEventListener(listener);
            await pool.schedule(async () => "trigger").promise;
            expect(await Promise.all(extra)).toEqual(["from-listener"]);
        });
    });

    // =======================================================================
    // Mixed resolve / reject ordering
    // =======================================================================
    describe("mixed resolve/reject ordering", () => {
        test("alternating success and failure maintains order (concurrency=1)", async () => {
            const pool = new PromisePool(1);
            const log: Array<{ type: string; value: number }> = [];

            const p1 = pool.schedule(async () => {
                log.push({ type: "resolve", value: 1 });
                return 1;
            }).promise;
            const p2 = pool.schedule(async () => {
                log.push({ type: "reject", value: 2 });
                throw new Error("err-2");
            }).promise;
            const p3 = pool.schedule(async () => {
                log.push({ type: "resolve", value: 3 });
                return 3;
            }).promise;
            const p4 = pool.schedule(async () => {
                log.push({ type: "reject", value: 4 });
                throw new Error("err-4");
            }).promise;

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

    // =======================================================================
    // Re-usability after drain
    // =======================================================================
    describe("re-usability after drain", () => {
        test("the pool can be reused after all tasks have completed", async () => {
            const pool = new PromisePool(1);
            const batch1 = await Promise.all([
                pool.schedule(async () => "a").promise,
                pool.schedule(async () => "b").promise,
            ]);
            expect(batch1).toEqual(["a", "b"]);

            const batch2 = await Promise.all([
                pool.schedule(async () => "c").promise,
                pool.schedule(async () => "d").promise,
            ]);
            expect(batch2).toEqual(["c", "d"]);
        });

        test("the pool can be reused after errors", async () => {
            const pool = new PromisePool(1);
            await expect(pool.schedule(() => Promise.reject(new Error("oops"))).promise).rejects.toThrow("oops");
            expect(await pool.schedule(async () => "fine").promise).toBe("fine");
        });

        test("scheduling after a full drain (with a microtask gap) still works", async () => {
            const pool = new PromisePool(1);
            await pool.schedule(async () => "batch-1").promise;
            await flushPromises();
            expect(await pool.schedule(async () => "batch-2").promise).toBe("batch-2");
        });
    });

    // =======================================================================
    // Stress
    // =======================================================================
    describe("stress", () => {
        test("100 tasks, concurrency=1, complete in order", async () => {
            const pool = new PromisePool(1);
            const N = 100;
            const promises = Array.from({ length: N }, (_, i) => pool.schedule(async () => i).promise);
            const results = await Promise.all(promises);
            expect(results).toEqual(Array.from({ length: N }, (_, i) => i));
        });

        test("500 tasks, concurrency=8, all resolve correctly", async () => {
            const pool = new PromisePool(8);
            const N = 500;
            const promises = Array.from({ length: N }, (_, i) => pool.schedule(async () => i * 2).promise);
            const results = await Promise.all(promises);
            expect(results).toEqual(Array.from({ length: N }, (_, i) => i * 2));
        });

        test("mixed resolving and rejecting tasks under high concurrency settle correctly", async () => {
            const pool = new PromisePool(6);
            const N = 200;
            const settled = await Promise.allSettled(
                Array.from(
                    { length: N },
                    (_, i) =>
                        pool.schedule(async () => {
                            if (i % 2 === 0) return i;
                            throw new Error(`fail-${i}`);
                        }).promise,
                ),
            );
            expect(settled).toHaveLength(N);
            expect(settled.filter(s => s.status === "fulfilled")).toHaveLength(N / 2);
            expect(settled.filter(s => s.status === "rejected")).toHaveLength(N / 2);
        });
    });

    // =======================================================================
    // Generic type propagation (compile-time + runtime sanity)
    // =======================================================================
    describe("generic type propagation", () => {
        test("preserves return type through Promise<T>", async () => {
            const pool = new PromisePool(3);
            const num: number = await pool.schedule(() => Promise.resolve(42)).promise;
            const str: string = await pool.schedule(() => Promise.resolve("text")).promise;
            const obj: { x: number } = await pool.schedule(() => Promise.resolve({ x: 1 })).promise;
            expect(num).toBe(42);
            expect(str).toBe("text");
            expect(obj).toEqual({ x: 1 });
        });
    });
});
