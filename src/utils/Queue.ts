class QueueNode {
    constructor(value, nextNode) {
        if (value === undefined) {
            value = null;
        }

        if (nextNode === undefined) {
            nextNode = null;
        }

        this.value = value;
        this.nextNode = nextNode;
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = value;
    }

    setNextNode(nextNode) {
        this.nextNode = nextNode;
    }

    getNextNode() {
        return this.nextNode;
    }
}

class Queue {
    constructor() {
        this._front = this._back = null;
    }

    front() {
        if (this._front == null) {
            return null;
        }

        return this._front.getValue();
    }

    back() {
        if (this._back == null) {
            return null;
        }

        return this._back.getValue();
    }

    push(element) {
        const node = new QueueNode(element);

        if (this._front == null) {
            this._front = this._back = node;
        } else {
            this._back.setNextNode(node);
            this._back = node;
        }
    }

    pop() {
        if (this._front == null) {
            throw Error("Cannot pop from an empty queue.");
        }

        const popped = this._front;
        this._front = popped.getNextNode();

        if (this._front == null) {
            this._back = null;
        }

        return popped.getValue();
    }
}

/*
const queue = new Queue();
queue.push(1);
console.log(queue.front(), queue.back());

queue.push(2);
console.log(queue.front(), queue.back());

queue.push(3);
console.log(queue.front(), queue.back());

console.log(queue.pop());
console.log(queue.front(), queue.back());

console.log(queue.pop());
console.log(queue.front(), queue.back());

console.log(queue.pop());
console.log(queue.front(), queue.back());
*/

export default Queue;
