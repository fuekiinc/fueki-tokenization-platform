import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TransactionPreview from '../../../src/components/Upload/TransactionPreview';
import { useDocumentStore } from '../../../src/store/documentStore';

describe('TransactionPreview', () => {
  beforeEach(() => {
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
  });

  it('renders a loading state while document parsing is in progress', () => {
    useDocumentStore.setState({
      isLoading: true,
      isParsingDocument: true,
    });

    render(<TransactionPreview />);

    expect(screen.getByText(/Loading document transactions/i)).toBeInTheDocument();
  });

  it('renders an error message when document parsing fails', () => {
    useDocumentStore.setState({
      error: 'Failed to parse the uploaded file.',
      parseError: 'Failed to parse the uploaded file.',
    });

    render(<TransactionPreview />);

    expect(screen.getByText(/Unable to load document preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to parse the uploaded file\./i)).toBeInTheDocument();
  });
});
