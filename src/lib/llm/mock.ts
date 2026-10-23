import type { AnalyzeRequest, LLMProvider, RawAIFinding } from './types';

const PRESSURE = /\b(hurry|last chance|act now|today only|don['’]t miss out|ends tonight|while stocks last|limited time only)\b/gi;
const COMPETITOR = /\b(?:better than|unlike)\s+(?:starbucks|ccd|cafe coffee day|nescaf[eé]|blue tokai)\b/gi;

/**
 * Offline stand-in for a model so the app runs without any API key. It is a transparent keyword
 * heuristic (labelled "mock-offline" in every analysis) and goes through the same verification as a real model.
 */
export class MockProvider implements LLMProvider {
  name = 'mock-offline';
  model = 'heuristic-v1';

  async analyze(req: AnalyzeRequest): Promise<RawAIFinding[]> {
    const out: RawAIFinding[] = [];
    const rule = (tag: string) => req.rules.find((r) => r.tags.includes(tag));
    const pressure = rule('pressure');
    if (pressure) {
      for (const m of req.text.matchAll(PRESSURE)) {
        out.push({ ruleId: pressure.id, quote: m[0], explanation: 'Urgency language pressures the reader; the brand voice is warm, never pushy.', suggestion: 'Say what the offer is and when it ends, without pressure.', confidence: 0.8 });
      }
    }
    const rival = rule('competitor');
    if (rival) {
      for (const m of req.text.matchAll(COMPETITOR)) {
        out.push({ ruleId: rival.id, quote: m[0], explanation: 'Naming a competitor to run them down is off-brand.', suggestion: 'Describe what makes our coffee good instead.', confidence: 0.75 });
      }
    }
    return out;
  }
}
