import { Carte } from '../tuiles/tilemap.ts'
import { relireCarte, relireNoeud, type ProjetSerialise } from '../export/format.ts'
import { atlasDepuisLettres } from '../runtime/atlas.ts'
import type { Noeud, NoeudSprite } from '../scene/noeud.ts'
import type { Clip } from '../runtime/animation.ts'
import type { Projection } from '../noyau/projection.ts'
import { compiler } from '../script/atelier.ts'
import type { Monde } from '../demo/mondes.ts'
import { Combat } from '../runtime/combat.ts'
import { Peuplement } from '../runtime/entites.ts'

/**
 * Un monde reconstruit depuis un fichier de projet.
 *
 * C'est ce qui donne son sens a l'enregistrement : un projet relu doit se
 * JOUER, pas seulement s'afficher. Les cartes reviennent, les planches
 * reviennent, la scene revient, la projection revient, et les scripts ecrits
 * dans l'atelier sont recompiles depuis leur source.
 *
 * ## Ce qui ne revient pas, et pourquoi on le dit
 *
 * Les comportements ecrits en TypeScript dans les mondes de demonstration ne
 * sont pas dans le fichier — ils sont dans le code du moteur. Un etage
 * engendre relu redevient donc une salle qu'on parcourt sans creatures. Ce
 * n'est pas un oubli : un fichier de projet ne peut pas contenir du code
 * compile, et pretendre le contraire ferait croire a une fidelite qui n'existe
 * pas. Ce qui est ecrit dans l'atelier, lui, revient — parce que c'est du
 * texte, et que le format le transporte.
 */
export function mondeDepuisProjet(p: ProjetSerialise, nomFichier: string): Monde {
  const cartes = p.cartes.map((c) => ({
    nom: c.nom,
    carte: relireCarte(c, (l, h, t) => new Carte(l, h, t)),
  }))
  const premiere = cartes[0]?.carte ?? new Carte(20, 15, p.projection.hauteurTuile || 16)
  const racine = p.scenes[0] ? relireNoeud(p.scenes[0].racine) : ({
    id: 'r', nom: 'scene', type: 'noeud', x: 0, y: 0, visible: true,
    enfants: [], script: null, etat: {},
  } as Noeud)

  const sprites: NoeudSprite[] = []
  const recenser = (n: Noeud): void => {
    if (n.type === 'sprite') sprites.push(n as NoeudSprite)
    for (const e of n.enfants) recenser(e)
  }
  recenser(racine)
  const heros = sprites[0] ?? null

  const animations: Clip[] = p.animations.map((a) => ({
    nom: a.nom,
    images: a.images.map((i) => ({ ...i })),
    boucle: a.boucle as Clip['boucle'],
    evenements: a.evenements.map((e) => ({ ...e })),
    suite: a.suite,
  }))

  const depart = heros ? { x: heros.x, y: heros.y } : { x: 0, y: 0 }
  const departs = sprites.map((n) => ({ n, x: n.x, y: n.y }))
  const projection = { ...p.projection } as Projection
  const combat = new Combat()
  const peuplement = new Peuplement(
    racine, combat, p.especes ?? [], animations, projection, premiere.tuile,
  )
  // Le joueur : la premiere entite dont l'intention est de se laisser diriger.
  // C'est elle que la camera suit et que les autres poursuivent.
  const dirige = sprites.find((n) => {
    const id = (n as unknown as { espece?: string }).espece
    const e = id ? peuplement.especeDe(id) : null
    return e && (e.comportement === 'joueur' || e.comportement === 'plateformeur')
  }) ?? heros
  let notes = ''

  return {
    id: `projet:${nomFichier}`,
    nom: `${p.nom} — ${nomFichier}`,
    aide: `Projet relu depuis « ${nomFichier} ». Les scripts écrits dans l’atelier ont été recompilés ;`
      + ' les comportements des mondes de démonstration, eux, vivent dans le code du moteur et ne sont pas dans le fichier.',
    vue: { largeur: p.vue.largeur, hauteur: p.vue.hauteur },
    projection,
    carte: premiere,
    racine,
    heros: heros ?? ({} as NoeudSprite),
    depart,
    couleurs: p.palette.couleurs,
    animations,
    especes: p.especes ?? [],
    sons: p.sons ?? [],
    dialogues: p.dialogues ?? [],
    // Les musiques et les textes REPASSENT dans le monde, sinon un projet
    // relu puis reenregistre les perdrait en silence — la faute la plus
    // couteuse d'un format, parce qu'elle ne se voit qu'apres coup.
    musiques: p.musiques ?? [],
    textes: p.textes ?? {},
    peuplement,
    planches: p.planches,
    tuilePinceau: 0,
    installer(jeu) {
      // Le plan de touches du projet, s'il en a un. Sans cela, un projet
      // remappe se rouvre avec les touches d'usine et l'on croit le
      // remappage perdu.
      if (p.touches && Object.keys(p.touches).length) jeu.entrees.definirPlan(p.touches)
      for (const t of p.planches) {
        const atlas = atlasDepuisLettres(t.dessins, t.cle, t.largeurCase, t.colonnes, t.hauteurCase)
        // Une planche sert aux tuiles ET aux sprites : c'est le meme dessin.
        jeu.sprites.set(t.nom, atlas)
        for (const c of cartes) {
          if (!jeu.cartes.has(c.nom)) jeu.cartes.set(c.nom, { carte: c.carte, atlas })
        }
      }
      // La carte prend la planche du meme nom si elle existe, sinon la
      // premiere : sans planche, une carte se dessinerait toute noire et l'on
      // croirait le fichier vide.
      for (const c of cartes) {
        const propre = jeu.sprites.get(c.nom)
        if (propre) jeu.cartes.set(c.nom, { carte: c.carte, atlas: propre })
      }

      const fautes: string[] = []
      const brancher = (n: Noeud): void => {
        if (n.script) {
          const c = compiler(n.script)
          if (c.ok && c.script) jeu.scripts.set(n.nom, c.script)
          else fautes.push(`${n.nom} : ${c.erreur ?? 'refusé'}`)
        }
        for (const e of n.enfants) brancher(e)
      }
      brancher(racine)
      notes = fautes.length ? ` · ${fautes.length} script(s) refusé(s)` : ''
      if (dirige) jeu.suivreNoeud(dirige.nom)

      // Les entites : un seul script, pose sur la racine, qui les fait toutes
      // vivre. Un script par entite obligerait a en poser un a chaque fois
      // qu'on en ajoute une dans l'editeur — et a l'oublier une fois sur deux.
      jeu.scripts.set(racine.nom, (c) => {
        peuplement.synchroniser()
        peuplement.avancer(c, dirige ?? { x: 0, y: 0 }, c.dt * 1000)
        for (const impact of combat.avancer(c.dt * 1000)) {
          if (impact.fatal) peuplement.tuer(impact.cible)
        }
      })
    },
    reinitialiser() {
      // Toutes les entites reprennent leur place, pas seulement le heros : une
      // creature laissee ou elle etait tombee fausserait le deuxieme essai.
      for (const d of departs) { d.n.x = d.x; d.n.y = d.y; d.n.visible = true }
      combat.reinitialiser()
      peuplement.oublier()
    },
    etat: () => `projet relu · ${cartes.length} carte(s) · ${p.planches.length} planche(s)`
      + ` · ${p.animations.length} clip(s) · ${peuplement.nombre} entité(s)${notes}`,
  }
}
