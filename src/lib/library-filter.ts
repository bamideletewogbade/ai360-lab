export type LibraryFilterKind = 'document' | 'image' | 'video' | 'project'
export type LibraryFilterStatus = 'ready' | 'draft'

export type LibraryFilterableItem = {
  kind: LibraryFilterKind
  status: LibraryFilterStatus
  title: string
  preview?: string
  formatLabel: string
  sourceLabel: string
}

const KIND_SEARCH_LABEL: Record<LibraryFilterKind, string> = {
  document: 'Document',
  image: 'Image',
  video: 'Video',
  project: 'Project work',
}

/** Pure filtering contract shared by the Library UI and its regression tests. */
export function filterLibraryItems<T extends LibraryFilterableItem>(
  items: T[],
  filters: { type: 'all' | LibraryFilterKind; status: 'all' | 'ready'; query: string },
) {
  const query = filters.query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (filters.type !== 'all' && item.kind !== filters.type) return false
    if (filters.status === 'ready' && item.status !== 'ready') return false
    if (!query) return true
    return [item.title, item.preview, item.formatLabel, item.sourceLabel, KIND_SEARCH_LABEL[item.kind]]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query)
  })
}
