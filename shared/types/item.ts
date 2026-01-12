export type ItemType = {
  id: number;
  label: string;
  type: "folder" | "markdown";
  content: string | null;
  parentId: number | null;
  children?: ItemType[];
};
