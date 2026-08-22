/**
 * Écriture de CSV — §4.7 et §6.
 *
 * Le format vise un tableur en configuration française, comme le demande le
 * cahier des charges. Ces tests verrouillent les trois points qui font qu'un
 * export s'ouvre correctement ou pas du tout.
 */

import { describe, expect, it } from 'vitest'
import { csvDate, toCsv } from '@/lib/csv'

const colonnes = [
  { header: 'Nom', value: (row: Record<string, unknown>) => row.nom as string },
  { header: 'Valeur', value: (row: Record<string, unknown>) => row.valeur as number },
]

describe('format attendu par un tableur français', () => {
  it('sépare les colonnes par des points-virgules', () => {
    const csv = toCsv([{ nom: 'Adrien', valeur: 3 }], colonnes)
    expect(csv).toContain('Nom;Valeur')
    expect(csv).toContain('Adrien;3')
  })

  /** Sans cette marque, Excel affiche tous les accents en charabia. */
  it('commence par la marque d’ordre des octets', () => {
    expect(toCsv([], colonnes).charCodeAt(0)).toBe(0xfeff)
  })

  it('écrit les décimales à la virgule', () => {
    expect(toCsv([{ nom: 'A', valeur: 62.5 }], colonnes)).toContain('A;62,50')
  })

  it('laisse les entiers sans décimale', () => {
    expect(toCsv([{ nom: 'A', valeur: 60 }], colonnes)).toContain('A;60')
  })

  it('termine les lignes en CRLF', () => {
    expect(toCsv([{ nom: 'A', valeur: 1 }], colonnes)).toContain('\r\n')
  })
})

describe('échappement', () => {
  it('entoure de guillemets un champ contenant le séparateur', () => {
    expect(toCsv([{ nom: 'Dupont; Jean', valeur: 1 }], colonnes)).toContain('"Dupont; Jean";1')
  })

  it('double les guillemets internes', () => {
    expect(toCsv([{ nom: 'Le "Roi"', valeur: 1 }], colonnes)).toContain('"Le ""Roi""";1')
  })

  it('entoure un champ contenant un saut de ligne', () => {
    expect(toCsv([{ nom: 'a\nb', valeur: 1 }], colonnes)).toContain('"a\nb";1')
  })

  it('écrit une cellule vide pour une valeur absente', () => {
    const csv = toCsv([{ nom: null, valeur: undefined }], colonnes)
    expect(csv.split('\r\n')[1]).toBe(';')
  })

  it('écrit une cellule vide pour un nombre non fini', () => {
    expect(toCsv([{ nom: 'A', valeur: Number.NaN }], colonnes).split('\r\n')[1]).toBe('A;')
  })

  it('conserve les accents', () => {
    expect(toCsv([{ nom: 'Fléchettes réussies', valeur: 1 }], colonnes)).toContain(
      'Fléchettes réussies',
    )
  })
})

describe('dates', () => {
  it('écrit une date lisible et triable', () => {
    const date = new Date(2026, 7, 22, 9, 5)
    expect(csvDate(date.getTime())).toBe('22/08/2026 09:05')
  })
})

describe('en-têtes seuls', () => {
  it('produit un fichier valide sans aucune ligne', () => {
    const csv = toCsv([], colonnes)
    expect(csv.replace('﻿', '')).toBe('Nom;Valeur\r\n')
  })
})
