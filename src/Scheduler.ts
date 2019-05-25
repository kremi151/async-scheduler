import {SchedulableTask, TaskCollisionStrategy} from "./SchedulableTask";
import SchedulerError from "./SchedulerError";
import {mutexEquality, SchedulerMutexStrategy} from "./SchedulerMutexStrategy";

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

function newCanceledError() {
    return new SchedulerError(50, "Task has been canceled in favor of another task");
}

export default class Scheduler {

    private readonly _maxConcurrentTasks: number;
    private readonly _mutexStrategy: SchedulerMutexStrategy;
    private _queue: ScheduledTask<any>[] = [];
    private _isExecuting: boolean = false;

    constructor(maxConcurrentTasks: number, mutexStrategy: SchedulerMutexStrategy = mutexEquality) {
        this._maxConcurrentTasks = maxConcurrentTasks;
        this._mutexStrategy = mutexStrategy;
    }

    enqueue<T>(task: SchedulableTask<T> | Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            if (task instanceof Promise) {
                const promise = task;
                task = {
                    priority: 0,
                    execute(): Promise<T> {
                        return promise;
                    }
                };
            }
            if (this._checkMutexes(task)) {
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
            } else {
                reject(newCanceledError());
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

    private _checkMutexes(newTask: SchedulableTask<any>): boolean {
        for (let i = 0 ; i < this._queue.length ; i++) {
            let taskA = this._queue[i];
            if (taskA.state === ExecutionState.TERMINATED) {
                // Terminated tasks will be ignored
                continue;
            }
            if (taskA.task.priority != newTask.priority) {
                // Skip check if not the same priority
                continue;
            }
            if (!taskA.task.mutex || !newTask.mutex || !this._mutexStrategy(taskA.task.mutex, newTask.mutex)) {
                // If mutexes do not collide, skip check
                continue;
            }
            let strategyA;
            let strategyB;
            if (taskA.task.onTaskCollision) {
                strategyA = taskA.task.onTaskCollision(newTask);
                if (strategyA === TaskCollisionStrategy.KEEP_OTHER && taskA.state !== ExecutionState.EXECUTING) {
                    this._removeTaskAt(i--);
                    taskA.reject(newCanceledError());
                    continue;
                } else if (strategyA === TaskCollisionStrategy.KEEP_THIS) {
                    return false;
                }
            }
            if (newTask.onTaskCollision) {
                strategyB = newTask.onTaskCollision(taskA.task);
                if (strategyB === TaskCollisionStrategy.KEEP_OTHER) {
                    return false;
                } else if (strategyB === TaskCollisionStrategy.KEEP_THIS) {
                    this._removeTaskAt(i--);
                    taskA.reject(newCanceledError());
                    continue;
                }
            }
            if (strategyA === TaskCollisionStrategy.KEEP_BOTH && strategyB === TaskCollisionStrategy.KEEP_BOTH) {
                // Both tasks chose to ignore the collision, so both tasks will be kept
                continue;
            }
            // Apply default action by keeping the already existing task and rejecting the new one
            return false;
        }
        return true;
    }

}