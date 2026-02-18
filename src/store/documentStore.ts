import { create } from 'zustand';
import type { ParsedDocument } from '../types/index.ts';

// ---------------------------------------------------------------------------
// Upload progress tracking
// ---------------------------------------------------------------------------

export interface UploadProgress {
  fileId: string;
  fileName: string;
  /** 0-100 percentage. */
  percent: number;
  status: 'pending' | 'uploading' | 'parsing' | 'complete' | 'error';
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation state
// ---------------------------------------------------------------------------

export interface DocumentValidation {
  documentHash: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validatedAt: string;
}

// ---------------------------------------------------------------------------
// State & Actions interfaces
// ---------------------------------------------------------------------------

export interface DocumentState {
  parsedDocuments: ParsedDocument[];
  currentDocument: ParsedDocument | null;
  uploads: UploadProgress[];
  validations: Map<string, DocumentValidation>;
  isParsingDocument: boolean;
  parseError: string | null;
}

export interface DocumentActions {
  addDocument: (doc: ParsedDocument) => void;
  removeDocument: (hash: string) => void;
  setCurrentDocument: (doc: ParsedDocument | null) => void;
  clearDocuments: () => void;
  // Upload management
  startUpload: (fileId: string, fileName: string) => void;
  updateUploadProgress: (
    fileId: string,
    update: Partial<Omit<UploadProgress, 'fileId' | 'fileName'>>,
  ) => void;
  completeUpload: (fileId: string) => void;
  failUpload: (fileId: string, error: string) => void;
  removeUpload: (fileId: string) => void;
  clearUploads: () => void;
  // Parsing state
  setParsingDocument: (parsing: boolean) => void;
  setParseError: (error: string | null) => void;
  // Validation
  setValidation: (validation: DocumentValidation) => void;
  removeValidation: (documentHash: string) => void;
  getValidation: (documentHash: string) => DocumentValidation | undefined;
}

export type DocumentStore = DocumentState & DocumentActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialDocumentsState: DocumentState = {
  parsedDocuments: [],
  currentDocument: null,
  uploads: [],
  validations: new Map(),
  isParsingDocument: false,
  parseError: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDocumentStore = create<DocumentStore>()((set, get) => ({
  ...initialDocumentsState,

  // ---- Document CRUD --------------------------------------------------------

  addDocument: (doc) =>
    set((state) => ({
      parsedDocuments: [...state.parsedDocuments, doc],
      parseError: null,
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

  clearDocuments: () =>
    set({
      parsedDocuments: [],
      currentDocument: null,
      parseError: null,
    }),

  // ---- Upload management ----------------------------------------------------

  startUpload: (fileId, fileName) =>
    set((state) => ({
      uploads: [
        ...state.uploads,
        { fileId, fileName, percent: 0, status: 'uploading' },
      ],
    })),

  updateUploadProgress: (fileId, update) =>
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.fileId === fileId ? { ...u, ...update } : u,
      ),
    })),

  completeUpload: (fileId) =>
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.fileId === fileId ? { ...u, percent: 100, status: 'complete' } : u,
      ),
    })),

  failUpload: (fileId, error) =>
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.fileId === fileId ? { ...u, status: 'error', error } : u,
      ),
    })),

  removeUpload: (fileId) =>
    set((state) => ({
      uploads: state.uploads.filter((u) => u.fileId !== fileId),
    })),

  clearUploads: () => set({ uploads: [] }),

  // ---- Parsing state --------------------------------------------------------

  setParsingDocument: (parsing) => set({ isParsingDocument: parsing }),

  setParseError: (error) =>
    set({ parseError: error, isParsingDocument: false }),

  // ---- Validation -----------------------------------------------------------

  setValidation: (validation) =>
    set((state) => {
      const next = new Map(state.validations);
      next.set(validation.documentHash, validation);
      return { validations: next };
    }),

  removeValidation: (documentHash) =>
    set((state) => {
      const next = new Map(state.validations);
      next.delete(documentHash);
      return { validations: next };
    }),

  getValidation: (documentHash) => {
    return get().validations.get(documentHash);
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectParsedDocuments = (state: DocumentStore) =>
  state.parsedDocuments;
export const selectCurrentDocument = (state: DocumentStore) =>
  state.currentDocument;
export const selectUploads = (state: DocumentStore) => state.uploads;
export const selectActiveUploads = (state: DocumentStore) =>
  state.uploads.filter((u) => u.status === 'uploading' || u.status === 'parsing');
export const selectIsParsingDocument = (state: DocumentStore) =>
  state.isParsingDocument;
export const selectParseError = (state: DocumentStore) => state.parseError;
