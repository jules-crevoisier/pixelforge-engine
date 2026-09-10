/**
 * Une fonte de cinq pixels sur sept, ecrite comme les planches : en dessins.
 *
 * ## Pourquoi pas une police du systeme
 *
 * `ctx.fillText` donnerait du texte en trois lignes, et du texte anticrenele
 * — c'est-a-dire du texte gris sur les bords, dans un jeu ou chaque pixel est
 * une couleur de la palette. Sur un ecran agrandi quatre fois, la difference
 * ne se discute pas : l'un appartient au jeu, l'autre est pose dessus.
 *
 * Et une police du systeme n'est pas la meme partout. Un dialogue cadre au
 * pixel pres chez soi deborde de sa boite chez quelqu'un d'autre, sans qu'on
 * puisse le savoir.
 *
 * ## Pourquoi cinq sur sept
 *
 * C'est la plus petite taille ou les minuscules restent lisibles avec des
 * jambages — le `g`, le `p`, le `y` descendent sous la ligne. En quatre sur
 * six, il faut renoncer aux minuscules et ecrire en capitales, ce que
 * beaucoup de jeux de l'epoque faisaient par contrainte. On garde les deux
 * casses : une phrase francaise en capitales se lit mal, et un dialogue est
 * fait pour etre lu.
 *
 * ## Les accents ne sont pas une option
 *
 * Le projet est en francais. Une fonte sans « é » oblige a ecrire « eleve »,
 * et l'on finit par ecrire tout le jeu sans accents « parce que la fonte ne
 * les a pas ». Ils sont donc la des le premier jour, capitales comprises.
 *
 * ## La forme des donnees
 *
 * Un glyphe par ligne, sept rangees separees par une barre. C'est fait pour le
 * DIFF : quand un pixel bouge, on voit lequel, dans quelle lettre. Une fonte
 * encodee en nombres serait plus courte et illisible a la relecture.
 */

/** Largeur et hauteur d'un glyphe, en pixels. */
export const LARGEUR_GLYPHE = 5
export const HAUTEUR_GLYPHE = 7
/** Espace entre deux lettres, et hauteur d'une ligne a l'autre. */
export const CHASSE = 1
export const INTERLIGNE = 2

const DESSINS: Record<string, string> = {
  'A': '.###.|#...#|#...#|#####|#...#|#...#|.....',
  'B': '####.|#...#|####.|#...#|#...#|####.|.....',
  'C': '.####|#....|#....|#....|#....|.####|.....',
  'D': '####.|#...#|#...#|#...#|#...#|####.|.....',
  'E': '#####|#....|####.|#....|#....|#####|.....',
  'F': '#####|#....|####.|#....|#....|#....|.....',
  'G': '.####|#....|#..##|#...#|#...#|.####|.....',
  'H': '#...#|#...#|#####|#...#|#...#|#...#|.....',
  'I': '#####|..#..|..#..|..#..|..#..|#####|.....',
  'J': '....#|....#|....#|....#|#...#|.###.|.....',
  'K': '#...#|#..#.|###..|#..#.|#...#|#...#|.....',
  'L': '#....|#....|#....|#....|#....|#####|.....',
  'M': '#...#|##.##|#.#.#|#...#|#...#|#...#|.....',
  'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|.....',
  'O': '.###.|#...#|#...#|#...#|#...#|.###.|.....',
  'P': '####.|#...#|####.|#....|#....|#....|.....',
  'Q': '.###.|#...#|#...#|#.#.#|#..#.|.##.#|.....',
  'R': '####.|#...#|####.|#..#.|#...#|#...#|.....',
  'S': '.####|#....|.###.|....#|....#|####.|.....',
  'T': '#####|..#..|..#..|..#..|..#..|..#..|.....',
  'U': '#...#|#...#|#...#|#...#|#...#|.###.|.....',
  'V': '#...#|#...#|#...#|#...#|.#.#.|..#..|.....',
  'W': '#...#|#...#|#...#|#.#.#|##.##|#...#|.....',
  'X': '#...#|.#.#.|..#..|..#..|.#.#.|#...#|.....',
  'Y': '#...#|.#.#.|..#..|..#..|..#..|..#..|.....',
  'Z': '#####|....#|...#.|..#..|.#...|#####|.....',
  'a': '.....|.###.|....#|.####|#...#|.####|.....',
  'b': '#....|#....|####.|#...#|#...#|####.|.....',
  'c': '.....|.####|#....|#....|#....|.####|.....',
  'd': '....#|....#|.####|#...#|#...#|.####|.....',
  'e': '.....|.###.|#...#|#####|#....|.###.|.....',
  'f': '..##.|.#...|####.|.#...|.#...|.#...|.....',
  'g': '.....|.####|#...#|#...#|.####|....#|.###.',
  'h': '#....|#....|####.|#...#|#...#|#...#|.....',
  'i': '..#..|.....|.##..|..#..|..#..|.###.|.....',
  'j': '...#.|.....|..##.|...#.|...#.|#..#.|.##..',
  'k': '#....|#..#.|#.#..|##...|#.#..|#..#.|.....',
  'l': '.##..|..#..|..#..|..#..|..#..|.###.|.....',
  'm': '.....|##.#.|#.#.#|#.#.#|#...#|#...#|.....',
  'n': '.....|####.|#...#|#...#|#...#|#...#|.....',
  'o': '.....|.###.|#...#|#...#|#...#|.###.|.....',
  'p': '.....|####.|#...#|#...#|####.|#....|#....',
  'q': '.....|.####|#...#|#...#|.####|....#|....#',
  'r': '.....|#.##.|##...|#....|#....|#....|.....',
  's': '.....|.####|#....|.###.|....#|####.|.....',
  't': '.#...|.#...|####.|.#...|.#...|..##.|.....',
  'u': '.....|#...#|#...#|#...#|#..##|.##.#|.....',
  'v': '.....|#...#|#...#|#...#|.#.#.|..#..|.....',
  'w': '.....|#...#|#...#|#.#.#|##.##|#...#|.....',
  'x': '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
  'y': '.....|#...#|#...#|#...#|.####|....#|.###.',
  'z': '.....|#####|...#.|..#..|.#...|#####|.....',
  '0': '.###.|#..##|#.#.#|##..#|#...#|.###.|.....',
  '1': '..#..|.##..|..#..|..#..|..#..|.###.|.....',
  '2': '.###.|#...#|...#.|..#..|.#...|#####|.....',
  '3': '####.|....#|.###.|....#|....#|####.|.....',
  '4': '#..#.|#..#.|#..#.|#####|...#.|...#.|.....',
  '5': '#####|#....|####.|....#|....#|####.|.....',
  '6': '.###.|#....|####.|#...#|#...#|.###.|.....',
  '7': '#####|....#|...#.|..#..|..#..|..#..|.....',
  '8': '.###.|#...#|.###.|#...#|#...#|.###.|.....',
  '9': '.###.|#...#|#...#|.####|....#|.###.|.....',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|..#..|.....',
  ',': '.....|.....|.....|.....|..#..|..#..|.#...',
  ':': '.....|..#..|.....|.....|..#..|.....|.....',
  ';': '.....|..#..|.....|.....|..#..|..#..|.#...',
  '!': '..#..|..#..|..#..|..#..|.....|..#..|.....',
  '?': '.###.|#...#|...#.|..#..|.....|..#..|.....',
  '\'': '..#..|..#..|.....|.....|.....|.....|.....',
  '’': '..#..|..#..|.....|.....|.....|.....|.....',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  '_': '.....|.....|.....|.....|.....|.....|#####',
  '(': '...#.|..#..|..#..|..#..|..#..|...#.|.....',
  ')': '.#...|..#..|..#..|..#..|..#..|.#...|.....',
  '«': '.....|..#.#|.#.#.|#.#..|.#.#.|..#.#|.....',
  '»': '.....|#.#..|.#.#.|..#.#|.#.#.|#.#..|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  '/': '....#|...#.|..#..|..#..|.#...|#....|.....',
  '%': '#...#|...#.|..#..|..#..|.#...|#...#|.....',
  '*': '.....|.#.#.|..#..|#####|..#..|.#.#.|.....',
  'É': '..##.|.....|#####|#....|####.|#####|.....',
  'È': '.##..|.....|#####|#....|####.|#####|.....',
  'Ê': '..#..|.#.#.|#####|#....|####.|#####|.....',
  'À': '.##..|.....|.###.|#...#|#####|#...#|.....',
  'Â': '..#..|.#.#.|.###.|#...#|#####|#...#|.....',
  'Ç': '.####|#....|#....|#....|.####|..#..|..##.',
  'Ù': '.##..|.....|#...#|#...#|#...#|.###.|.....',
  'Û': '..#..|.#.#.|#...#|#...#|#...#|.###.|.....',
  'Î': '..#..|.#.#.|#####|..#..|..#..|#####|.....',
  'Ô': '..#..|.#.#.|.###.|#...#|#...#|.###.|.....',
  'é': '..#..|.#...|.###.|#####|#....|.###.|.....',
  'è': '.#...|..#..|.###.|#####|#....|.###.|.....',
  'ê': '..#..|.#.#.|.###.|#####|#....|.###.|.....',
  'ë': '.#.#.|.....|.###.|#####|#....|.###.|.....',
  'à': '.#...|..#..|.###.|....#|.####|.####|.....',
  'â': '..#..|.#.#.|.###.|....#|.####|.####|.....',
  'ç': '.....|.####|#....|#....|.####|..#..|..##.',
  'ù': '.#...|..#..|#...#|#...#|#..##|.##.#|.....',
  'û': '..#..|.#.#.|#...#|#...#|#..##|.##.#|.....',
  'î': '..#..|.#.#.|.##..|..#..|..#..|.###.|.....',
  'ï': '.#.#.|.....|.##..|..#..|..#..|.###.|.....',
  'ô': '..#..|.#.#.|.###.|#...#|#...#|.###.|.....',
  'œ': '.....|.##.#|#..##|####.|#..##|.##.#|.....',
  '>': '#....|.#...|..#..|...#.|..#..|.#...|#....',
  '<': '....#|...#.|..#..|.#...|..#..|...#.|....#',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  '#': '.#.#.|#####|.#.#.|#####|.#.#.|.....|.....',
  '&': '.##..|#..#.|.##..|#.#.#|#..#.|.##.#|.....',
  '@': '.###.|#...#|#.###|#.#.#|#....|.###.|.....',
  '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '[': '..##.|..#..|..#..|..#..|..#..|..##.|.....',
  ']': '.##..|..#..|..#..|..#..|..#..|.##..|.....',
  '{': '...##|..#..|.##..|..#..|..#..|...##|.....',
  '}': '##...|..#..|..##.|..#..|..#..|##...|.....',
  '|': '..#..|..#..|..#..|..#..|..#..|..#..|.....',
  '\\': '#....|.#...|..#..|..#..|...#.|....#|.....',
  '^': '..#..|.#.#.|#...#|.....|.....|.....|.....',
  '~': '.....|.##.#|#..#.|.....|.....|.....|.....',
  '`': '.#...|..#..|.....|.....|.....|.....|.....',
  '°': '.##..|#..#.|.##..|.....|.....|.....|.....',
  '€': '..###|.#...|####.|.#...|####.|..###|.....',
  '…': '.....|.....|.....|.....|.....|#.#.#|.....',
  '–': '.....|.....|.....|#####|.....|.....|.....',
  '·': '.....|.....|.....|..#..|.....|.....|.....',
  '×': '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
}

/**
 * Le glyphe d'un caractere, en rangees de pixels.
 *
 * Un caractere inconnu rend un rectangle plein. On pourrait rendre un espace,
 * et c'est le mauvais choix : un texte ou les caracteres manquants
 * DISPARAISSENT se lit presque normalement, et l'on livre le jeu sans avoir vu
 * que la moitie d'un mot manquait. Un rectangle noir se remarque a la premiere
 * lecture.
 */
export function glyphe(c: string): string[] {
  const d = DESSINS[c]
  if (d) return d.split('|')
  return ['#####', '#####', '#####', '#####', '#####', '#####', '.....']
}

export function connait(c: string): boolean { return DESSINS[c] !== undefined }

/** Tous les caracteres que la fonte sait dessiner. */
export function caracteres(): string[] { return Object.keys(DESSINS) }

/** Largeur d'un texte en pixels, chasse comprise, sans le blanc final. */
export function largeurTexte(t: string): number {
  if (t.length === 0) return 0
  return t.length * (LARGEUR_GLYPHE + CHASSE) - CHASSE
}

/**
 * Coupe un texte pour qu'il tienne dans une largeur, en pixels.
 *
 * On coupe aux ESPACES, jamais au milieu d'un mot — sauf si le mot est plus
 * long que la ligne, auquel cas on le coupe plutot que de le laisser deborder
 * en silence. Un mot qui sort de sa boite est un defaut qu'on ne voit que sur
 * la machine de quelqu'un d'autre.
 *
 * Les retours a la ligne ecrits dans le texte sont respectes : c'est ainsi
 * qu'on separe deux repliques dans une meme boite.
 */
export function couper(texte: string, largeur: number): string[] {
  const lignes: string[] = []
  for (const paragraphe of texte.split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (largeurTexte(essai) <= largeur || ligne === '') {
        // Un mot seul plus long que la ligne : on le coupe a la lettre.
        if (ligne === '' && largeurTexte(mot) > largeur) {
          let reste = mot
          while (largeurTexte(reste) > largeur && largeur > LARGEUR_GLYPHE) {
            let n = reste.length
            while (n > 1 && largeurTexte(reste.slice(0, n)) > largeur) n--
            lignes.push(reste.slice(0, n))
            reste = reste.slice(n)
          }
          ligne = reste
          continue
        }
        ligne = essai
      } else {
        lignes.push(ligne)
        ligne = mot
      }
    }
    lignes.push(ligne)
  }
  return lignes
}

/**
 * Dessine un texte dans un tampon de pixels, une couleur par pixel allume.
 *
 * Elle rend les pixels a peindre au lieu de peindre elle-meme : c'est ce qui
 * permet au banc de verifier un cadrage sans navigateur, et a l'appelant de
 * choisir sa facon de dessiner — un canevas, une planche, un fichier PNG.
 */
export function pixelsDe(
  texte: string, x: number, y: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  let ox = x
  for (const c of texte) {
    const rangees = glyphe(c)
    for (let ry = 0; ry < rangees.length; ry++) {
      const rangee = rangees[ry]
      for (let rx = 0; rx < rangee.length; rx++) {
        if (rangee[rx] !== '.') points.push({ x: ox + rx, y: y + ry })
      }
    }
    ox += LARGEUR_GLYPHE + CHASSE
  }
  return points
}
