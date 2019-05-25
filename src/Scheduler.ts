import {SchedulableTask} from "./SchedulableTask";

enum ExecutionState {
    PENDING = 0,
    EXECUTING = 1,
    TERMINATED = 2
}

interface ScheduledTask<T> {
    resolve(result: T): void;
    reject(error?: any): void;

    readonly task: SchedulableTask<T>;
    state: ExecutionState;
}

export default class Scheduler {

    private readonly _maxConcurrentTasks: number;
    private _queue: ScheduledTask<any>[] = [];
    private _isExecuting: boolean = false;

    constructor(maxConcurrentTasks: number) {
        this._maxConcurrentTasks = maxConcurrentTasks;
    }

    enqueue<T>(task: SchedulableTask<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this._queue.push({
                resolve: resolve,
                reject: reject,
                task: task,
                state: ExecutionState.PENDING
            });
            this._applyPriorities();
            if (!this._isExecuting) {
                this._isExecuting = true;
                // Queue will be executed on next tick
                setTimeout(this._executeNextTasks.bind(this));
            }
        });
    }

    private _applyPriorities() {
        this._queue.sort((a, b) => b.task.priority - a.task.priority);
    }

    get executingTasks(): number {
        return this._queue.reduce((count, task) => (task.state === ExecutionState.EXECUTING) ? count + 1 : count, 0);
    }

    private _findFirstPendingTask(): ScheduledTask<any> | undefined {
        return this._queue.find((task) => task.state === ExecutionState.PENDING);
    }

    private async _executeTask<T>(task: ScheduledTask<T>): Promise<T> {
        try {
            if (task.task.onPreExecute) {
                task.task.onPreExecute();
            }
            return await task.task.execute();
        } catch (error) {
            throw error;
        } finally {
            task.state = ExecutionState.TERMINATED;
            let index = this._queue.indexOf(task);
            this._queue.splice(index, 1);
            this._executeNextTasks();
        }
    }

    private _executeNextTasks() {
        let executing = this.executingTasks;
        if (executing >= this._maxConcurrentTasks) {
            return;
        }
        let launchable = this._maxConcurrentTasks - executing;
        for (let i = 0 ; i < launchable ; i++) {
            let task = this._findFirstPendingTask();
            if (!task) {
                if (executing === 0) {
                    this._isExecuting = false;
                }
                return;
            }
            task.state = ExecutionState.EXECUTING;
            this._executeTask(task).then(task.resolve).catch(task.reject);
        }
    }

}