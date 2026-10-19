import OpenAI from 'npm:openai@7.28.0';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.11/base64';

import type { Lang } from '../_shared/types.ts';

const openaiKey = Deno.env.get('OPENAI_API_KEY');
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

/** Speech to text. Hints both languages and the names of what's in the fridge. */
export async function transcribe(audio: File, keywords: string[]): Promise<string> {
  if (!openai) throw new Error('OPENAI_API_KEY is not set');
  try {
    const res = await openai.audio.transcriptions.create({
      file: audio,
      model: Deno.env.get('TRANSCRIBE_MODEL') ?? 'gpt-transcribe',
      languages: ['bg', 'en'],
      keywords: keywords.slice(0, 60),
    });
    return res.text.trim();
  } catch (e) {
    // Older accounts may not have the newest model yet.
    console.warn('gpt-transcribe failed, falling back', e);
    const res = await openai.audio.transcriptions.create({ file: audio, model: 'gpt-4o-transcribe' });
    return res.text.trim();
  }
}

export interface Speech {
  base64: string;
  mimeType: string;
}

/** Text to speech: ElevenLabs when configured (best Bulgarian), otherwise OpenAI. */
export async function synthesize(text: string, lang: Lang): Promise<Speech | undefined> {
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (elevenKey) {
    try {
      const voice = Deno.env.get('ELEVENLABS_VOICE_ID') ?? 'JBFqnCBsd6RMkjVDRZzb';
      const model = Deno.env.get('ELEVENLABS_MODEL') ?? 'eleven_flash_v2_5';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          // Multilingual v2 rejects a language code; the v2.5 models use it to pick Bulgarian vs English.
          ...(model.includes('multilingual_v2') ? {} : { language_code: lang }),
        }),
      });
      if (res.ok) return { base64: encodeBase64(new Uint8Array(await res.arrayBuffer())), mimeType: 'audio/mpeg' };
      console.warn('ElevenLabs failed', res.status, await res.text());
    } catch (e) {
      console.warn('ElevenLabs failed', e);
    }
  }
  if (openai) {
    try {
      const res = await openai.audio.speech.create({
        model: Deno.env.get('OPENAI_TTS_MODEL') ?? 'gpt-4o-mini-tts',
        voice: Deno.env.get('OPENAI_VOICE') ?? 'coral',
        input: text,
        response_format: 'mp3',
        instructions: lang === 'bg' ? 'Speak natural, friendly Bulgarian at a relaxed pace.' : 'Speak in a friendly, relaxed way.',
      });
      return { base64: encodeBase64(new Uint8Array(await res.arrayBuffer())), mimeType: 'audio/mpeg' };
    } catch (e) {
      console.warn('OpenAI speech failed', e);
    }
  }
  return undefined;
}
