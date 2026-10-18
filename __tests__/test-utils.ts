// Thin traversal helpers over the RNTL v14 host tree (elements expose
// `queryAll`; the react-test-renderer finder API is gone in v14).
export type Node = { type: any; props: Record<string, any>; children: Node[] };

export const queryAll = (root: Node, predicate: (node: Node) => boolean): Node[] =>
  root.queryAll(predicate, {});

export const byProps = (root: Node, props: Record<string, any>): Node[] =>
  queryAll(root, (node) => Object.entries(props).every(([key, value]) => node.props?.[key] === value));

export const firstByProps = (root: Node, props: Record<string, any>): Node => {
  const hit = byProps(root, props);
  if (!hit.length) throw new Error(`no node matching ${JSON.stringify(props)}`);
  return hit[0];
};

export const byType = (root: Node, typeName: string): Node[] => queryAll(root, (node) => node.type === typeName);

/** All pressable host nodes: native Pressable surfaces handlers on its host. */
export const pressables = (root: Node): Node[] =>
  queryAll(root, (node) => typeof node.props?.onStartShouldSetResponder === 'function' || typeof node.props?.onPress === 'function');

/** Concatenates every text leaf below a host node. */
export function flattenText(node: any): string {
  if (typeof node === 'string') return node;
  if (!node?.children) return '';
  return node.children.map(flattenText).join('');
}
