import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';

const pdfJsMock = vi.hoisted(() => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => pdfJsMock);

describe('parsePdfFile', () => {
  beforeEach(() => {
    pdfJsMock.GlobalWorkerOptions.workerSrc = '';
    pdfJsMock.getDocument.mockReset();
    vi.resetModules();
  });

  it('loads the legacy pdf.js bundle and parses text-based PDFs', async () => {
    pdfJsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [
              {
                str: 'Appraised Value',
                dir: 'ltr',
                transform: [1, 0, 0, 1, 0, 100],
                width: 90,
                height: 12,
                fontName: 'Helvetica',
                hasEOL: false,
              },
              {
                str: '$1,250.00',
                dir: 'ltr',
                transform: [1, 0, 0, 1, 100, 100],
                width: 70,
                height: 12,
                fontName: 'Helvetica',
                hasEOL: false,
              },
            ],
          }),
        }),
      }),
    });

    const { parsePdfFile } = await import('../../../src/lib/parsers/pdfParser');
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
      'statement.pdf',
      { type: 'application/pdf' },
    );

    const parsed = await parsePdfFile(file);

    assert.equal(parsed.fileName, 'statement.pdf');
    assert.equal(parsed.fileType, 'pdf');
    assert.equal(parsed.totalValue, 1250);
    assert.equal(parsed.currency, 'USD');
    assert.ok(parsed.documentHash.startsWith('0x'));
    assert.equal(pdfJsMock.getDocument.mock.calls.length, 1);
    assert.match(
      pdfJsMock.GlobalWorkerOptions.workerSrc,
      /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs$/,
    );
  });
});
