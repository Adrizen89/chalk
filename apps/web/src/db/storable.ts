/**
 * Normalisation des données écrites en base.
 *
 * IndexedDB repose sur `structuredClone`, qui **ne sait pas cloner un Proxy**.
 * Or toute donnée passée par un `ref()` de Vue en est un. L'écriture échoue
 * alors avec un `DataCloneError` — souvent sans conséquence visible immédiate,
 * puisque l'état en mémoire, lui, est correct. Le problème n'apparaît qu'au
 * rechargement suivant, quand la donnée a disparu.
 *
 * Le piège s'est présenté deux fois : à la reprise d'une partie (#31), puis aux
 * configurations favorites (§4.9). Deux fois au même endroit conceptuel — la
 * frontière entre le monde réactif et le stockage. La garde vit donc ici, une
 * seule fois, plutôt qu'à chaque appelant.
 *
 * L'aller-retour JSON est sans perte pour ce qu'on stocke : §3.4 exige déjà la
 * sérialisabilité des instantanés, et un test du moteur le vérifie.
 */
export function toStorable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
