export const buildTree = (items: ItemType[]): ItemType[] => {
  const map = new Map<number, ItemType>();
  const roots: ItemType[] = [];

  items.forEach((item) => map.set(item.id, { ...item, children: [] }));

  items.forEach((item) => {
    const node = map.get(item.id)!;
    if (item.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(item.parent_id);
      if (parent) parent.children!.push(node);
    }
  });

  return roots;
};
