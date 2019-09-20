export enum TaskCollisionStrategy {
    DEFAULT = 0,
    KEEP_THIS = 1,
    KEEP_OTHER = 2,
    KEEP_BOTH = 3,
    RESOLVE_THIS = 4,
    RESOLVE_OTHER = 5,
}

export interface SchedulableTask<T, Meta={[key:string]:any}> {

    readonly priority: number;
    readonly mutex?: number;

    readonly descriptor?: number;
    readonly meta?: Meta;

    execute(): Promise<T>;
    onPreExecute?(): void;
    onTaskCollision?(other: SchedulableTask<any, any>): TaskCollisionStrategy;

}