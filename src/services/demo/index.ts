import type { ActionContext } from '../../shared/transitions.ts';
import type { AiService } from '../ai';
import { demoAssistant } from './assistant';
import { sampleReceipt } from './receipt';
import { demoRecipes } from './recipes';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Offline stand-ins used by the preview and before anyone signs in. */
export function demoAi(ctx: () => ActionContext): AiService {
  return {
    kind: 'demo',
    async readReceipt() {
      await sleep(1800);
      return { ...sampleReceipt(), demo: true };
    },
    async suggestRecipes(req) {
      await sleep(600);
      return demoRecipes(req);
    },
    async ask(req) {
      await sleep(350);
      const text = req.text ?? '';
      return { transcript: text, ...demoAssistant(text, req.items, req.lang, ctx()) };
    },
  };
}
