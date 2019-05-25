export enum TaskCollisionStrategy {
    DEFAULT = 0,
    KEEP_THIS = 1,
    KEEP_OTHER = 2
}

export interface SchedulableTask<T> {

    readonly priority: number;
    readonly mutex?: number;

    execute(): Promise<T>;
    onPreExecute?(): void;
    onTaskCollision?(other: SchedulableTask<any>): TaskCollisionStrategy;

}