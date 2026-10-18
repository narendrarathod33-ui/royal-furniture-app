export type Category = { s: string; n: string };
export type CategoryProduct = { c: string; sc?: string; scn?: string };
export type CategoryLeaf = { slug: string; name: string; category: string; subcategory: string };
export type CategoryDestination = { category: string; subcategory: string; leaf: string; label: string; path: string };

export function categoryDestinations(categories: readonly Category[], products: readonly CategoryProduct[], leaves: readonly CategoryLeaf[]): CategoryDestination[] {
  return categories.flatMap((category) => {
    const children = [...new Map(products.filter((product) => product.c === category.s && product.sc).map((product) => [product.sc!, product.scn || product.sc!])).entries()];
    return [
      { category: category.s, subcategory: 'all', leaf: 'all', label: category.n, path: category.n },
      ...children.flatMap(([id, name]) => [
        { category: category.s, subcategory: id, leaf: 'all', label: name, path: `${category.n} / ${name}` },
        ...leaves.filter((leaf) => leaf.category === category.s && leaf.subcategory === id).map((leaf) => ({ category: category.s, subcategory: id, leaf: leaf.slug, label: leaf.name, path: `${category.n} / ${name} / ${leaf.name}` })),
      ]),
    ];
  });
}

export function searchCategories(destinations: readonly CategoryDestination[], query: string): CategoryDestination[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return destinations.filter((destination) => terms.every((term) => destination.path.toLocaleLowerCase().includes(term)));
}
