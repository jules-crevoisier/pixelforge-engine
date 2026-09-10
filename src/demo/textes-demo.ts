/**
 * Les textes du jeu de demonstration, dans deux langues.
 *
 * ## Pourquoi deux et pas une
 *
 * Une seule langue ne prouve rien : la traduction ne se casse pas quand on
 * l'ecrit, elle se casse quand on en ajoute une deuxieme et que la moitie du
 * jeu s'avere ecrite en dur dans le code. Deux langues font apparaitre les
 * chaines oubliees — elles restent en francais quand tout le reste bascule.
 *
 * ## Pourquoi l'anglais est INCOMPLET
 *
 * Il manque exprès `menu.langue.en`. Une table complete ne montre pas ce que
 * fait le moteur d'un texte manquant ; celle-ci, si — on bascule en anglais
 * dans le menu de pause et l'on voit la clef s'afficher. C'est la
 * demonstration de la regle, pas un oubli.
 */

/** Langue vers clef vers texte. */
export const TEXTES_DEMO: Record<string, Record<string, string>> = {
  fr: {
    'menu.reprendre': 'Reprendre',
    'menu.recommencer': 'Recommencer',
    'menu.son': 'Son : {etat}',
    'menu.musique': 'Musique : {etat}',
    'menu.langue': 'Langue : {langue}',
    'etat.oui': 'oui',
    'etat.non': 'non',
    'langue.fr': 'Français',
    'langue.en': 'English',
  },
  en: {
    'menu.reprendre': 'Resume',
    'menu.recommencer': 'Restart',
    'menu.son': 'Sound: {etat}',
    'menu.musique': 'Music: {etat}',
    'menu.langue': 'Language: {langue}',
    'etat.oui': 'on',
    'etat.non': 'off',
    'langue.fr': 'Français',
    // `langue.en` manque EXPRÈS : voir l'en-tête.
  },
}

/** L'ordre dans lequel le menu fait tourner les langues. */
export const LANGUES_DEMO = ['fr', 'en']
