export type TreeNode<
    InternalNode extends object & { $?: never },
    LeafNode extends object & { $?: never } = InternalNode,
> =
    | ({
          $: TreeNode<InternalNode, LeafNode>[];
      } & Omit<InternalNode, "$">)
    | Omit<LeafNode, "$">;
