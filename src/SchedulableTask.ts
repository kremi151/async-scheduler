export enum TaskCollisionStrategy {
    DEFAULT = 0,
    KEEP_THIS = 1,
    KEEP_OTHER = 2,
    KEEP_BOTH = 3,
    RESOLVE_THIS = 4,
    RESOLVE_OTHER = 5,
}

export interface SchedulableTask<T> {

    readonly priority: number;
    readonly mutex?: number;

    execute(): Promise<T>;
    onPreExecute?(): void;
    onTaskCollision?(other: SchedulableTask<any>): TaskCollisionStrategy;

}