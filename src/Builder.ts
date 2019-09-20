import Scheduler from "./Scheduler";
import {SchedulableTask, TaskCollisionStrategy} from "./SchedulableTask";

type StringMap = {[key:string]:string};

export default class Builder<T, M> {

    private readonly _task: () => Promise<T>;
    private readonly _scheduler: Scheduler;

    private _mutex: number | undefined;
    private _descriptor: number | undefined;
    private _meta: any = undefined;

    private _onPreExecute: (() => void) | undefined;
    private _onTaskCollision: ((other: SchedulableTask<any, any>) => TaskCollisionStrategy) | undefined;

    constructor(task: () => Promise<T>, scheduler: Scheduler) {
        this._task = task;
        this._scheduler = scheduler;
    }

    public withDescriptor(descriptor: number): Builder<T, M> {
        this._descriptor = descriptor;
        return this;
    }

    public withMutex(mutex: number): Builder<T, M> {
        this._mutex = mutex;
        return this;
    }

    public withMeta<Meta=StringMap>(meta: Meta): Builder<T, Meta> {
        this._meta = meta;
        return this as Builder<T, Meta>;
    }

    public runBeforeExecuting(what: () => void): Builder<T, M> {
        this._onPreExecute = what;
        return this;
    }

    public handleCollisions(handler: (other: SchedulableTask<any, any>) => TaskCollisionStrategy): Builder<T, M> {
        this._onTaskCollision = handler;
        return this;
    }

    public execute(priority: number): Promise<T> {
        return this._scheduler.enqueue({
            priority: priority,
            mutex: this._mutex,
            descriptor: this._descriptor,
            meta: this._meta,
            execute: this._task,
            onPreExecute: this._onPreExecute,
            onTaskCollision: this._onTaskCollision,
        });
    }

}