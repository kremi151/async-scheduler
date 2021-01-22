# async-scheduler

![CI](https://github.com/kremi151/async-scheduler/workflows/CI/badge.svg)
![NPM](https://img.shields.io/npm/v/async-scheduler?color=green)

A promise based task scheduler written in TypeScript (compatible with JavaScript ES2015).

## Install

Using Yarn:
````
yarn add async-scheduler
````

Using NPM:
````
npm i async-scheduler
````

## Basic usage

To get started, simply create a new Scheduler instance and enqueue some promises.

````typescript
import {Scheduler} from "async-scheduler";

let scheduler = new Scheduler(2); // Maximal 2 concurrent task executions

scheduler.enqueue(() => asyncFunction())
    .then(result => console.log("Success! ", result))
    .catch(error => console.log("Error... ", error));
````

The invocation of ``Scheduler.enqueue`` will return a promise which will resolve the request.

## Prioritization of tasks

Tasks can be allocated a priority to determine their order of execution. Tasks with higher priorities will execute before tasks with lower priorities.

````typescript
import {Scheduler} from "async-scheduler";

let scheduler = new Scheduler(1);

scheduler.enqueue({
        priority: 10,
        execute: () => asyncFunction()
    }).then(/* ... */).catch(/* ... */);

scheduler.enqueue({
        priority: 20,
        execute: () => anotherAsyncFunction()
    }).then(/* ... */).catch(/* ... */);
````

In this example, we enqueued two tasks with priorities 10 and 20. The task with priority 20 will be executed first.

Attention: In this example, we set the amount of concurrently running tasks to one. So, we only have one task running at once. If we set this value to 2 in this example, both tasks would be running at the same time.

Another detail: Newly enqueued tasks do not affect already running ones.

## Prevent tasks from running concurrently

It is possible to disallow two specific tasks from running at the same time by cancelling one of them.
This can be done by using mutexes. A mutex is simply a number which can be allocated to a task (similar to ``priority``).
Two tasks "collide" with each other when their mutexes are equal (using the default configuration).
An optional configuration allows two tasks to "collide" when the bitwise ``&`` operation of their mutexes gives a value different than ``0``.

````typescript
import {Scheduler, TaskCollisionStrategy} from "async-scheduler";

let scheduler = new Scheduler(1);

scheduler.enqueue({
        priority: 10,
        mutex: 3,
        execute: () => asyncFunction(),
        onTaskCollision: (otherTask) => {
            /* Check what the other task does */
            return TaskCollisionStrategy.KEEP_THIS;
        }
    }).then(/* ... */).catch(/* ... */);

scheduler.enqueue({
        priority: 10,
        mutex: 3,
        execute: () => anotherAsyncFunction(),
        onTaskCollision: (otherTask) => {
            /* Check what the other task does */
            return TaskCollisionStrategy.KEEP_OTHER;
        }
    }).then(/* ... */).catch(/* ... */);

scheduler.enqueue({
        priority: 10,
        mutex: 4,
        execute: () => yetAnotherAsyncFunction()
    }).then(/* ... */).catch(/* ... */);
````

In this example, every task has the same priority. The two first tasks however have the same mutex of 3.
In case of a collision like in this case, the ``onTaskCollision`` implementation of the involved tasks will be called.
The first of them in the queue will get its ``onTaskCollision`` method invoked first.
If this method is not provided or if it returns a non-decisive strategy, the new task to be enqueued will get its ``onTaskCollision`` method invoked.
In case the first one gives a decisive strategy, the second task will not be asked.
In case when both tasks do not give a decisive strategy, the second task will be rejected.

Available collision strategies:
* TaskCollisionStrategy.DEFAULT - Apply default behavior, the same as if no implementation of ``onTaskCollision`` would have been provided
* TaskCollisionStrategy.KEEP_THIS - Keep the current task and reject the other one
* TaskCollisionStrategy.KEEP_OTHER - Reject the current task and keep the other one
* TaskCollisionStrategy.KEEP_BOTH - Keep both tasks. This will only be applied if both tasks in question return this as their collision strategy.
* TaskCollisionStrategy.RESOLVE_THIS - Remove the other task from the queue and let it resolve using this task
* TaskCollisionStrategy.RESOLVE_OTHER - Resolve the current task using the other one 

## Waiting for scheduler to become idle

Sometimes it might be useful to wait for the scheduler to become idle, especially when tasks enqueue sub tasks within the same scheduler.

This can be achieved using `Scheduler.waitForIdle()`:

````typescript
import {Scheduler, TaskCollisionStrategy} from "async-scheduler";

let scheduler = new Scheduler(10);

scheduler.enqueue(async () => {
    scheduler.enqueue(async () => {
        scheduler.enqueue(async () => {
         // Enqueue as many sub tasks as you like
        });
    });
});

// Let's wait for every (sub) task to complete
scheduler.waitForIdle()
    .then(() => console.log('The scheduler is now idle!'));
````
