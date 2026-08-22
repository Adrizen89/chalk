# ADR 0001 — Stack technique

- **Statut** : proposé
- **Date** : 2026-08-22
- **Issue** : [#1](https://github.com/Adrizen89/chalk/issues/1)
- **Réf. CDC** : §3.4, §9.1

## Contexte

Le cahier des charges propose une stack sans l'imposer : « Ce sont des suggestions,
pas des exigences — le développeur reste libre s'il propose mieux » (§3.4).

Trois contraintes pèsent plus que les autres sur ce choix :

1. **Le mode local doit être pleinement fonctionnel hors ligne** (§3.1, §6). Ce
   n'est pas un confort : « les salles de fléchettes ont souvent une mauvaise
   couverture réseau ».
2. **Chargement initial < 3 s en 4G, saisie < 100 ms** (§6).
3. **L'installation sur téléphone est une exigence prioritaire** (§3.2) — la
   qualité du service worker n'est pas un détail d'implémentation.

## Décision

| Brique           | Choix                                      | Raison                                                                                                                                                                  |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front            | **Vue 3 + TypeScript**                     | Stack courante du propriétaire du projet (fixtura, PouleUp, adb_digital, lemcoaching, ToucyPinte). La maintenabilité à long terme prime sur un gain de bundle marginal. |
| Build            | **Vite 7**                                 | Déjà en place sur tous les projets récents ; `vite-plugin-pwa` (Workbox) est l'outillage service worker le plus abouti de l'écosystème.                                 |
| Styles           | **Tailwind 4**                             | Idem — et les contraintes du §5 (cibles ≥ 48 px, échelle typographique « score ») s'encodent bien en tokens.                                                            |
| Moteur de règles | **paquet TypeScript pur, sans dépendance** | Voir ADR 0002.                                                                                                                                                          |
| Stockage local   | **IndexedDB via Dexie**                    | §3.4. Dexie apporte les migrations versionnées, exigées par la reprise de partie (§4.4).                                                                                |
| Tests            | **Vitest**                                 | Même moteur que Vite, pas de configuration parallèle à maintenir.                                                                                                       |
| Monorepo         | **pnpm workspaces**                        | Sépare le moteur pur de l'application, et permet de le réutiliser côté serveur.                                                                                         |

### Back (lot 2, à confirmer)

Orientation, non tranchée tant que le spike temps réel ([#3](https://github.com/Adrizen89/chalk/issues/3)) n'a pas rendu ses mesures :

- **AdonisJS 7 + Lucid + PostgreSQL** — stack déjà en production sur fixtura.
- **AdonisJS Transmit** (SSE) pour le multi-appareil, plutôt que Supabase Realtime
  ou Firebase : pas de lock-in, hébergement UE trivial (§6 RGPD), et le moteur de
  règles pur peut être rejoué côté serveur pour valider les parties reçues (§3.3).

Le §9.3 désigne le temps réel comme « le poste le plus coûteux du projet ». Cette
décision reste donc ouverte jusqu'aux chiffres.

## Conséquences

**Positives**

- Le propriétaire du projet peut reprendre et faire évoluer le code sans changer d'écosystème.
- Le moteur pur est testable, rejouable côté serveur et utilisable hors ligne (§3.1).
- Découpage du bundle possible : entraînement, tournois et table du coach hors chargement initial.

**Négatives / à surveiller**

- Vue 3 produit un bundle un peu plus gros que Svelte. Le budget de performance
  ([#71](https://github.com/Adrizen89/chalk/issues/71)) doit être mesuré en CI dès maintenant,
  pas vérifié à la livraison.
- `vite-plugin-pwa` masque Workbox : le cycle de vie du service worker en production
  ([#77](https://github.com/Adrizen89/chalk/issues/77)) devra être compris, pas subi.
- Le choix du back reste ouvert : ne rien coder qui présuppose l'un ou l'autre.
