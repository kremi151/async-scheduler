import {expect} from 'chai';
import 'mocha';
import Scheduler from "./Scheduler";
import {SchedulableTask, TaskCollisionStrategy} from "./SchedulableTask";

function wait(timeout: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, timeout);
    });
}

interface SchedulableNumberTask extends SchedulableTask<number> {
    extraVarNumber: number;
}

describe('Scheduler', () => {

    it('should execute tasks in numerical order', async () => {
        let scheduler = new Scheduler(5);

        // Create array with numbers from 0 to 20
        let sortedNumbers = [];
        let shuffledNumbers = [];
        for (let i = 20 ; i >= 0 ; i--) {
            sortedNumbers.push(i);
            shuffledNumbers.push(i);
        }
        // Shuffle array
        shuffledNumbers.sort(() => Math.random() - 0.5);

        let executionOrder: number[] = [];

        let promises = shuffledNumbers.map((nbr) => scheduler.enqueue({
            priority: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => {
                    setTimeout(() => resolve(nbr), 10 * Math.random());
                })
            },
            onPreExecute(): void {
                executionOrder.push(nbr);
            }
        }));

        await Promise.all(promises);

        expect(executionOrder).to.eql(sortedNumbers);
    });

    it('should run only a limited amount of tasks in parallel', async () => {
        let scheduler = new Scheduler(2);

        let numbers = [1, 2, 3, 4, 5];
        let executionOrder: number[] = [];
        numbers.forEach((nbr) => scheduler.enqueue({
            priority: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => {
                    setTimeout(() => resolve(nbr), 10);
                })
            },
            onPreExecute(): void {
                executionOrder.push(nbr);
            }
        }));

        await wait(5);
        expect(scheduler.executingTasks).to.equal(2);
        expect(executionOrder).to.eql([5, 4]);

        await wait(10);
        expect(scheduler.executingTasks).to.equal(2);
        expect(executionOrder).to.eql([5, 4, 3, 2]);

        await wait(10);
        expect(scheduler.executingTasks).to.equal(1);
        expect(executionOrder).to.eql([5, 4, 3, 2, 1]);
    });

    it('should be ready to execute again after all tasks have been executed', async () => {
        let scheduler = new Scheduler(2);

        let promises = [1, 2, 3, 4, 5].map((nbr) => scheduler.enqueue({
            priority: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => resolve(nbr));
            }
        }));
        let result = await Promise.all(promises);
        expect(result).to.eql([1, 2, 3, 4, 5]);

        promises = [6, 7, 8, 9, 10].map((nbr) => scheduler.enqueue({
            priority: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => resolve(nbr));
            }
        }));
        result = await Promise.all(promises);
        expect(result).to.eql([6, 7, 8, 9, 10]);
    });

    it('should accept and execute new tasks while executing other ones', async () => {
        let scheduler = new Scheduler(2);

        let executionOrder: number[] = [];

        let promises = [1, 2, 3, 6, 7].map((nbr) => scheduler.enqueue({
            priority: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => {
                    setTimeout(() => resolve(nbr), 10);
                })
            },
            onPreExecute(): void {
                executionOrder.push(nbr);
            }
        }));
        await wait(5);
        promises = [
            ...promises,
            ...([4, 5].map((nbr) => scheduler.enqueue({
                priority: nbr,
                execute(): Promise<number> {
                    return new Promise<number>((resolve) => {
                        setTimeout(() => resolve(nbr), 10);
                    })
                },
                onPreExecute(): void {
                    executionOrder.push(nbr);
                }
            })))
        ];
        await Promise.all(promises);
        expect(executionOrder).to.eql([7, 6, 5, 4, 3, 2, 1]);
    });

    it('should cancel tasks based on mutex collisions', async () => {
        let scheduler = new Scheduler(2);

        let allPromises = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((nbr) => scheduler.enqueue({
            priority: 0,
            mutex: 1 << Math.floor(nbr / 2),
            extraVarNumber: nbr,
            execute(): Promise<number> {
                return new Promise<number>((resolve) => {
                    setTimeout(() => resolve(nbr));
                })
            },
            onTaskCollision(other: SchedulableTask<any>): TaskCollisionStrategy {
                if ((other as SchedulableNumberTask).extraVarNumber <= nbr) {
                    return TaskCollisionStrategy.KEEP_OTHER;
                } else {
                    return TaskCollisionStrategy.KEEP_THIS;
                }
            }
        } as SchedulableNumberTask).catch(() => -1 * nbr));

        let result = await Promise.all(allPromises);
        expect(result).to.eql([ 0, -1, 2, -3, 4, -5, 6, -7, 8, -9 ]);
    });

});