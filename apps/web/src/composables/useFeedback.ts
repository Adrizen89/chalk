/**
 * Sons et vibrations — §4.9.
 *
 * « Sons et vibrations activables (annonce des 180, fin de leg). »
 *
 * Les sons sont **synthétisés**, pas chargés depuis des fichiers : trois
 * bips ne valent pas quelques dizaines de kilo-octets à télécharger et à
 * mettre en cache, alors que §6 borne le chargement à 3 s en 4G.
 *
 * Les navigateurs exigent une interaction utilisateur avant de produire du
 * son. Ce n'est pas une contrainte ici : le premier son suit toujours une
 * saisie.
 */

import type { GameEffect } from '@chalk/core'
import { useSettings } from './useSettings'

type Tone = { readonly frequency: number; readonly durationMs: number }

/** Fanfare courte pour un 180, note simple pour le reste. */
const PATTERNS: Record<string, Tone[]> = {
  '180': [
    { frequency: 660, durationMs: 90 },
    { frequency: 880, durationMs: 90 },
    { frequency: 1320, durationMs: 180 },
  ],
  leg: [
    { frequency: 520, durationMs: 110 },
    { frequency: 780, durationMs: 200 },
  ],
  set: [
    { frequency: 520, durationMs: 100 },
    { frequency: 780, durationMs: 100 },
    { frequency: 1040, durationMs: 240 },
  ],
  bust: [{ frequency: 180, durationMs: 220 }],
}

const VIBRATIONS: Record<string, number | number[]> = {
  '180': [60, 50, 60, 50, 140],
  leg: [80, 60, 160],
  set: [80, 60, 80, 60, 200],
  bust: 220,
}

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context ??= new Ctor()
  return context
}

function playTones(tones: readonly Tone[]) {
  const ctx = audioContext()
  if (!ctx) return
  // Le contexte peut être suspendu tant qu'aucune interaction n'a eu lieu.
  if (ctx.state === 'suspended') void ctx.resume()

  let at = ctx.currentTime
  for (const tone of tones) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.value = tone.frequency

    const duration = tone.durationMs / 1000
    // Enveloppe courte : un bip carré sans attaque ni chute claque désagréablement.
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.18, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(at)
    oscillator.stop(at + duration)
    at += duration
  }
}

export function useFeedback() {
  const { soundEnabled, vibrationEnabled } = useSettings()

  function signal(kind: keyof typeof PATTERNS) {
    if (soundEnabled.value) {
      try {
        playTones(PATTERNS[kind] ?? [])
      } catch {
        // Politique audio du navigateur : on continue sans son.
      }
    }
    if (vibrationEnabled.value && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(VIBRATIONS[kind] ?? 100)
      } catch {
        // Non supporté : sans conséquence.
      }
    }
  }

  /**
   * §4.9 — les moments à souligner : le 180, la fin de leg, la fin de set.
   *
   * Le bust est signalé aussi : c'est l'information qu'on rate le plus
   * facilement quand on regarde la cible et non l'écran.
   */
  function onEffects(effects: readonly GameEffect[]) {
    const types = new Set(effects.map((effect) => effect.type))
    if (types.has('set-won')) return signal('set')
    if (types.has('leg-won')) return signal('leg')
    for (const effect of effects) {
      if (effect.type === 'milestone' && effect.label === '180') return signal('180')
    }
    if (types.has('bust')) return signal('bust')
  }

  /** Aperçu depuis les réglages, pour vérifier le volume avant de jouer. */
  function preview() {
    signal('180')
  }

  return { signal, onEffects, preview }
}
