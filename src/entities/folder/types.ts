export interface Folder {
  id: string

  categoryId: string

  parentId?: string

  name: string

  icon?: string

  color?: string

  order: number
}