/**
 * La traduction : des clefs, et une table par langue.
 *
 * ## Pourquoi une clef et non le texte d'origine
 *
 * On serait tente d'indexer par le francais : « Reprendre » vers « Continue ».
 * C'est ce que font beaucoup de jeux, et cela casse au premier ajustement —
 * corriger une virgule dans le francais orpheline toutes les traductions d'un
 * coup, sans que rien ne le signale. Une clef ne bouge pas.
 *
 * ## Pourquoi le texte manquant rend la CLEF et pas le vide
 *
 * Une traduction incomplete est la regle, pas l'exception : on ajoute une
 * replique le lundi et on traduit le vendredi. Rendre du vide ferait
 * disparaitre le texte — un bouton sans etiquette, un dialogue muet, et
 * personne ne voit ce qui manque. Rendre la clef le montre en clair :
 * `menu.reprendre` s'affiche dans le menu, on le lit, on le traduit.
 *
 * C'est la meme regle que le pave plein de la fonte pour un caractere inconnu.
 * Ce qui manque doit SE VOIR.
 *
 * ## Pourquoi il n'y a pas de pluriels ni de genres
 *
 * Ils demandent une grammaire par langue, et la moitie des bibliotheques de
 * traduction existent pour cela. Un jeu de plateforme ecrit « 3 morts » et
 * « 1 mort » avec un test, ou evite la tournure. Faire semblant de gerer les
 * pluriels avec une regle simple donne du faux dans la moitie des langues ;
 * ne rien promettre est plus honnete.
 */

export interface Textes {
  /** Langue vers clef vers texte. */
  tables: Record<string, Record<string, string>>
  /** La langue affichee. */
  langue: string
}

export class Traduction {
  private tables: Record<string, Record<string, string>>
  langue: string
  /**
   * Les clefs demandees et introuvables.
   *
   * Elles sont RETENUES et non seulement signalees : c'est la liste de ce
   * qu'il reste a traduire, et elle se lit a la fin d'une partie d'essai. Sans
   * elle, il faudrait parcourir le jeu en cherchant les clefs affichees.
   */
  readonly manquantes = new Set<string>()

  constructor(tables: Record<string, Record<string, string>> = {}, langue = 'fr') {
    this.tables = tables
    this.langue = langue
  }

  get langues(): string[] { return Object.keys(this.tables) }

  definir(langue: string, table: Record<string, string>): void {
    this.tables[langue] = { ...(this.tables[langue] ?? {}), ...table }
  }

  /**
   * Le texte d'une clef, avec des substitutions optionnelles.
   *
   * Les substitutions s'ecrivent `{nom}` : c'est la forme la plus lisible dans
   * une table de traduction, et celle qui survit au fait que l'ordre des mots
   * change d'une langue a l'autre. Un `%s` positionnel ne survivrait pas.
   */
  t(clef: string, valeurs: Record<string, string | number> = {}): string {
    const table = this.tables[this.langue] ?? {}
    let texte = table[clef]
    if (texte === undefined) {
      this.manquantes.add(`${this.langue}:${clef}`)
      // La clef elle-meme : ce qui manque doit se voir.
      texte = clef
    }
    return texte.replace(/\{(\w+)\}/g, (entier, nom) => {
      const v = valeurs[nom]
      return v === undefined ? entier : String(v)
    })
  }

  /** Vrai si cette langue connait cette clef. */
  a(clef: string, langue = this.langue): boolean {
    return this.tables[langue]?.[clef] !== undefined
  }

  /**
   * Ce qui manque dans une langue par rapport a une autre.
   *
   * C'est le rapport qu'on veut avant de livrer : « l'anglais n'a pas ces
   * douze clefs ». Le calculer a la demande evite de tenir une liste a jour,
   * donc d'avoir une liste fausse.
   */
  trous(langue: string, reference = 'fr'): string[] {
    const ref = this.tables[reference] ?? {}
    const cible = this.tables[langue] ?? {}
    return Object.keys(ref).filter((c) => cible[c] === undefined).sort()
  }
}
