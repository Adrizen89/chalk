/**
 * Invitation à l'installation — §3.2, #14.
 *
 * Chalk ne sera ni sur l'App Store ni sur le Play Store. C'est un choix assumé
 * — pas de commission, pas de validation d'Apple, mises à jour instantanées —
 * mais il implique que l'installation passe par un lien partagé. Sans
 * invitation explicite, la plupart des utilisateurs resteront dans un onglet de
 * navigateur et perdront le hors-ligne, le plein écran et les notifications.
 *
 * Deux plateformes, deux mécaniques :
 *  - Android / Chrome expose `beforeinstallprompt`, qu'on intercepte pour
 *    déclencher le prompt natif au moment choisi ;
 *  - iOS Safari n'a pas d'API du tout. Il faut expliquer la manipulation
 *    « Partager → Sur l'écran d'accueil ».
 */

import { computed, onMounted, readonly, ref } from 'vue'

/** Le prompt d'installation de Chrome, pas encore dans les types du DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'chalk.install.dismissedAt'
/** Un refus vaut deux semaines de tranquillité. */
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const dismissed = ref(false)
let listening = false

/** L'application tourne-t-elle déjà installée, hors du navigateur ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS, qui n'implémente pas display-mode.
    ('standalone' in window.navigator && window.navigator.standalone === true)
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // Les iPad récents s'annoncent comme des Mac : on les distingue au tactile.
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOs
}

/** iOS n'autorise l'ajout à l'écran d'accueil que depuis Safari. */
export function isIosSafari(): boolean {
  if (!isIos()) return false
  const ua = navigator.userAgent
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    return Date.now() - Number(raw) < DISMISS_DURATION_MS
  } catch {
    return false
  }
}

export function usePwaInstall() {
  onMounted(() => {
    dismissed.value = wasRecentlyDismissed()
    if (listening) return
    listening = true

    window.addEventListener('beforeinstallprompt', (event) => {
      // On empêche la mini-barre par défaut de Chrome pour choisir nous-mêmes
      // le moment — jamais pendant une partie (§5).
      event.preventDefault()
      deferredPrompt.value = event as BeforeInstallPromptEvent
    })

    window.addEventListener('appinstalled', () => {
      deferredPrompt.value = null
    })
  })

  const installed = computed(() => isStandalone())

  /** Android / Chrome : le prompt natif est disponible. */
  const canPromptNatively = computed(() => deferredPrompt.value !== null && !installed.value)

  /** iOS Safari : pas d'API, on explique la manipulation. */
  const needsIosInstructions = computed(() => isIosSafari() && !installed.value)

  /** L'invitation doit-elle s'afficher ? */
  const shouldOffer = computed(
    () =>
      !installed.value &&
      !dismissed.value &&
      (canPromptNatively.value || needsIosInstructions.value),
  )

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = deferredPrompt.value
    if (!event) return 'unavailable'
    await event.prompt()
    const { outcome } = await event.userChoice
    // Le prompt n'est utilisable qu'une fois.
    deferredPrompt.value = null
    if (outcome === 'dismissed') dismiss()
    return outcome
  }

  function dismiss() {
    dismissed.value = true
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Navigation privée : le refus ne vaudra que pour cette session.
    }
  }

  /** Ré-ouvre l'invitation depuis les réglages, même après un refus. */
  function offerAgain() {
    dismissed.value = false
  }

  return {
    installed,
    shouldOffer,
    canPromptNatively,
    needsIosInstructions,
    dismissed: readonly(dismissed),
    promptInstall,
    dismiss,
    offerAgain,
  }
}
