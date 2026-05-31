/**
 * Schedules a task to run when a slot is available.
 * Returns a promise that resolves/rejects with the task's result.
 *
 * @param task A function returning a promise (deferred execution).
 */

type TaskMetadata = {
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
};

export class PromiseRateLimiter {
    private numActive = 0;
    private tasks = new Set<TaskMetadata>();

    constructor(public concurrency: number) {
        this.concurrency = Math.max(1, Math.floor(concurrency));
    }

    private tick() {
        if (this.numActive === this.concurrency) {
            return;
        }

        const task = this.tasks.values().next().value;

        if (task === undefined) {
            return;
        }

        this.numActive++;
        const { fn, resolve, reject } = task;

        this.tasks.delete(task);

        try {
            fn()
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    this.numActive--;
                    this.tick();
                });
        } catch {
            this.numActive--;
        }
    }

    async schedule<T>(task: () => Promise<T>): Promise<T> {
        try {
            return new Promise<T>((resolve, reject) => {
                this.tasks.add({ fn: task, resolve, reject });
            });
        } finally {
            this.tick();
        }
    }
}
