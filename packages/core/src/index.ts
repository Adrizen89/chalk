/**
 * @chalk/core — moteur de règles Chalk.
 *
 * Paquet **pur** : aucune dépendance UI, réseau ou stockage (§4.2). Il tourne
 * dans le navigateur hors ligne (§3.1) comme côté serveur, où il servira à
 * revalider les parties reçues du multi-appareil (§3.3).
 */

export * from './dart.js'
export * from './rule.js'
export * from './session.js'
export * from './checkout.js'
export * from './games/x01.js'
