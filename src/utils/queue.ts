class QueueNode<T> {
    public value: T;
    public nextNode: QueueNode<T> | null;
    constructor(value: T, nextNode?: QueueNode<T>) {
        this.value = value;
        this.nextNode = nextNode ?? null;
    }

    getValue() {
        return this.value;
    }

    setValue(value: T) {
        this.value = value;
    }

    setNextNode(nextNode: QueueNode<T>) {
        this.nextNode = nextNode;
    }

    getNextNode() {
        return this.nextNode;
    }
}

export class Queue<T> {
    private frontNode: QueueNode<T> | null;
    private backNode: QueueNode<T> | null;

    constructor() {
        this.frontNode = this.backNode = null;
    }

    front(): T | null {
        if (this.frontNode === null) {
            return null;
        }

        return this.frontNode.getValue();
    }

    back(): T | null {
        if (this.backNode === null) {
            return null;
        }

        return this.backNode.getValue();
    }

    push(element: T): void {
        const node = new QueueNode(element);

        if (this.frontNode === null) {
            this.frontNode = this.backNode = node;
        } else {
            this.backNode!.setNextNode(node);
            this.backNode = node;
        }
    }

    pop(): T {
        if (this.frontNode === null) {
            throw Error("Cannot pop from an empty queue");
        }

        const popped = this.frontNode;
        this.frontNode = popped.getNextNode();

        if (this.frontNode === null) {
            this.backNode = null;
        }

        return popped.getValue();
    }
}
