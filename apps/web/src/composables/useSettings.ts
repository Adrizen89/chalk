/**
 * Réglages — §4.9.
 *
 * « Thème clair / sombre (le mode sombre par défaut est recommandé), choix de
 *   la taille d'affichage des scores, configurations favorites, sons et
 *   vibrations activables. »
 *
 * Les réglages vivent en IndexedDB, mais le thème et la taille des scores sont
 * **aussi** écrits en `localStorage`. IndexedDB est asynchrone : sans copie
 * synchrone, l'application s'afficherait une fraction de seconde dans le thème
 * par défaut avant de basculer. Un flash blanc au démarrage d'une application
 * censée être sombre est exactement ce que §3.2 cherche à éviter.
 */

import { readonly, ref } from 'vue'
import { getSetting, setSetting } from '@/db'

export type ThemePreference = 'dark' | 'light' | 'system'
export type ScoreSize = 'compact' | 'normal' | 'large'

const THEME_KEY = 'theme'
const SCORE_SIZE_KEY = 'scoreSize'
const SOUND_KEY = 'soundEnabled'
const VIBRATION_KEY = 'vibrationEnabled'

/** Miroir synchrone, lu avant le premier rendu. */
const MIRROR_PREFIX = 'chalk.settings.'

function readMirror<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(MIRROR_PREFIX + key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

function readMirrorBoolean(key: string, fallback: boolean): boolean {
  const raw = readMirror(key, '')
  return raw === '' ? fallback : raw === 'true'
}

function writeMirror(key: string, value: string) {
  try {
    localStorage.setItem(MIRROR_PREFIX + key, value)
  } catch {
    // Navigation privée : le réglage vaudra pour la session.
  }
}

const theme = ref<ThemePreference>(readMirror<ThemePreference>(THEME_KEY, 'dark'))
const scoreSize = ref<ScoreSize>(readMirror<ScoreSize>(SCORE_SIZE_KEY, 'normal'))
const soundEnabled = ref(readMirrorBoolean(SOUND_KEY, false))
const vibrationEnabled = ref(readMirrorBoolean(VIBRATION_KEY, false))

let loaded = false

/** Thème effectivement appliqué, une fois « suivre le système » résolu. */
function resolveTheme(preference: ThemePreference): 'dark' | 'light' {
  if (preference !== 'system') return preference
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Applique le thème et la taille au document.
 *
 * Appelé avant le montage de l'application : c'est ce qui évite le flash.
 */
export function applyAppearance() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = resolveTheme(theme.value)
  root.dataset.scoreSize = scoreSize.value

  // La couleur de la barre système doit suivre le thème (§3.2).
  const meta = document.querySelector('meta[name="theme-color"]')
  const background = getComputedStyle(root).getPropertyValue('--color-slate-board').trim()
  if (meta && background) meta.setAttribute('content', background)
}

export function useSettings() {
  /** Recharge depuis IndexedDB, source de vérité. */
  async function load() {
    if (loaded) return
    try {
      theme.value = await getSetting<ThemePreference>(THEME_KEY, theme.value)
      scoreSize.value = await getSetting<ScoreSize>(SCORE_SIZE_KEY, scoreSize.value)
      soundEnabled.value = await getSetting<boolean>(SOUND_KEY, soundEnabled.value)
      vibrationEnabled.value = await getSetting<boolean>(VIBRATION_KEY, vibrationEnabled.value)
      applyAppearance()
    } catch (error) {
      // §2 : un réglage illisible ne doit jamais empêcher de jouer.
      console.error('Chargement des réglages impossible', error)
    } finally {
      loaded = true
    }
  }

  async function setTheme(value: ThemePreference) {
    theme.value = value
    writeMirror(THEME_KEY, value)
    applyAppearance()
    await setSetting(THEME_KEY, value)
  }

  async function setScoreSize(value: ScoreSize) {
    scoreSize.value = value
    writeMirror(SCORE_SIZE_KEY, value)
    applyAppearance()
    await setSetting(SCORE_SIZE_KEY, value)
  }

  async function setSoundEnabled(value: boolean) {
    soundEnabled.value = value
    writeMirror(SOUND_KEY, String(value))
    await setSetting(SOUND_KEY, value)
  }

  async function setVibrationEnabled(value: boolean) {
    vibrationEnabled.value = value
    writeMirror(VIBRATION_KEY, String(value))
    await setSetting(VIBRATION_KEY, value)
  }

  return {
    theme: readonly(theme),
    scoreSize: readonly(scoreSize),
    soundEnabled: readonly(soundEnabled),
    vibrationEnabled: readonly(vibrationEnabled),
    load,
    setTheme,
    setScoreSize,
    setSoundEnabled,
    setVibrationEnabled,
  }
}
