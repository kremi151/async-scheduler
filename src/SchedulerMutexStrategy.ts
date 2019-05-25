export type SchedulerMutexStrategy = (mutexA: number, mutexB: number) => boolean;

export function mutexBitwiseAnd(mutexA: number, mutexB: number): boolean {
    return (mutexA & mutexB) !== 0;
}

export function mutexEquality(mutexA: number, mutexB: number): boolean {
    return mutexA === mutexB;
}