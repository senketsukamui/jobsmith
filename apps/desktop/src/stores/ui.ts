import { create } from 'zustand'

interface UiState {
  isAddDialogOpen: boolean
  statusFilter: string[]
  sourceFilter: string
  searchQuery: string
  showArchived: boolean

  openAddDialog: () => void
  closeAddDialog: () => void
  setStatusFilter: (ids: string[]) => void
  setSourceFilter: (source: string) => void
  setSearchQuery: (q: string) => void
  setShowArchived: (show: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  isAddDialogOpen: false,
  statusFilter: [],
  sourceFilter: '',
  searchQuery: '',
  showArchived: false,

  openAddDialog: () => set({ isAddDialogOpen: true }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
  setStatusFilter: (ids) => set({ statusFilter: ids }),
  setSourceFilter: (source) => set({ sourceFilter: source }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowArchived: (show) => set({ showArchived: show }),
}))
