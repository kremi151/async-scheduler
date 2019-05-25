import {SchedulableTask, TaskCollisionStrategy} from "./SchedulableTask";
import SchedulerError from "./SchedulerError";

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
            this._applyMutexes();
            if (!this._isExecuting) {
                this._isExecuting = true;
                // Queue will be executed on next tick
                setTimeout(this._executeNextTasks.bind(this));
            }
        });
    }

    get executingTasks(): number {
        return this._queue.reduce((count, task) => (task.state === ExecutionState.EXECUTING) ? count + 1 : count, 0);
    }

    private _findFirstPendingTask(): ScheduledTask<any> | undefined {
        return this._queue.find((task) => task.state === ExecutionState.PENDING);
    }

    private _removeTaskAt(index: number) {
        this._queue.splice(index, 1);
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
            this._removeTaskAt(index);
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

    private _applyPriorities() {
        this._queue.sort((a, b) => b.task.priority - a.task.priority);
    }

    private _applyMutexes() {
        for (let i = 0 ; i < this._queue.length ; i++) {
            let taskA = this._queue[i];
            if (taskA.state === ExecutionState.TERMINATED) {
                // Terminated tasks will be ignored
                continue;
            }
            for (let j = i + 1 ; j < this._queue.length ; j++) {
                let taskB = this._queue[j];
                if (taskB.state === ExecutionState.TERMINATED) {
                    // Terminated tasks will be ignored
                    continue;
                }
                if (taskA.state === ExecutionState.EXECUTING && taskB.state === ExecutionState.EXECUTING) {
                    // Skip check if both tasks are already running
                    continue;
                }
                if (taskA.task.priority != taskB.task.priority) {
                    // Skip check and go to next "taskA" if both tasks have different priorities
                    break;
                }
                if (!taskA.task.mutex || !taskB.task.mutex || (taskA.task.mutex & taskB.task.mutex) === 0) {
                    // If mutexes do not collide, skip check
                    continue;
                }
                if (taskA.task.onTaskCollision) {
                    let strategy = taskA.task.onTaskCollision(taskB.task);
                    if (strategy === TaskCollisionStrategy.KEEP_OTHER && taskA.state !== ExecutionState.EXECUTING) {
                        this._removeTaskAt(i--);
                        taskA.reject(new SchedulerError(50, "Task has been canceled in favor of another task"));
                        continue;
                    } else if (strategy === TaskCollisionStrategy.KEEP_THIS) {
                        this._removeTaskAt(j--);
                        taskB.reject(new SchedulerError(50, "Task has been canceled in favor of another task"));
                        continue;
                    }
                }
                if (taskB.task.onTaskCollision) {
                    let strategy = taskB.task.onTaskCollision(taskA.task);
                    if (strategy === TaskCollisionStrategy.KEEP_OTHER && taskB.state !== ExecutionState.EXECUTING) {
                        this._removeTaskAt(j--);
                        taskB.reject(new SchedulerError(50, "Task has been canceled in favor of another task"));
                        continue;
                    } else if (strategy === TaskCollisionStrategy.KEEP_THIS) {
                        this._removeTaskAt(i--);
                        taskA.reject(new SchedulerError(50, "Task has been canceled in favor of another task"));
                        continue;
                    }
                }
                // Apply default action by keeping the first task and ditching the second one
                this._removeTaskAt(j--);
                taskB.reject(new SchedulerError(50, "Task has been canceled in favor of another task"));
            }
        }
    }

}