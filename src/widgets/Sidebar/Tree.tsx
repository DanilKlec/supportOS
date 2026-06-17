import type { KnowledgeTreeNode } from "@/entities/knowledge";

import { TreeNode } from "./TreeNode";

interface Props {
  nodes: KnowledgeTreeNode[];
}

export function Tree({ nodes }: Props) {
  return (
    <div className="py-2">

      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
        />
      ))}

    </div>
  );
}