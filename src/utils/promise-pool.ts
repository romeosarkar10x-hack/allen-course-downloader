/**
 * Schedules a task to run when a slot is available.
 * Returns a promise that resolves/rejects with the task's result.
 *
 * @param task A function returning a promise (deferred execution).
 */

type TaskType = {
    id: number;
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    metadata?: object;
};

type EventListenerFunctionType = (
    eventType: "scheduled" | "active" | "resolved" | "rejected",
    id: number,
    metadata?: object,
) => void;

export class PromisePool {
    static GlobalID = 0;

    private numActive = 0;
    private tasks = new Set<TaskType>();
    private eventListeners: Set<EventListenerFunctionType>;

    constructor(private concurrency: number) {
        this.concurrency = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
        this.eventListeners = new Set();
    }

    private fireEventFor(id: number, metadata?: object) {
        return (eventType: Parameters<EventListenerFunctionType>[0]) => {
            this.eventListeners.forEach(fn => {
                try {
                    fn(eventType, id, metadata);
                } catch {
                    // Do nothing
                }
            });
        };
    }

    private tick() {
        if (this.numActive === this.concurrency) {
            return;
        }

        const task = this.tasks.values().next().value;

        if (task === undefined) {
            return;
        }

        const { id, fn, resolve, reject, metadata } = task;
        const fireEvent = this.fireEventFor(id, metadata);

        this.tasks.delete(task);

        this.numActive++;
        fireEvent("active");

        Promise.resolve()
            .then(fn)
            .then(value => {
                resolve(value);
                fireEvent("resolved");
            })
            .catch(reason => {
                reject(reason);
                fireEvent("rejected");
            })
            .finally(() => {
                this.numActive--;
                this.tick();
            });
    }

    schedule<T>(task: () => Promise<T>, metadata?: object): { id: number; promise: Promise<T> } {
        const id = PromisePool.GlobalID++;

        try {
            return {
                id,
                promise: new Promise<T>((resolve, reject) => {
                    this.tasks.add({ id, fn: task, resolve, reject, ...(metadata && { metadata }) });
                }),
            };
        } finally {
            this.fireEventFor(id, metadata)("scheduled");
            this.tick();
        }
    }

    addEventListener(eventListenerFn: EventListenerFunctionType) {
        this.eventListeners.add(eventListenerFn);
    }

    removeEventListener(eventListenerFn: EventListenerFunctionType) {
        this.eventListeners.delete(eventListenerFn);
    }
}
