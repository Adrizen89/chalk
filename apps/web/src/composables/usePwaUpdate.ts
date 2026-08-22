/**
 * Mise à jour de l'application — §3.2 et §5.
 *
 * Le service worker est enregistré en mode « prompt » : une nouvelle version
 * ne s'applique jamais toute seule. C'est une exigence directe du §5 —
 * « aucune fenêtre modale pendant une partie en cours » — et du bon sens :
 * recharger la page au milieu d'un leg ferait perdre la partie.
 *
 * L'application n'étant sur aucun store, c'est ce mécanisme qui remplace les
 * mises à jour du Play Store et de l'App Store.
 */

import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export function usePwaUpdate() {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.error('Enregistrement du service worker impossible', error)
    },
  })

  const applying = ref(false)

  async function applyUpdate() {
    applying.value = true
    await updateServiceWorker(true)
  }

  function postpone() {
    needRefresh.value = false
  }

  return { needRefresh, offlineReady, applying, applyUpdate, postpone }
}
