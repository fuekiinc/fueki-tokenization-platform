/**
 * MintPage layout regression tests.
 *
 * Ensures pending-token requests are rendered under minting history to avoid
 * competing with token configuration inputs in the primary mint workflow.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MintPage from '../../../src/pages/MintPage';

vi.mock('../../../src/store/documentStore.ts', () => ({
  useDocumentStore: (selector: (state: { currentDocument: null }) => unknown) =>
    selector({ currentDocument: null }),
}));

vi.mock('../../../src/store/tradeStore.ts', () => ({
  useTradeStore: (selector: (state: { tradeHistory: unknown[] }) => unknown) =>
    selector({ tradeHistory: [] }),
}));

vi.mock('../../../src/components/Upload/FileUploader', () => ({
  default: () => <div data-testid="file-uploader">FileUploader</div>,
}));

vi.mock('../../../src/components/Upload/TransactionPreview', () => ({
  default: () => <div data-testid="transaction-preview">TransactionPreview</div>,
}));

vi.mock('../../../src/components/Mint/MintForm', () => ({
  default: () => <div data-testid="mint-form">MintForm</div>,
}));

vi.mock('../../../src/components/Mint/MintHistory', () => ({
  default: () => <div data-testid="mint-history">MintHistory</div>,
}));

vi.mock('../../../src/components/Mint/PendingTokensPanel', () => ({
  default: () => <div data-testid="pending-tokens-panel">PendingTokensPanel</div>,
}));

describe('MintPage', () => {
  it('renders pending tokens beneath mint history in step 4 section', () => {
    render(<MintPage />);

    expect(screen.getByTestId('mint-form')).toBeInTheDocument();
    expect(screen.getByText(/Minting history/i)).toBeInTheDocument();

    const mintHistory = screen.getByTestId('mint-history');
    const pendingPanel = screen.getByTestId('pending-tokens-panel');

    const historyPosition = mintHistory.compareDocumentPosition(pendingPanel);
    expect(historyPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
