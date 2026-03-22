import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseFile } from '../lib/parsers';
import type { ParsedDocument } from '../types/index.ts';
import { createSafeJsonStorage } from './persistStorage';
import { withStoreMiddleware } from './storeMiddleware';

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
  currentDocumentFile: File | null;
  uploads: UploadProgress[];
  validations: Map<string, DocumentValidation>;
  isLoading: boolean;
  error: string | null;
  isParsingDocument: boolean;
  parseError: string | null;
}

export interface DocumentActions {
  addDocument: (doc: ParsedDocument) => void;
  removeDocument: (hash: string) => void;
  setCurrentDocument: (doc: ParsedDocument | null) => void;
  setCurrentDocumentFile: (file: File | null) => void;
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
  parseDocument: (file: File) => Promise<ParsedDocument>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setParsingDocument: (parsing: boolean) => void;
  setParseError: (error: string | null) => void;
  // Validation
  setValidation: (validation: DocumentValidation) => void;
  removeValidation: (documentHash: string) => void;
  getValidation: (documentHash: string) => DocumentValidation | undefined;
}

export type DocumentStore = DocumentState & DocumentActions;

const DOCUMENT_STORE_KEY = 'fueki-documents-v1';

interface PersistedDocumentState {
  parsedDocuments: ParsedDocument[];
  currentDocument: ParsedDocument | null;
  validations: Array<[string, DocumentValidation]>;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialDocumentsState: DocumentState = {
  parsedDocuments: [],
  currentDocument: null,
  currentDocumentFile: null,
  uploads: [],
  validations: new Map(),
  isLoading: false,
  error: null,
  isParsingDocument: false,
  parseError: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDocumentStore = create<DocumentStore>()(
  withStoreMiddleware('document', persist(
    (set, get) => ({
      ...initialDocumentsState,

      // ---- Document CRUD --------------------------------------------------------

      addDocument: (doc) =>
        set((state) => ({
          parsedDocuments: [
            ...state.parsedDocuments.filter(
              (existing) => existing.documentHash !== doc.documentHash,
            ),
            doc,
          ],
          currentDocument: doc,
          error: null,
          parseError: null,
        })),

      removeDocument: (hash) =>
        set((state) => {
          const nextValidations = new Map(state.validations);
          nextValidations.delete(hash);

          return {
            parsedDocuments: state.parsedDocuments.filter(
              (d) => d.documentHash !== hash,
            ),
            currentDocument:
              state.currentDocument?.documentHash === hash
                ? null
                : state.currentDocument,
            validations: nextValidations,
          };
        }),

      setCurrentDocument: (doc) =>
        set({
          currentDocument: doc,
          error: null,
          parseError: null,
        }),

      setCurrentDocumentFile: (file) => set({ currentDocumentFile: file }),

      clearDocuments: () =>
        set({
          parsedDocuments: [],
          currentDocument: null,
          currentDocumentFile: null,
          uploads: [],
          validations: new Map(),
          isLoading: false,
          error: null,
          isParsingDocument: false,
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

      parseDocument: async (file) => {
        set({
          currentDocument: null,
          currentDocumentFile: file,
          isLoading: true,
          error: null,
          isParsingDocument: true,
          parseError: null,
        });

        try {
          const doc = await parseFile(file);

          if (doc.transactions.length === 0) {
            throw new Error(
              'No valid transactions found in this file. Please check the file structure.',
            );
          }

          if (doc.totalValue <= 0) {
            throw new Error(
              'The document has no positive monetary value to tokenize. The total of all transaction amounts must be greater than zero.',
            );
          }

          set((state) => ({
            parsedDocuments: [
              ...state.parsedDocuments.filter(
                (existing) => existing.documentHash !== doc.documentHash,
              ),
              doc,
            ],
            currentDocument: doc,
            isLoading: false,
            error: null,
            isParsingDocument: false,
            parseError: null,
          }));

          return doc;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to parse file';

          set({
            currentDocument: null,
            isLoading: false,
            error: message,
            isParsingDocument: false,
            parseError: message,
          });

          throw error;
        }
      },

      setLoading: (loading) =>
        set({
          isLoading: loading,
          isParsingDocument: loading,
        }),

      setError: (error) =>
        set({
          error,
          parseError: error,
          isLoading: false,
          isParsingDocument: false,
        }),

      setParsingDocument: (parsing) =>
        set({
          isLoading: parsing,
          isParsingDocument: parsing,
        }),

      setParseError: (error) =>
        set({
          error,
          parseError: error,
          isLoading: false,
          isParsingDocument: false,
        }),

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
    }),
    {
      name: DOCUMENT_STORE_KEY,
      version: 1,
      storage: createSafeJsonStorage('document-store'),
      partialize: (state): PersistedDocumentState => ({
        parsedDocuments: state.parsedDocuments,
        currentDocument: state.currentDocument,
        validations: Array.from(state.validations.entries()),
      }),
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<PersistedDocumentState> | undefined;

        return {
          ...currentState,
          parsedDocuments: typedState?.parsedDocuments ?? currentState.parsedDocuments,
          currentDocument: typedState?.currentDocument ?? currentState.currentDocument,
          validations: new Map(
            typedState?.validations ?? Array.from(currentState.validations.entries()),
          ),
        };
      },
    },
  )),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectParsedDocuments = (state: DocumentStore) =>
  state.parsedDocuments;
export const selectCurrentDocument = (state: DocumentStore) =>
  state.currentDocument;
export const selectCurrentDocumentFile = (state: DocumentStore) =>
  state.currentDocumentFile;
export const selectUploads = (state: DocumentStore) => state.uploads;
export const selectActiveUploads = (state: DocumentStore) =>
  state.uploads.filter((u) => u.status === 'uploading' || u.status === 'parsing');
export const selectIsDocumentLoading = (state: DocumentStore) =>
  state.isLoading;
export const selectDocumentError = (state: DocumentStore) => state.error;
export const selectIsParsingDocument = (state: DocumentStore) =>
  state.isParsingDocument;
export const selectParseError = (state: DocumentStore) => state.parseError;
