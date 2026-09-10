import { modele, type ModeleSalle, type Symboles } from '../niveau/modeles.ts'

/**
 * Les salles dessinees a la main de l'etage engendre.
 *
 * ## Pourquoi elles sont ici et non dans le moteur
 *
 * Un modele nomme des especes — une gelee, une tourelle — et le moteur ne
 * connait aucune espece. Il ne connait qu'une table de lettres qu'on lui
 * donne. Ces dessins-ci sont donc du CONTENU, au meme titre qu'un plan de
 * caverne, et ils vivent avec le reste du contenu.
 *
 * ## Comment on les lit
 *
 * Dix-huit colonnes sur neuf rangees : l'interieur d'une salle de vingt sur
 * onze, pourtour exclu. Les portes ne figurent pas — l'assemblage les perce
 * apres coup, et la CROIX centrale doit rester libre pour qu'elles se
 * rejoignent toutes. C'est verifie : un bloc pose dans la croix fait refuser
 * le modele au demarrage, avec sa case.
 *
 * Concretement : pas de `#` dans les colonnes 8 et 9, ni dans les rangees 3, 4
 * et 5. Les creatures, elles, y sont permises — elles bougent, on les tue, et
 * une gelee au milieu du passage est une salle, pas une impasse.
 *
 * ## Pourquoi si peu de dessins
 *
 * Quatre, et le tirage les retourne sur les deux axes : cela fait seize
 * salles distinctes a l'oeil. Ce n'est pas de la parcimonie, c'est la
 * demonstration qu'un modele n'a pas besoin de connaitre ses portes — sinon il
 * en faudrait quinze familles pour la meme couverture.
 */

/** Ce que les lettres veulent dire, pour l'etage de demonstration. */
export const SYMBOLES_DEMO: Symboles = {
  blocs: '#',
  entites: {
    g: 'gelee',
    b: 'chauve-souris',
    t: 'tourelle',
    o: 'coeur',
    c: 'caisse',
  },
}

/**
 * Les quatre piliers.
 *
 * La salle la plus simple qui ne soit pas vide : on la traverse en droite
 * ligne, on la contourne si l'on prefere, et les piliers servent d'abri contre
 * ce qui tire. C'est la salle qu'on veut voir en premier.
 */
const PILIERS = modele('quatre piliers', [
  '..##..........##..',
  '..##..........##..',
  '..................',
  '..................',
  '.....g........g...',
  '..................',
  '..##..........##..',
  '..##..........##..',
  '..................',
], { roles: ['commune'], poids: 3 })

/**
 * Le couloir.
 *
 * Deux blocs longs qui forcent le passage par le milieu — la ou les
 * chauves-souris arrivent. Une salle qui RETRECIT le passage se joue autrement
 * qu'une salle qui l'encombre : on n'y esquive plus, on y choisit son moment.
 */
const COULOIR = modele('couloir', [
  '..................',
  '.####.......####..',
  '.####.......####..',
  '..................',
  '...b..........b...',
  '..................',
  '.####.......####..',
  '.####.......####..',
  '..................',
], { roles: ['commune'], poids: 2 })

/**
 * Les gradins.
 *
 * Deux escaliers opposes, et une caisse a pousser du regard. La dissymetrie
 * est voulue : une salle symetrique se lit d'un coup d'oeil, une salle
 * dissymetrique se lit en deux temps, et c'est ce deuxieme temps qui fait
 * qu'on s'en souvient.
 */
const GRADINS = modele('gradins', [
  '.#................',
  '.##...............',
  '.###.......c......',
  '..................',
  '..................',
  '..................',
  '..............###.',
  '...............##.',
  '.......g........#.',
], { roles: ['commune'], poids: 2 })

/**
 * Le losange.
 *
 * Deux chevrons qui se font face et laissent une allee au centre. La salle se
 * traverse sans effort et se COMBAT mal : on y est vite acculé dans une pointe
 * du losange. Une salle n'a pas besoin d'etre difficile a traverser pour etre
 * difficile.
 */
const LOSANGE = modele('losange', [
  '...#..........#...',
  '....#........#....',
  '.....#......#.....',
  '..................',
  '.......b....b.....',
  '..................',
  '.....#......#.....',
  '....#........#....',
  '...#..........#...',
], { roles: ['commune'], poids: 2 })

/**
 * Le poste de garde.
 *
 * Deux tourelles abritees sur trois cotes, ouvertes vers le bas seulement.
 * Elles tirent a couvert, et l'on doit venir les chercher — ce qui donne a la
 * salle un ORDRE : les gelees d'abord, les tourelles ensuite. Une salle qui
 * impose un ordre se joue ; une salle qui n'en impose aucun se traverse.
 */
const POSTE = modele('poste de garde', [
  '..................',
  '...###......###...',
  '...#t#......#t#...',
  '..................',
  '..................',
  '..................',
  '......g....g......',
  '..................',
  '..................',
], { roles: ['commune'], poids: 2 })

/**
 * L'embuscade : quatre tourelles aux angles.
 *
 * Elles se voient toutes les quatre depuis l'entree, et c'est le point : la
 * salle ANNONCE sa difficulte avant qu'on y entre, comme une tourelle annonce
 * son tir. Une salle de boss qui surprend est une salle de boss ratee.
 */
const EMBUSCADE = modele('embuscade', [
  't................t',
  '..................',
  '..###........###..',
  '..................',
  '........g.........',
  '..................',
  '..###........###..',
  '..................',
  't................t',
], { roles: ['boss'] })

/**
 * La chambre au tresor : presque vide.
 *
 * Le vide est le dessin. Quatre blocs au sol suffisent a dire que la salle a
 * ete amenagee, et le coeur au centre se voit depuis n'importe quelle porte.
 */
const TRESOR = modele('chambre au trésor', [
  '..................',
  '..................',
  '....##......##....',
  '..................',
  '........o.........',
  '..................',
  '....##......##....',
  '..................',
  '..................',
], { roles: ['tresor', 'boutique'] })

export const MODELES_DEMO: ModeleSalle[] = [
  PILIERS, COULOIR, GRADINS, LOSANGE, POSTE, EMBUSCADE, TRESOR,
]
