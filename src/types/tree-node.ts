import type { OmitFromUnion } from "./global";

export type TreeNode<
    InternalNode extends object & { $?: never },
    LeafNode extends object & { $?: never } = InternalNode,
> =
    | ({
          $: TreeNode<InternalNode, LeafNode>[];
      } & OmitFromUnion<InternalNode, "$">)
    | OmitFromUnion<LeafNode, "$">;
