import {SchedulableTask, TaskCollisionStrategy} from "./SchedulableTask";
import SchedulerError from "./SchedulerError";
import {mutexEquality, SchedulerMutexStrategy} from "./SchedulerMutexStrategy";
import {SchedulerOptions} from "./SchedulerOptions";
import Builder from "./Builder";

enum ExecutionState {
    PENDING = 0,
    EXECUTING = 1,
    TERMINATED = 2
}

interface Resolvable<T> {
    resolve(result: T): void;
    reject(error?: any): void;
}

interface ScheduledTask<T> {
    readonly task: SchedulableTask<T>;
    state: ExecutionState;
    listeners: Resolvable<T>[];
}

interface MutexCheckResult<T> {
    task?: ScheduledTask<T>;
    canceled: boolean;
}

type LoggerFunc = (...data: any[]) => void;

function rejectTask(task: ScheduledTask<any>, error: any) {
    for (let listener of task.listeners) {
        listener.reject(error);
    }
}

export default class Scheduler {

    private readonly _maxConcurrentTasks: number;
    private readonly _samePriorityMutex: boolean;
    private readonly _mutexStrategy: SchedulerMutexStrategy;
    private _queue: ScheduledTask<any>[] = [];
    private _isExecuting: boolean = false;
    private _idleListeners: Resolvable<void>[] = [];
    private readonly _errorLog: LoggerFunc;

    constructor(maxConcurrentTasks: number, options: SchedulerOptions = {}) {
        this._maxConcurrentTasks = maxConcurrentTasks;
        this._samePriorityMutex = !!options.samePriorityMutex;
        this._mutexStrategy = options.mutexStrategy || mutexEquality;

        if (options.disableLogging) {
            this._errorLog = () => {};
        } else {
            this._errorLog = console.error;
        }
    }

    enqueue<T, M>(task: SchedulableTask<T, M> | (() => Promise<T>)): Promise<T> {
        return new Promise((resolve, reject) => {
            if (typeof task === 'function') {
                task = {
                    priority: 0,
                    execute: task,
                };
            }
            const mutexResult = this._checkMutexes(task, resolve, reject);
            if (mutexResult.task) {
                this._addTask(mutexResult.task);
            } else if (mutexResult.canceled) {
                reject(this.createCanceledError());
            }
        });
    }

    prepare<T>(task: () => Promise<T>): Builder<T, any> {
        return new Builder(task, this);
    }

    private _addTask<T>(task: ScheduledTask<T>) {
        this._queue.push(task);
        this._applyPriorities();
        if (!this._isExecuting) {
            this._isExecuting = true;
            // Queue will be executed on next tick
            setTimeout(this._executeNextTasks.bind(this));
        }
    }

    get executingTasks(): number {
        return this._queue.reduce((count, task) => (task.state === ExecutionState.EXECUTING) ? count + 1 : count, 0);
    }

    protected createCanceledError() {
        return new SchedulerError(50, "Task has been canceled in favor of another task");
    }

    private _findFirstPendingTask(): ScheduledTask<any> | undefined {
        return this._queue.find((task) => task.state === ExecutionState.PENDING);
    }

    private _isIdle(): boolean {
        return this._queue.length === 0 || !this._queue.find((task) => task.state !== ExecutionState.TERMINATED);
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
            const task = this._findFirstPendingTask();
            if (!task) {
                if (this._isIdle()) {
                    this._switchToIdle();
                }
                return;
            }
            task.state = ExecutionState.EXECUTING;
            this._executeTask(task)
                .then((result) => {
                    for (const { resolve } of task.listeners) {
                        try {
                            resolve(result);
                        } catch (e) {
                            this._errorLog('An error occurred while resolving listener', e);
                        }
                    }
                })
                .catch((error) => {
                    for (const { reject } of task.listeners) {
                        try {
                            reject(error);
                        } catch (e) {
                            this._errorLog('An error occurred while rejecting listener', e);
                        }
                    }
                });
        }
    }

    private _switchToIdle() {
        this._isExecuting = false;
        const idleListeners = this._idleListeners;
        this._idleListeners = [];
        for (const { resolve } of idleListeners) {
            try {
                resolve();
            } catch (e) {}
        }
    }

    waitForIdle(): Promise<void> {
        if (!this._isExecuting) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this._idleListeners.push({ resolve, reject });
        });
    }

    private _applyPriorities() {
        this._queue.sort((a, b) => b.task.priority - a.task.priority);
    }

    private _checkMutexes<T, M>(newTask: SchedulableTask<T, M>, resolve: (result: any) => void, reject: (error: any) => void): MutexCheckResult<T> {
        for (let i = 0 ; i < this._queue.length ; i++) {
            let taskA = this._queue[i];
            if (taskA.state === ExecutionState.TERMINATED) {
                // Terminated tasks will be ignored
                continue;
            }
            if (this._samePriorityMutex && taskA.task.priority != newTask.priority) {
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
                    rejectTask(taskA, this.createCanceledError());
                    continue;
                } else if (strategyA === TaskCollisionStrategy.KEEP_THIS) {
                    return { canceled: true };
                } else if (strategyA === TaskCollisionStrategy.RESOLVE_OTHER) {
                    this._removeTaskAt(i--);
                    return {
                        canceled: false,
                        task: {
                            task: newTask,
                            state: ExecutionState.PENDING,
                            listeners: [
                                {
                                    resolve: resolve,
                                    reject: reject
                                },
                                ...taskA.listeners
                            ]
                        }
                    };
                } else if (strategyA === TaskCollisionStrategy.RESOLVE_THIS) {
                    taskA.listeners = [
                        ...taskA.listeners,
                        {
                            resolve: resolve,
                            reject: reject
                        }
                    ];
                    return { canceled: false };
                }
            }
            if (newTask.onTaskCollision) {
                strategyB = newTask.onTaskCollision(taskA.task);
                if (strategyB === TaskCollisionStrategy.KEEP_OTHER) {
                    return { canceled: true };
                } else if (strategyB === TaskCollisionStrategy.KEEP_THIS) {
                    this._removeTaskAt(i--);
                    rejectTask(taskA, this.createCanceledError());
                    continue;
                } else if (strategyB === TaskCollisionStrategy.RESOLVE_OTHER) {
                    taskA.listeners = [
                        ...taskA.listeners,
                        {
                            resolve: resolve,
                            reject: reject
                        }
                    ];
                    return { canceled: false };
                } else if (strategyB === TaskCollisionStrategy.RESOLVE_THIS) {
                    this._removeTaskAt(i--);
                    return {
                        canceled: false,
                        task: {
                            task: newTask,
                            state: ExecutionState.PENDING,
                            listeners: [
                                {
                                    resolve: resolve,
                                    reject: reject
                                },
                                ...taskA.listeners
                            ]
                        }
                    };
                }
            }
            if (strategyA === TaskCollisionStrategy.KEEP_BOTH && strategyB === TaskCollisionStrategy.KEEP_BOTH) {
                // Both tasks chose to ignore the collision, so both tasks will be kept
                continue;
            }
            // Apply default action by keeping the already existing task and rejecting the new one
            return { canceled: true };
        }
        return {
            canceled: false,
            task: {
                task: newTask,
                state: ExecutionState.PENDING,
                listeners: [
                    {
                        resolve: resolve,
                        reject: reject
                    }
                ]
            }
        };
    }

}
