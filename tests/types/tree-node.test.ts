/* eslint-disable @typescript-eslint/no-empty-object-type */
import { describe, test, expectTypeOf } from "vitest";
import type { TreeNode } from "@/types/tree-node";

// ─── Helper types ─────────────────────────────────────────────────────────────

type Named = { name: string };
type NamedWithId = { name: string; id: number };
type Sized = { size: number };
type WithMeta = { name: string; meta: { created: number; updated: number } };
type WithOptional = { name: string; desc?: string };
type WithReadonly = { readonly name: string; value: number };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TreeNode — single type parameter (LeafNode defaults to InternalNode)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TreeNode — single type parameter", () => {
    describe("leaf nodes (no children)", () => {
        test("simple leaf is assignable", () => {
            const leaf: TreeNode<Named> = { name: "leaf" };
            expectTypeOf(leaf).toExtend<TreeNode<Named>>();
        });

        test("leaf has name property", () => {
            const leaf: TreeNode<Named> = { name: "leaf" };
            expectTypeOf(leaf).toHaveProperty("name");
        });

        test("leaf with multiple properties", () => {
            const leaf: TreeNode<NamedWithId> = { name: "x", id: 1 };
            expectTypeOf(leaf).toExtend<TreeNode<NamedWithId>>();
        });
    });

    describe("internal nodes (with children)", () => {
        test("internal node with empty children", () => {
            const node: TreeNode<Named> = { name: "root", $: [] };
            expectTypeOf(node).toExtend<TreeNode<Named>>();
        });

        test("internal node with leaf children", () => {
            const node: TreeNode<Named> = {
                name: "root",
                $: [{ name: "a" }, { name: "b" }],
            };
            expectTypeOf(node).toExtend<TreeNode<Named>>();
        });

        test("internal node with multiple properties", () => {
            const node: TreeNode<NamedWithId> = {
                name: "root",
                id: 0,
                $: [{ name: "child", id: 1 }],
            };
            expectTypeOf(node).toExtend<TreeNode<NamedWithId>>();
        });
    });

    describe("deeply nested trees", () => {
        test("two levels deep", () => {
            const tree: TreeNode<Named> = {
                name: "L0",
                $: [
                    {
                        name: "L1",
                        $: [{ name: "L2-leaf" }],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });

        test("three levels deep", () => {
            const tree: TreeNode<Named> = {
                name: "L0",
                $: [
                    {
                        name: "L1",
                        $: [
                            {
                                name: "L2",
                                $: [{ name: "L3-leaf" }],
                            },
                        ],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });

        test("four levels deep with mixed internal and leaf", () => {
            const tree: TreeNode<Named> = {
                name: "root",
                $: [
                    { name: "leaf-at-L1" },
                    {
                        name: "internal-L1",
                        $: [
                            { name: "leaf-at-L2" },
                            {
                                name: "internal-L2",
                                $: [
                                    {
                                        name: "internal-L3",
                                        $: [{ name: "leaf-at-L4" }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });
    });

    describe("wide trees", () => {
        test("many children at one level", () => {
            const tree: TreeNode<Named> = {
                name: "root",
                $: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });

        test("wide at multiple levels", () => {
            const tree: TreeNode<Named> = {
                name: "root",
                $: [
                    {
                        name: "a",
                        $: [{ name: "a1" }, { name: "a2" }, { name: "a3" }],
                    },
                    {
                        name: "b",
                        $: [{ name: "b1" }, { name: "b2" }],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });
    });

    describe("linear chain (single child per level)", () => {
        test("deep linear chain", () => {
            const tree: TreeNode<Named> = {
                name: "L0",
                $: [
                    {
                        name: "L1",
                        $: [
                            {
                                name: "L2",
                                $: [
                                    {
                                        name: "L3",
                                        $: [{ name: "L4" }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<TreeNode<Named>>();
        });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TreeNode — two type parameters (distinct InternalNode and LeafNode)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TreeNode — two type parameters", () => {
    describe("basic heterogeneous trees", () => {
        test("leaf uses LeafNode shape, internal uses InternalNode shape", () => {
            type Tree = TreeNode<Named, Sized>;
            const tree: Tree = {
                name: "folder",
                $: [{ size: 100 }, { size: 200 }],
            };
            expectTypeOf(tree).toExtend<Tree>();
        });

        test("leaf-only (no children)", () => {
            type Tree = TreeNode<Named, Sized>;
            const leaf: Tree = { size: 42 };
            expectTypeOf(leaf).toExtend<Tree>();
        });

        test("internal node with empty children", () => {
            type Tree = TreeNode<Named, Sized>;
            const node: Tree = { name: "empty-dir", $: [] };
            expectTypeOf(node).toExtend<Tree>();
        });
    });

    describe("deeply nested heterogeneous trees", () => {
        test("two levels — mixed leaf and internal", () => {
            type Tree = TreeNode<Named, Sized>;
            const tree: Tree = {
                name: "root",
                $: [
                    { size: 10 },
                    {
                        name: "sub",
                        $: [{ size: 20 }],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<Tree>();
        });

        test("three levels deep", () => {
            type Tree = TreeNode<Named, Sized>;
            const tree: Tree = {
                name: "L0",
                $: [
                    {
                        name: "L1",
                        $: [
                            {
                                name: "L2",
                                $: [{ size: 42 }],
                            },
                        ],
                    },
                ],
            };
            expectTypeOf(tree).toExtend<Tree>();
        });
    });

    describe("InternalNode and LeafNode with overlapping properties", () => {
        test("shared property name with same type", () => {
            type Internal = { name: string; isDir: true };
            type Leaf = { name: string; isDir: false };
            type Tree = TreeNode<Internal, Leaf>;

            const tree: Tree = {
                name: "dir",
                isDir: true,
                $: [{ name: "file.txt", isDir: false }],
            };
            expectTypeOf(tree).toExtend<Tree>();
        });
    });

    describe("complex LeafNode types", () => {
        test("leaf with nested object properties", () => {
            type Tree = TreeNode<Named, WithMeta>;
            const tree: Tree = {
                name: "root",
                $: [
                    {
                        name: "child",
                        meta: { created: 1000, updated: 2000 },
                    },
                ],
            };
            expectTypeOf(tree).toExtend<Tree>();
        });

        test("leaf with optional properties", () => {
            type Tree = TreeNode<Named, WithOptional>;
            const withDesc: Tree = { name: "a", desc: "hello" };
            const withoutDesc: Tree = { name: "b" };
            expectTypeOf(withDesc).toExtend<Tree>();
            expectTypeOf(withoutDesc).toExtend<Tree>();
        });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  $ property discrimination
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("$ property discrimination", () => {
    test("$ on internal node is an array of TreeNode", () => {
        type Tree = TreeNode<Named>;
        type Internal = Extract<Tree, { $: unknown }>;
        expectTypeOf<Internal["$"]>().toEqualTypeOf<Tree[]>();
    });

    test("$ on leaf node is never (optional never)", () => {
        type Tree = TreeNode<Named>;
        type Leaf = Exclude<Tree, { $: unknown[] }>;
        expectTypeOf<Leaf>().toHaveProperty("name");
        // Leaf should accept $?: never, meaning $ cannot be set
        expectTypeOf<Leaf["$"]>().toEqualTypeOf<never | undefined>();
    });

    test("internal node $ must be an array", () => {
        type Tree = TreeNode<Named>;
        type Internal = Extract<Tree, { $: unknown }>;
        expectTypeOf<Internal["$"]>().toBeArray();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  OmitFromUnion strips $ from InternalNode / LeafNode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("$ is omitted from user-provided types", () => {
    test("InternalNode's own properties appear on internal nodes (not $)", () => {
        type Tree = TreeNode<NamedWithId>;
        type Internal = Extract<Tree, { $: unknown }>;
        expectTypeOf<Internal>().toHaveProperty("name");
        expectTypeOf<Internal>().toHaveProperty("id");
        expectTypeOf<Internal>().toHaveProperty("$");
    });

    test("LeafNode's own properties appear on leaf nodes", () => {
        type Tree = TreeNode<Named, Sized>;
        type Leaf = Exclude<Tree, { $: unknown[] }>;
        expectTypeOf<Leaf>().toHaveProperty("size");
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Modifier preservation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("modifier preservation", () => {
    test("optional properties preserved on leaf", () => {
        type Tree = TreeNode<Named, WithOptional>;
        const leaf: Tree = { name: "x" };
        expectTypeOf(leaf).toExtend<Tree>();
    });

    test("optional properties preserved — can provide value", () => {
        type Tree = TreeNode<Named, WithOptional>;
        const leaf: Tree = { name: "x", desc: "hello" };
        expectTypeOf(leaf).toExtend<Tree>();
    });

    test("readonly properties preserved on internal node", () => {
        type Tree = TreeNode<WithReadonly>;
        const node: Tree = { name: "x", value: 1, $: [] };
        expectTypeOf(node).toExtend<Tree>();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Union node types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("union InternalNode / LeafNode types", () => {
    test("InternalNode as union type", () => {
        type Dir = { kind: "dir"; name: string };
        type Symlink = { kind: "symlink"; target: string };
        type File = { size: number };
        type Tree = TreeNode<Dir | Symlink, File>;

        const tree1: Tree = {
            kind: "dir",
            name: "src",
            $: [{ size: 100 }],
        };
        const tree2: Tree = {
            kind: "symlink",
            target: "/usr/bin",
            $: [{ size: 200 }],
        };
        expectTypeOf(tree1).toExtend<Tree>();
        expectTypeOf(tree2).toExtend<Tree>();
    });

    test("LeafNode as union type", () => {
        type Container = { name: string };
        type TextFile = { content: string };
        type BinaryFile = { data: Uint8Array };
        type Tree = TreeNode<Container, TextFile | BinaryFile>;

        const tree: Tree = {
            name: "root",
            $: [{ content: "hello" }, { data: new Uint8Array([1, 2, 3]) }],
        };
        expectTypeOf(tree).toExtend<Tree>();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("edge cases", () => {
    test("empty object as InternalNode and LeafNode", () => {
        type Tree = TreeNode<{}, {}>;
        const leaf: Tree = {};
        const internal: Tree = { $: [{}] };
        expectTypeOf(leaf).toExtend<Tree>();
        expectTypeOf(internal).toExtend<Tree>();
    });

    test("single-node tree (just a leaf)", () => {
        const tree: TreeNode<Named> = { name: "only" };
        expectTypeOf(tree).toExtend<TreeNode<Named>>();
    });

    test("single-node tree (internal with no children)", () => {
        const tree: TreeNode<Named> = { name: "empty-root", $: [] };
        expectTypeOf(tree).toExtend<TreeNode<Named>>();
    });

    test("InternalNode with many properties", () => {
        type BigNode = { a: string; b: number; c: boolean; d: string[]; e: { nested: true } };
        type Tree = TreeNode<BigNode>;
        const tree: Tree = {
            a: "x",
            b: 1,
            c: true,
            d: ["y"],
            e: { nested: true },
            $: [],
        };
        expectTypeOf(tree).toExtend<Tree>();
    });

    test("children array preserves full TreeNode union type", () => {
        type Tree = TreeNode<Named, Sized>;
        type Internal = Extract<Tree, { $: unknown }>;
        // Each child can be either internal (Named + $) or leaf (Sized)
        expectTypeOf<Internal["$"][number]>().toEqualTypeOf<Tree>();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Assignability checks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assignability", () => {
    test("leaf shape is assignable to TreeNode", () => {
        expectTypeOf<{ name: string }>().toExtend<TreeNode<Named>>();
    });

    test("internal shape is assignable to TreeNode", () => {
        expectTypeOf<{ name: string; $: TreeNode<Named>[] }>().toExtend<TreeNode<Named>>();
    });

    test("TreeNode<Named, Sized> leaf (Sized) is assignable", () => {
        expectTypeOf<{ size: number }>().toExtend<TreeNode<Named, Sized>>();
    });

    test("TreeNode<Named, Sized> internal (Named + $) is assignable", () => {
        expectTypeOf<{
            name: string;
            $: TreeNode<Named, Sized>[];
        }>().toExtend<TreeNode<Named, Sized>>();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Type error cases — @ts-expect-error
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("type errors — invalid structures", () => {
    test("InternalNode with $ property is rejected", () => {
        // The constraint `{ $?: never }` on InternalNode prevents $ in the user type
        // @ts-expect-error — InternalNode must not have a $ property
        type _Invalid = TreeNode<{ name: string; $: string[] }>;
    });

    test("LeafNode with $ property is rejected", () => {
        // @ts-expect-error — LeafNode must not have a $ property
        type _Invalid = TreeNode<Named, { size: number; $: number[] }>;
    });

    test("$ as non-never value on leaf is rejected at assignment", () => {
        // Leaf nodes have $?: never, so assigning $ with a value should fail
        // @ts-expect-error — leaf cannot have $ with a truthy value
        const _leaf: TreeNode<Named> = { name: "bad", $: "not-an-array" };
    });

    test("$ as a non-array value on internal node is rejected", () => {
        // @ts-expect-error — $ must be TreeNode[], not a string
        const _node: TreeNode<Named> = { name: "bad", $: "children" };
    });

    test("$ as a number is rejected", () => {
        // @ts-expect-error — $ must be TreeNode[], not a number
        const _node: TreeNode<Named> = { name: "bad", $: 42 };
    });

    test("missing required InternalNode properties on internal node", () => {
        // @ts-expect-error — internal node needs `name` from Named
        const _node: TreeNode<NamedWithId> = { id: 1, $: [] };
    });

    test("missing required LeafNode properties on leaf node", () => {
        // @ts-expect-error — leaf node needs `size` from Sized
        const _leaf: TreeNode<Named, Sized> = {};
    });

    test("wrong type for InternalNode property", () => {
        // @ts-expect-error — `name` should be string, not number
        const _node: TreeNode<Named> = { name: 123, $: [] };
    });

    test("wrong type for LeafNode property", () => {
        // @ts-expect-error — `size` should be number, not string
        const _leaf: TreeNode<Named, Sized> = { size: "big" };
    });

    test("children with wrong shape are rejected", () => {
        const _tree: TreeNode<Named> = {
            name: "root",
            // @ts-expect-error — children must match TreeNode<Named>, not arbitrary objects
            $: [{ invalid: true }],
        };
    });

    test("deeply nested wrong child shape is rejected", () => {
        const _tree: TreeNode<Named> = {
            name: "L0",
            $: [
                {
                    name: "L1",
                    // @ts-expect-error — nested children must also match TreeNode<Named>
                    $: [{ wrong: "shape" }],
                },
            ],
        };
    });

    test("primitive type parameter is rejected", () => {
        // @ts-expect-error — InternalNode must extend object
        type _Invalid = TreeNode<string>;
    });

    test("primitive LeafNode type parameter is rejected", () => {
        // @ts-expect-error — LeafNode must extend object
        type _Invalid = TreeNode<Named, number>;
    });

    test("children array of wrong TreeNode type", () => {
        // Internal node of TreeNode<Named, Sized> must have children of type TreeNode<Named, Sized>[]
        // An object with `tag` doesn't match Named (internal) or Sized (leaf)
        const _tree: TreeNode<Named, Sized> = {
            name: "root",
            // @ts-expect-error — child shape doesn't match either internal or leaf
            $: [{ tag: "wrong" }],
        };
    });

    test("both InternalNode and LeafNode with $ are rejected", () => {
        // @ts-expect-error — neither type param can have $
        type _Invalid = TreeNode<{ $: string[] }, { $: number[] }>;
    });
});
