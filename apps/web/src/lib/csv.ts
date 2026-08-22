/**
 * Écriture de CSV — §4.7 et §6.
 *
 * Le §4.7 demande un export CSV ; le §6 exige, au titre du RGPD, l'export de
 * l'intégralité des données personnelles. Un seul mécanisme sert les deux.
 *
 * Le format vise **un tableur en configuration française**, comme le demande
 * le cahier des charges : séparateur point-virgule, décimales à la virgule, et
 * marque d'ordre des octets en tête pour qu'Excel reconnaisse l'UTF-8. Sans
 * ce dernier point, tous les accents arrivent en charabia.
 */

export interface CsvColumn<T> {
  readonly header: string
  readonly value: (row: T) => string | number | null | undefined
}

const SEPARATOR = ';'
/**
 * Excel n'identifie l'UTF-8 que si le fichier commence par cette marque.
 *
 * Écrite en échappement plutôt qu'en caractère littéral : un caractère
 * invisible en tête de chaîne se perd au premier outil qui normalise le
 * fichier, et l'export part alors en charabia sans que rien ne le signale.
 */
const BOM = '\uFEFF'

function formatCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    // Décimale à la virgule : c'est ce qu'attend un tableur français.
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',')
  }

  // Un champ contenant le séparateur, un guillemet ou un saut de ligne doit
  // être entouré de guillemets, les guillemets internes étant doublés.
  if (/[";\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => formatCell(column.header)).join(SEPARATOR)]
  for (const row of rows) {
    lines.push(columns.map((column) => formatCell(column.value(row))).join(SEPARATOR))
  }
  // Fins de ligne Windows : c'est ce qu'attendent les tableurs.
  return BOM + lines.join('\r\n') + '\r\n'
}

/** Date lisible par un tableur français, et triable. */
export function csvDate(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * Déclenche le téléchargement d'un fichier.
 *
 * L'URL objet est révoquée juste après : sans cela, le contenu reste en
 * mémoire pour toute la durée de vie de l'onglet, ce qui compte quand on
 * exporte tout un historique.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Un délai court laisse le navigateur démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
