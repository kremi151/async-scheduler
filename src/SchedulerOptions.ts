import {SchedulerMutexStrategy} from "./SchedulerMutexStrategy";

export interface SchedulerOptions {

    /**
     * Whether or not to check mutexes only for tasks having the same priority
     */
    samePriorityMutex?: boolean;

    /**
     * The strategy to use to detect mutex collisions
     */
    mutexStrategy?: SchedulerMutexStrategy;

}