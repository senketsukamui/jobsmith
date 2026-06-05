import { create } from 'zustand'

type ViewMode = 'table' | 'kanban'

interface UiState {
  isAddDialogOpen: boolean
  statusFilter: string[]
  sourceFilter: string
  searchQuery: string
  showArchived: boolean
  viewMode: ViewMode

  openAddDialog: () => void
  closeAddDialog: () => void
  setStatusFilter: (ids: string[]) => void
  setSourceFilter: (source: string) => void
  setSearchQuery: (q: string) => void
  setShowArchived: (show: boolean) => void
  setViewMode: (mode: ViewMode) => void
}

export const useUiStore = create<UiState>((set) => ({
  isAddDialogOpen: false,
  statusFilter: [],
  sourceFilter: '',
  searchQuery: '',
  showArchived: false,
  viewMode: 'table',

  openAddDialog: () => set({ isAddDialogOpen: true }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
  setStatusFilter: (ids) => set({ statusFilter: ids }),
  setSourceFilter: (source) => set({ sourceFilter: source }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowArchived: (show) => set({ showArchived: show }),
  setViewMode: (mode) => set({ viewMode: mode }),
}))
