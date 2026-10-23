import type { Severity } from '../types';

export interface RawAIFinding { ruleId: string; quote: string; explanation: string; suggestion?: string; confidence?: number }

export interface AnalyzeRequest {
  text: string;
  rules: { id: string; title: string; severity: Severity; guidance: string; brandGuideQuote: string; tags: string[] }[];
  facts: { id: string; statement: string }[];
}

/** The single seam between BrandProof and any model vendor. */
export interface LLMProvider {
  name: string;
  model: string;
  analyze(req: AnalyzeRequest): Promise<RawAIFinding[]>;
}
