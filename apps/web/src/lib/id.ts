/**
 * Génération d'identifiants.
 *
 * `crypto.randomUUID()` n'existe **que** dans un contexte sécurisé : HTTPS ou
 * `localhost`. Sur `http://192.168.x.x`, c'est-à-dire dès qu'on ouvre
 * l'application depuis un téléphone du réseau local pour la tester en
 * conditions réelles (#78), l'appel échoue et il devient impossible d'ajouter
 * un joueur ou de lancer une partie.
 *
 * Le repli n'a pas besoin d'être cryptographique : ces identifiants ne servent
 * qu'à distinguer des lignes en base locale. `crypto.getRandomValues` reste
 * disponible hors contexte sécurisé et suffit largement.
 */

export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    // Marque la version 4 et la variante, comme un UUID normal.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // Dernier recours : jamais atteint dans un navigateur, mais une partie ne
  // doit pas être impossible à lancer à cause d'un identifiant (§2).
  return `id-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
