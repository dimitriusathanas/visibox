// Browser speech helpers for the offline preview, and playback of the
// assistant's spoken replies on every platform.

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import type { Lang } from '../shared/types.ts';

const speechLang = (lang: Lang) => (lang === 'bg' ? 'bg-BG' : 'en-US');

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const browserCanTranscribe = () => recognitionCtor() !== null;

/** Push-to-talk with the browser's own recognizer: start on press, stop on release. */
export function startBrowserTranscription(lang: Lang, onPartial: (text: string) => void) {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = speechLang(lang);
  rec.interimResults = true;
  rec.continuous = true;
  let text = '';
  let failure: string | null = null;
  let done: (() => void) | null = null;
  rec.onresult = (e) => {
    text = Array.from(e.results)
      .map((r) => r[0]?.transcript ?? '')
      .join(' ')
      .trim();
    onPartial(text);
  };
  rec.onerror = (e) => {
    failure = e.error;
  };
  rec.onend = () => done?.();
  rec.start();
  return {
    /** Resolves with the transcript, or rejects with the browser's error code. */
    stop(): Promise<string> {
      return new Promise((resolve, reject) => {
        done = () => (failure && !text ? reject(new Error(failure)) : resolve(text));
        try {
          rec.stop();
        } catch {
          done();
        }
        setTimeout(() => done?.(), 1500);
      });
    },
    cancel: () => { try { rec.abort(); } catch { /* Already stopped. */ } },
  };
}

let current: { stop: () => void } | null = null;
let playbackSequence = 0;

export function stopSpeaking() {
  playbackSequence++;
  current?.stop();
  current = null;
}

/** Plays the assistant's reply: server audio when present, otherwise the browser's voice. */
export function speak(text: string, lang: Lang, audio?: { base64: string; mimeType: string }, onEnd?: () => void) {
  stopSpeaking();
  const sequence = playbackSequence;
  const finish = () => { if (sequence === playbackSequence) onEnd?.(); };
  if (audio) {
    const uri = `data:${audio.mimeType};base64,${audio.base64}`;
    if (Platform.OS === 'web') {
      const el = new window.Audio(uri);
      el.onended = finish;
      el.onerror = finish;
      void el.play().catch(finish);
      current = { stop: () => el.pause() };
      return;
    }
    let player: AudioPlayer | null = createAudioPlayer({ uri });
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        sub.remove();
        player?.remove();
        player = null;
        finish();
      }
    });
    player.play();
    current = {
      stop: () => {
        sub.remove();
        player?.remove();
        player = null;
      },
    };
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang(lang);
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(lang));
    if (voice) u.voice = voice;
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    current = { stop: () => window.speechSynthesis.cancel() };
    return;
  }
  finish();
}
