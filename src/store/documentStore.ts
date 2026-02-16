import { create } from 'zustand';
import type { ParsedDocument } from '../types/index.ts';

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface DocumentState {
  parsedDocuments: ParsedDocument[];
  currentDocument: ParsedDocument | null;
}

export interface DocumentActions {
  addDocument: (doc: ParsedDocument) => void;
  removeDocument: (hash: string) => void;
  setCurrentDocument: (doc: ParsedDocument | null) => void;
  clearDocuments: () => void;
}

export type DocumentStore = DocumentState & DocumentActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialDocumentsState: DocumentState = {
  parsedDocuments: [],
  currentDocument: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDocumentStore = create<DocumentStore>()((set) => ({
  ...initialDocumentsState,

  addDocument: (doc) =>
    set((state) => ({
      parsedDocuments: [...state.parsedDocuments, doc],
    })),

  removeDocument: (hash) =>
    set((state) => ({
      parsedDocuments: state.parsedDocuments.filter(
        (d) => d.documentHash !== hash,
      ),
      currentDocument:
        state.currentDocument?.documentHash === hash
          ? null
          : state.currentDocument,
    })),

  setCurrentDocument: (doc) => set({ currentDocument: doc }),

  clearDocuments: () => set({ ...initialDocumentsState }),
}));
