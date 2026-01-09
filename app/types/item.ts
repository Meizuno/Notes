export type ItemType = {
  id: number;
  label: string;
  content: string | null;
  parent_id: number | null;
  children?: ItemType[];
};
