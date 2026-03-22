import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseFileMock = vi.fn();

vi.mock('../../../src/lib/parsers', () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

import type { ParsedDocument } from '../../../src/types';
import { useDocumentStore } from '../../../src/store/documentStore';

const DOCUMENT_STORE_KEY = 'fueki-documents-v1';

const sampleDocument: ParsedDocument = {
  fileName: 'invoice.json',
  fileType: 'json',
  transactions: [
    {
      id: 'tx-1',
      type: 'invoice',
      amount: 1250,
      currency: 'USD',
      description: 'Invoice payment',
      date: '2026-03-21T05:00:00.000Z',
    },
  ],
  totalValue: 1250,
  currency: 'USD',
  parsedAt: '2026-03-21T05:00:00.000Z',
  documentHash: 'doc-hash-1',
};

describe('useDocumentStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    useDocumentStore.setState({
      parsedDocuments: [],
      currentDocument: null,
      currentDocumentFile: null,
      uploads: [],
      validations: new Map(),
      isLoading: false,
      error: null,
      isParsingDocument: false,
      parseError: null,
    });

    await useDocumentStore.persist.clearStorage();
  });

  it('persists parsed document metadata and rehydrates without serializing the raw file', async () => {
    useDocumentStore.getState().addDocument(sampleDocument);
    useDocumentStore.getState().setValidation({
      documentHash: sampleDocument.documentHash,
      isValid: true,
      errors: [],
      warnings: [],
      validatedAt: '2026-03-21T05:05:00.000Z',
    });
    useDocumentStore.getState().setCurrentDocumentFile(
      new File(['{}'], sampleDocument.fileName, { type: 'application/json' }),
    );

    const raw = localStorage.getItem(DOCUMENT_STORE_KEY);
    expect(raw).toBeTruthy();

    useDocumentStore.setState({
      parsedDocuments: [],
      currentDocument: null,
      currentDocumentFile: null,
      uploads: [],
      validations: new Map(),
      isLoading: false,
      error: null,
      isParsingDocument: false,
      parseError: null,
    });
    localStorage.setItem(DOCUMENT_STORE_KEY, raw as string);

    await useDocumentStore.persist.rehydrate();

    const state = useDocumentStore.getState();
    expect(state.parsedDocuments).toHaveLength(1);
    expect(state.currentDocument?.documentHash).toBe(sampleDocument.documentHash);
    expect(state.currentDocumentFile).toBeNull();
    expect(state.validations.get(sampleDocument.documentHash)?.isValid).toBe(true);
  });

  it('falls back gracefully when localStorage quota writes fail', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

    expect(() => {
      useDocumentStore.getState().addDocument(sampleDocument);
    }).not.toThrow();

    expect(useDocumentStore.getState().parsedDocuments).toHaveLength(1);

    setItemSpy.mockRestore();
  });

  it('sets loading and error state around document parsing', async () => {
    parseFileMock.mockRejectedValueOnce(new Error('Invalid test file'));

    await expect(
      useDocumentStore.getState().parseDocument(
        new File(['bad'], 'bad.json', { type: 'application/json' }),
      ),
    ).rejects.toThrow('Invalid test file');

    const state = useDocumentStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isParsingDocument).toBe(false);
    expect(state.error).toBe('Invalid test file');
    expect(state.parseError).toBe('Invalid test file');
  });
});
