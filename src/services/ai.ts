import type { Change } from '../shared/transitions.ts';
import type { Item, Lang, ReceiptParse, Recipe } from '../shared/types.ts';

export interface ReceiptImage {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface RecipeRequest {
  items: Item[];
  staples: string[];
  diet: string;
  lang: Lang;
  /** Recipe titles already shown, so new ideas differ. */
  exclude: string[];
}

export interface Audio {
  uri: string;
  mimeType: string;
}

export interface AssistantRequest {
  audio?: Audio;
  text?: string;
  lang: Lang;
  history: { role: 'user' | 'assistant'; text: string }[];
  items: Item[];
}

export interface AssistantReply {
  transcript: string;
  reply: string;
  lang: Lang;
  /** Spoken reply; when absent the app speaks the text itself (demo mode). */
  audio?: { base64: string; mimeType: string };
  /** Fridge changes the assistant made, already saved by the server in cloud mode. */
  change?: Change;
  saved?: boolean;
  actions: string[];
}

export interface AiService {
  kind: 'cloud' | 'demo';
  readReceipt(image: ReceiptImage, lang: Lang): Promise<ReceiptParse & { demo?: boolean }>;
  suggestRecipes(req: RecipeRequest): Promise<Recipe[]>;
  ask(req: AssistantRequest): Promise<AssistantReply>;
}
