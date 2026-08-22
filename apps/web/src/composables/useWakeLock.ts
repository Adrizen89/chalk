/**
 * Empêche la mise en veille de l'écran — §5, #16.
 *
 * Une partie de 501 laisse plusieurs minutes entre deux volées du même joueur.
 * Sans verrou, l'écran s'éteint et il faut le réveiller à chaque tour, en
 * tenant ses fléchettes de l'autre main.
 *
 * L'API n'existe pas partout — Safari iOS ne l'a implémentée qu'à partir de
 * 16.4. Le repli est le comportement par défaut du navigateur, assumé et
 * documenté : pas de contournement par une vidéo en boucle, qui consomme de la
 * batterie et casse au premier changement de politique du navigateur.
 */

import { onScopeDispose, readonly, ref } from 'vue'

const SETTING_KEY = 'chalk.wakeLock.enabled'

export const isWakeLockSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

function loadPreference(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'false'
  } catch {
    return true
  }
}

export function useWakeLock() {
  const enabled = ref(loadPreference())
  const active = ref(false)
  let sentinel: WakeLockSentinel | null = null

  async function request() {
    if (!enabled.value || !isWakeLockSupported() || sentinel) return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      active.value = true
      sentinel.addEventListener('release', () => {
        active.value = false
        sentinel = null
      })
    } catch {
      // Refus du système, batterie faible, onglet en arrière-plan : on continue
      // sans verrou plutôt que de faire échouer l'entrée en partie.
      active.value = false
    }
  }

  async function release() {
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // Déjà relâché par le système.
    }
    sentinel = null
    active.value = false
  }

  /**
   * Le système relâche le verrou dès que l'onglet passe en arrière-plan. Il
   * faut le redemander au retour, sinon l'écran se rendort au milieu de la
   * partie suivante.
   */
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void request()
  }

  function setEnabled(value: boolean) {
    enabled.value = value
    try {
      localStorage.setItem(SETTING_KEY, String(value))
    } catch {
      // Sans persistance, le réglage vaut pour la session.
    }
    if (value) void request()
    else void release()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })

  return {
    supported: isWakeLockSupported(),
    enabled: readonly(enabled),
    active: readonly(active),
    request,
    release,
    setEnabled,
  }
}
