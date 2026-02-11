/**
 * Document Intelligence Module
 *
 * Provides intelligent document classification and contextual value extraction
 * to identify the actual stated value of a document rather than blindly
 * extracting every number present.
 *
 * The module works in three phases:
 *   1. **Classification** -- determine the document type (appraisal, invoice, etc.)
 *   2. **Scoring** -- rank each extracted amount by proximity to value-indicating keywords
 *   3. **Selection** -- choose the primary stated value using a multi-strategy fallback
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DocumentCategory =
  | 'appraisal'
  | 'deed'
  | 'invoice'
  | 'certificate'
  | 'insurance'
  | 'loan'
  | 'receipt'
  | 'tax_assessment'
  | 'bank_statement'
  | 'bond'
  | 'stock_certificate'
  | 'letter_of_credit'
  | 'general_financial'
  | 'unknown';

export interface DocumentClassification {
  category: DocumentCategory;
  /** 0-1 confidence in the classification. */
  confidence: number;
  /** Sample keywords that matched during classification. */
  matchedKeywords: string[];
}

export interface ScoredAmount {
  amount: number;
  line: string;
  lineIndex: number;
  /** 0-110 raw score (higher = more likely to be the stated value). */
  score: number;
  /** Human-readable label of the matched indicator (e.g. "appraised value"). */
  matchedIndicator: string;
  /** Normalised confidence 0-1. */
  confidence: number;
}

export interface PrimaryValueResult {
  value: number;
  confidence: number;
  indicator: string;
  /** How the primary value was determined. */
  method: 'keyword_match' | 'keyword_match_largest' | 'moderate_confidence' | 'largest_amount_fallback';
}

// ---------------------------------------------------------------------------
// Document classification keywords
// ---------------------------------------------------------------------------

const DOCUMENT_CLASSIFIERS: Record<DocumentCategory, RegExp[]> = {
  appraisal: [
    /\bapprais(?:al|ed|er)\b/i,
    /\bmarket\s+value\b/i,
    /\bfair\s+market\b/i,
    /\bproperty\s+valuation\b/i,
    /\bas[- ]is\s+value\b/i,
    /\bestimated\s+value\b/i,
  ],
  deed: [
    /\b(?:warranty|quit\s*claim|grant)\s+deed\b/i,
    /\bconsideration\b/i,
    /\bconvey(?:ance|ed|s)\b/i,
    /\bgrantor\b/i,
    /\bgrantee\b/i,
    /\brecorded\s+in\b/i,
  ],
  invoice: [
    /\binvoice\b/i,
    /\bbill\s+(?:to|of)\b/i,
    /\bamount\s+due\b/i,
    /\bbalance\s+due\b/i,
    /\bpayment\s+terms\b/i,
    /\bdue\s+date\b/i,
    /\bremit(?:tance)?\s+to\b/i,
  ],
  certificate: [
    /\bcertificate\s+of\s+(?:deposit|title|ownership)\b/i,
    /\bface\s+value\b/i,
    /\bpar\s+value\b/i,
    /\bmaturity\s+date\b/i,
  ],
  insurance: [
    /\binsurance\s+polic(?:y|ies)\b/i,
    /\bcoverage\s+amount\b/i,
    /\bsum\s+insured\b/i,
    /\binsured\s+value\b/i,
    /\bpremium\b/i,
    /\bunderwriter\b/i,
  ],
  loan: [
    /\bloan\s+(?:agreement|document|amount)\b/i,
    /\bmortgage\b/i,
    /\bprincipal\s+amount\b/i,
    /\bpromissory\s+note\b/i,
    /\bborrower\b/i,
    /\blender\b/i,
  ],
  receipt: [
    /\breceipt\b/i,
    /\bamount\s+paid\b/i,
    /\bpayment\s+received\b/i,
    /\bthank\s+you\s+for\s+your\s+(?:payment|purchase)\b/i,
  ],
  tax_assessment: [
    /\btax\s+assess(?:ment|ed)\b/i,
    /\btaxable\s+value\b/i,
    /\bassessed\s+value\b/i,
    /\bproperty\s+tax\b/i,
  ],
  bank_statement: [
    /\bbank\s+statement\b/i,
    /\baccount\s+statement\b/i,
    /\bclosing\s+balance\b/i,
    /\bopening\s+balance\b/i,
    /\bavailable\s+balance\b/i,
  ],
  bond: [
    /\bbond\s+(?:certificate|agreement|indenture)\b/i,
    /\bdebenture\b/i,
    /\bcoupon\s+rate\b/i,
    /\byield\s+to\s+maturity\b/i,
    /\bnotional\b/i,
  ],
  stock_certificate: [
    /\bstock\s+certificate\b/i,
    /\bshares?\s+of\s+(?:common|preferred)\b/i,
    /\bno\.?\s+of\s+shares\b/i,
  ],
  letter_of_credit: [
    /\bletter\s+of\s+credit\b/i,
    /\bcredit\s+amount\b/i,
    /\bissuing\s+bank\b/i,
    /\bbeneficiary\b/i,
  ],
  general_financial: [
    /\btotal\s+assets?\b/i,
    /\bnet\s+worth\b/i,
    /\bbalance\s+sheet\b/i,
    /\bfinancial\s+statement\b/i,
    /\bincome\s+statement\b/i,
  ],
  unknown: [],
};

// ---------------------------------------------------------------------------
// Value indicator definitions
// ---------------------------------------------------------------------------

interface ValueIndicator {
  pattern: RegExp;
  label: string;
  /** Higher = more specific/reliable indicator of THE stated value. */
  weight: number;
  /** Document categories this indicator is most relevant for. */
  categories: DocumentCategory[];
}

/**
 * Ordered list of value-indicating phrases.  Higher-weight entries are more
 * specific (e.g. "appraised value" is weight 100 whereas a bare "total" is
 * only weight 60).  Category affinity gives a +10 bonus when the indicator
 * matches the classified document type.
 */
const VALUE_INDICATORS: ValueIndicator[] = [
  // === TIER 1: Highly specific "this IS the value" (weight 90-100) =========

  // Appraisals / valuations
  { pattern: /\b(?:total\s+)?apprais(?:al|ed)\s+value\b/i, label: 'appraised value', weight: 100, categories: ['appraisal', 'tax_assessment'] },
  { pattern: /\b(?:fair\s+)?market\s+value(?:\s+(?:as[- ]is|as[- ]completed))?\b/i, label: 'market value', weight: 100, categories: ['appraisal', 'tax_assessment', 'general_financial'] },
  { pattern: /\bestimated\s+(?:market\s+)?value\b/i, label: 'estimated value', weight: 95, categories: ['appraisal', 'insurance'] },
  { pattern: /\b(?:asset|property)\s+value\b/i, label: 'asset value', weight: 90, categories: ['appraisal', 'general_financial', 'insurance'] },

  // Insurance
  { pattern: /\binsured\s+value\b/i, label: 'insured value', weight: 100, categories: ['insurance'] },
  { pattern: /\bcoverage\s+amount\b/i, label: 'coverage amount', weight: 100, categories: ['insurance'] },
  { pattern: /\bsum\s+insured\b/i, label: 'sum insured', weight: 100, categories: ['insurance'] },

  // Certificates / bonds
  { pattern: /\bface\s+value\b/i, label: 'face value', weight: 100, categories: ['bond', 'certificate'] },
  { pattern: /\bpar\s+value\b/i, label: 'par value', weight: 95, categories: ['bond', 'certificate', 'stock_certificate'] },
  { pattern: /\bnotional\s+(?:value|amount)\b/i, label: 'notional value', weight: 90, categories: ['bond', 'general_financial'] },

  // Loans
  { pattern: /\bprincipal\s+amount\b/i, label: 'principal amount', weight: 100, categories: ['loan', 'bond', 'certificate'] },
  { pattern: /\bloan\s+amount\b/i, label: 'loan amount', weight: 100, categories: ['loan'] },
  { pattern: /\boriginal\s+(?:value|amount|principal)\b/i, label: 'original value', weight: 90, categories: ['certificate', 'bond', 'loan'] },

  // Deeds
  { pattern: /\bconsideration\b/i, label: 'consideration', weight: 95, categories: ['deed'] },
  { pattern: /\b(?:sale|purchase|selling)\s+price\b/i, label: 'sale price', weight: 95, categories: ['deed', 'receipt', 'invoice'] },

  // Letters of credit
  { pattern: /\bcredit\s+amount\b/i, label: 'credit amount', weight: 100, categories: ['letter_of_credit'] },

  // Tax assessments
  { pattern: /\bassessed\s+value\b/i, label: 'assessed value', weight: 100, categories: ['tax_assessment'] },
  { pattern: /\btaxable\s+value\b/i, label: 'taxable value', weight: 95, categories: ['tax_assessment'] },

  // Bank statements
  { pattern: /\bclosing\s+balance\b/i, label: 'closing balance', weight: 95, categories: ['bank_statement'] },
  { pattern: /\bavailable\s+balance\b/i, label: 'available balance', weight: 90, categories: ['bank_statement'] },

  // General financial
  { pattern: /\bnet\s+(?:asset\s+)?value\b/i, label: 'net value', weight: 90, categories: ['general_financial'] },

  // === TIER 2: Strong indicators (weight 70-89) ============================

  { pattern: /\bgrand\s+total\b/i, label: 'grand total', weight: 85, categories: ['invoice', 'receipt'] },
  { pattern: /\b(?:total|amount)\s+due\b/i, label: 'amount due', weight: 85, categories: ['invoice'] },
  { pattern: /\bbalance\s+due\b/i, label: 'balance due', weight: 85, categories: ['invoice', 'loan'] },
  { pattern: /\btotal\s+amount\b/i, label: 'total amount', weight: 80, categories: ['invoice', 'receipt', 'general_financial'] },
  { pattern: /\btotal\s+value\b/i, label: 'total value', weight: 80, categories: ['appraisal', 'general_financial'] },
  { pattern: /\bnet\s+(?:payable|amount)\b/i, label: 'net amount', weight: 75, categories: ['invoice', 'general_financial'] },
  { pattern: /\bamount\s+paid\b/i, label: 'amount paid', weight: 80, categories: ['receipt'] },
  { pattern: /\bvaluation\b/i, label: 'valuation', weight: 75, categories: ['appraisal', 'general_financial'] },

  // === TIER 3: Moderate indicators (weight 40-69) ==========================

  {
    // "total" but NOT "total pages", "total items", "total count", etc.
    pattern: /\btotal\b(?!\s+(?:pages?|items?|count|number|quantity|qty|units?|pieces?|lots?|transactions?|entries|records|rows?))/i,
    label: 'total',
    weight: 60,
    categories: ['invoice', 'receipt', 'general_financial'],
  },
  { pattern: /\bworth\b/i, label: 'worth', weight: 65, categories: ['appraisal', 'general_financial'] },
  { pattern: /\bprice\b/i, label: 'price', weight: 55, categories: ['deed', 'receipt', 'invoice'] },
  { pattern: /\bvalue\b/i, label: 'value', weight: 50, categories: ['appraisal', 'general_financial'] },
  { pattern: /\bamount\b/i, label: 'amount', weight: 45, categories: ['invoice', 'receipt', 'loan', 'general_financial'] },

  // Subtotal is intentionally low -- it is NOT the final value
  { pattern: /\bsubtotal\b/i, label: 'subtotal', weight: 40, categories: ['invoice', 'receipt'] },
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a document based on keyword frequency analysis of its full text.
 */
export function classifyDocument(fullText: string): DocumentClassification {
  let bestCategory: DocumentCategory = 'unknown';
  let bestScore = 0;
  let bestKeywords: string[] = [];

  for (const [category, patterns] of Object.entries(DOCUMENT_CLASSIFIERS)) {
    if (category === 'unknown') continue;

    let score = 0;
    const keywords: string[] = [];

    for (const pattern of patterns) {
      const globalPattern = new RegExp(pattern.source, 'gi');
      const matches = fullText.match(globalPattern);
      if (matches) {
        score += matches.length;
        keywords.push(matches[0]);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as DocumentCategory;
      bestKeywords = keywords;
    }
  }

  // At least 3 keyword hits = high confidence
  const confidence = bestScore === 0 ? 0 : Math.min(bestScore / 3, 1);

  return {
    category: bestCategory,
    confidence,
    matchedKeywords: bestKeywords,
  };
}

// ---------------------------------------------------------------------------
// Amount scoring
// ---------------------------------------------------------------------------

/**
 * Score each extracted amount based on contextual proximity to value-indicating
 * keywords.  Returns the amounts sorted by score (highest first).
 *
 * Scoring considers:
 *   - Same-line match: full indicator weight (+10 category bonus)
 *   - Adjacent line (+-1): 80% weight
 *   - Two lines away (+-2): 50% weight
 */
export function scoreAmounts(
  amounts: ReadonlyArray<{ amount: number; line: string; lineIndex: number }>,
  lines: ReadonlyArray<string>,
  classification: DocumentClassification,
): ScoredAmount[] {
  const scored: ScoredAmount[] = [];

  for (const { amount, line, lineIndex } of amounts) {
    let bestScore = 0;
    let bestIndicator = '';

    for (const indicator of VALUE_INDICATORS) {
      let score = 0;

      // Same line
      if (indicator.pattern.test(line)) {
        score = indicator.weight;
        if (indicator.categories.includes(classification.category)) {
          score += 10;
        }
      }

      // Adjacent lines (+-1)
      if (score === 0) {
        const prev = lineIndex > 0 ? lines[lineIndex - 1] : '';
        const next = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';

        if (indicator.pattern.test(prev) || indicator.pattern.test(next)) {
          score = Math.round(indicator.weight * 0.8);
          if (indicator.categories.includes(classification.category)) {
            score += 8;
          }
        }
      }

      // Two lines away (+-2) -- PDF layouts sometimes insert separator lines
      if (score === 0) {
        const prev2 = lineIndex > 1 ? lines[lineIndex - 2] : '';
        const next2 = lineIndex < lines.length - 2 ? lines[lineIndex + 2] : '';

        if (indicator.pattern.test(prev2) || indicator.pattern.test(next2)) {
          score = Math.round(indicator.weight * 0.5);
          if (indicator.categories.includes(classification.category)) {
            score += 5;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndicator = indicator.label;
      }
    }

    scored.push({
      amount,
      line,
      lineIndex,
      score: bestScore,
      matchedIndicator: bestIndicator,
      confidence: Math.min(bestScore / 100, 1),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// Primary value selection
// ---------------------------------------------------------------------------

/**
 * Select the primary stated value from a scored amount list.
 *
 * Strategy (multi-fallback):
 *   1. Clear winner with score >= 70 → use it
 *   2. Multiple high-confidence candidates → pick the largest positive amount
 *   3. Any moderate-confidence amount (score >= 40) → use it
 *   4. Last resort → largest positive amount (low confidence)
 */
export function selectPrimaryValue(
  scoredAmounts: ReadonlyArray<ScoredAmount>,
): PrimaryValueResult | null {
  if (scoredAmounts.length === 0) return null;

  // Strategy 1: Single clear high-confidence winner
  const highConfidence = scoredAmounts.filter((a) => a.score >= 70);
  if (highConfidence.length === 1) {
    return {
      value: highConfidence[0].amount,
      confidence: highConfidence[0].confidence,
      indicator: highConfidence[0].matchedIndicator,
      method: 'keyword_match',
    };
  }

  // Strategy 2: Multiple high-confidence -- prefer the largest positive amount
  if (highConfidence.length > 1) {
    const positive = highConfidence
      .filter((a) => a.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    if (positive.length > 0) {
      return {
        value: positive[0].amount,
        confidence: positive[0].confidence * 0.9,
        indicator: positive[0].matchedIndicator,
        method: 'keyword_match_largest',
      };
    }
  }

  // Strategy 3: Any scored amount >= 40
  const moderate = scoredAmounts.filter((a) => a.score >= 40 && a.amount > 0);
  if (moderate.length > 0) {
    return {
      value: moderate[0].amount,
      confidence: moderate[0].confidence * 0.8,
      indicator: moderate[0].matchedIndicator,
      method: 'moderate_confidence',
    };
  }

  // Strategy 4: Largest positive amount (no keyword match)
  const allPositive = [...scoredAmounts]
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (allPositive.length > 0) {
    return {
      value: allPositive[0].amount,
      confidence: 0.3,
      indicator: 'none (largest amount)',
      method: 'largest_amount_fallback',
    };
  }

  return null;
}
