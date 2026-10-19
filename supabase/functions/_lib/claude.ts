import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';

import { HttpError } from './http.ts';

// Reads ANTHROPIC_API_KEY from the function's secrets.
export const anthropic = new Anthropic();

/** Claude Opus 5.5 everywhere by default; each job can be switched with a secret. */
export const MODEL = {
  receipt: Deno.env.get('RECEIPT_MODEL') ?? 'claude-opus-5-5',
  recipes: Deno.env.get('RECIPES_MODEL') ?? 'claude-opus-5-5',
  assistant: Deno.env.get('ASSISTANT_MODEL') ?? 'claude-opus-5-5',
};

/**
 * If a safety classifier declines a request, the API re-runs it on the model
 * Anthropic recommends for that case instead of returning a refusal.
 * (Not used for Haiku models, which have no server-side fallback.)
 */
export function fallbackFor(model: string) {
  return model.includes('haiku')
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'] as Anthropic.Beta.AnthropicBeta[], fallbacks: 'default' as const };
}

export function assertAnswered(message: { stop_reason: string | null }) {
  if (message.stop_reason === 'refusal') throw new HttpError(422, 'The request was declined');
  if (message.stop_reason === 'max_tokens') throw new HttpError(502, 'The answer was cut off; try again');
}
