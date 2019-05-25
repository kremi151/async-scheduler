export interface SchedulableTask<T> {

    readonly priority: number;

    execute(): Promise<T>;
    onPreExecute?(): void;

}