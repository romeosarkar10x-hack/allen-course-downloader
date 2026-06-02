import { describe, expect, test } from "vitest";
import { Queue, QueueNode } from "@/utils/queue";

describe("queue", () => {
    describe("empty queue", () => {
        test("front() returns null on empty queue", () => {
            const queue = new Queue<number>();
            expect(queue.front()).toBeNull();
        });

        test("back() returns null on empty queue", () => {
            const queue = new Queue<number>();
            expect(queue.back()).toBeNull();
        });

        test("pop() throws on empty queue", () => {
            const queue = new Queue<number>();
            expect(() => queue.pop()).toThrow("Cannot pop from an empty queue");
        });
    });

    describe("push()", () => {
        test("pushing the first element sets both front and back to it", () => {
            const queue = new Queue<number>();
            queue.push(1);
            expect(queue.front()).toBe(1);
            expect(queue.back()).toBe(1);
        });

        test("pushing a second element updates back but not front", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            expect(queue.front()).toBe(1);
            expect(queue.back()).toBe(2);
        });

        test("pushing multiple elements keeps front at the first and back at the last", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.push(3);
            expect(queue.front()).toBe(1);
            expect(queue.back()).toBe(3);
        });

        test("back() updates with each new push", () => {
            const queue = new Queue<number>();
            queue.push(10);
            expect(queue.back()).toBe(10);
            queue.push(20);
            expect(queue.back()).toBe(20);
            queue.push(30);
            expect(queue.back()).toBe(30);
        });
    });

    describe("pop()", () => {
        test("popping the only element returns it", () => {
            const queue = new Queue<number>();
            queue.push(42);
            expect(queue.pop()).toBe(42);
        });

        test("popping the only element leaves the queue empty", () => {
            const queue = new Queue<number>();
            queue.push(42);
            queue.pop();
            expect(queue.front()).toBeNull();
            expect(queue.back()).toBeNull();
        });

        test("pop() throws on a queue that was drained to empty", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.pop();
            expect(() => queue.pop()).toThrow("Cannot pop from an empty queue");
        });

        test("pop() removes elements in FIFO order", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.push(3);
            expect(queue.pop()).toBe(1);
            expect(queue.pop()).toBe(2);
            expect(queue.pop()).toBe(3);
        });

        test("popping from a multi-element queue advances front to the next element", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.push(3);
            queue.pop();
            expect(queue.front()).toBe(2);
            expect(queue.back()).toBe(3);
        });

        test("popping the second-to-last element leaves front and back pointing to the same node", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.pop();
            expect(queue.front()).toBe(2);
            expect(queue.back()).toBe(2);
        });
    });

    describe("front() and back() after pop()", () => {
        test("front() returns null after all elements are popped", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.pop();
            expect(queue.front()).toBeNull();
        });

        test("back() returns null after all elements are popped", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.pop();
            expect(queue.back()).toBeNull();
        });

        test("front() does not change when new elements are pushed", () => {
            const queue = new Queue<number>();
            queue.push(10);
            queue.push(20);
            queue.push(30);
            expect(queue.front()).toBe(10);
        });
    });

    describe("interleaved push and pop", () => {
        test("alternating push and pop works correctly", () => {
            const queue = new Queue<number>();
            queue.push(1);
            expect(queue.pop()).toBe(1);
            queue.push(2);
            expect(queue.pop()).toBe(2);
        });

        test("push several, pop one, push more — ordering is preserved", () => {
            const queue = new Queue<number>();
            queue.push(1);
            queue.push(2);
            queue.pop();
            queue.push(3);
            expect(queue.front()).toBe(2);
            expect(queue.back()).toBe(3);
            expect(queue.pop()).toBe(2);
            expect(queue.pop()).toBe(3);
        });
    });

    describe("QueueNode.setValue()", () => {
        test("setValue() updates the node's value", () => {
            const node = new QueueNode<number>(1);
            node.setValue(99);
            expect(node.getValue()).toBe(99);
        });
    });

    describe("generic type support", () => {
        test("works with strings", () => {
            const queue = new Queue<string>();
            queue.push("hello");
            queue.push("world");
            expect(queue.front()).toBe("hello");
            expect(queue.back()).toBe("world");
            expect(queue.pop()).toBe("hello");
            expect(queue.pop()).toBe("world");
        });

        test("works with objects", () => {
            const queue = new Queue<{ id: number; name: string }>();
            queue.push({ id: 1, name: "Alice" });
            queue.push({ id: 2, name: "Bob" });
            expect(queue.front()).toEqual({ id: 1, name: "Alice" });
            expect(queue.back()).toEqual({ id: 2, name: "Bob" });
            expect(queue.pop()).toEqual({ id: 1, name: "Alice" });
            expect(queue.pop()).toEqual({ id: 2, name: "Bob" });
        });

        test("works with booleans", () => {
            const queue = new Queue<boolean>();
            queue.push(true);
            queue.push(false);
            expect(queue.pop()).toBe(true);
            expect(queue.pop()).toBe(false);
        });
    });
});
