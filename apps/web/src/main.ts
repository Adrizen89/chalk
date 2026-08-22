import { createApp } from 'vue'
import App from './App.vue'
import { applyAppearance } from './composables/useSettings'
import './style.css'

/*
 * §4.9 — le thème et la taille des scores sont appliqués **avant** le montage.
 * Lus depuis un miroir synchrone en localStorage, ils évitent le flash de
 * thème par défaut qu'un chargement IndexedDB asynchrone provoquerait.
 */
applyAppearance()

createApp(App).mount('#app')
