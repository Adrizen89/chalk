import 'fake-indexeddb/auto'

// `crypto.randomUUID` existe dans Node 20, mais pas dans tous les contextes.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

/**
 * `localStorage` n'existe pas dans Node. Un substitut minimal suffit : on ne
 * teste ici que la migration du carnet écrit avant #18, pas le stockage du
 * navigateur lui-même.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    } satisfies Storage,
  })
}
