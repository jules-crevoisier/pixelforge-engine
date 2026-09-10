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
import { Sonneur, rendre as rendreSon } from '../runtime/son.ts'
import { Musicien, rendreMusique } from '../runtime/musique.ts'
import { Dialogue } from '../runtime/dialogue.ts'
import { Salles } from '../niveau/salles.ts'
import { Declencheurs, type Declencheur } from '../runtime/declencheurs.ts'
import { brancherAudio } from '../demo/sons-demo.ts'
import { brancherMusique } from '../demo/musiques-demo.ts'
import { dessinerDialogue } from '../runtime/rendu-texte.ts'
import type { Jeu } from '../runtime/jeu.ts'

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

  /*
   * Le dialogue du monde relu, et le jeu sur lequel il est branche.
   *
   * `jeuCourant` sert a `reinitialiser` : rejouer depuis le debut doit aussi
   * remettre les declencheurs a zero, sinon un « une fois » deja tire au
   * premier essai ne tire plus jamais — et l'on croirait le fichier casse.
   */
  const dialogue = new Dialogue({ largeur: p.vue.largeur - 18, vitesse: 42, lignes: 3 })
  let jeuCourant: Jeu | null = null

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
    salles: p.salles ?? [],
    // Ils repassent dans le monde sous leur forme de donnees : c'est ce que
    // l'enregistrement reprendra, et un projet relu puis reenregistre ne
    // doit pas les perdre en silence.
    declencheurs: p.declencheurs ?? [],
    peuplement,
    planches: p.planches,
    tuilePinceau: 0,
    installer(jeu) {
      jeuCourant = jeu
      /*
       * LES ORGANES DU CONTEXTE : un projet relu doit pouvoir tout ce que
       * ses scripts demandent — jouer un son, lancer une musique, ouvrir un
       * dialogue, poser une entite. Sans ces branchements, `c.jouer('coup')`
       * rendrait faux dans un projet qui CONTIENT le son « coup », et la
       * personne chercherait la faute dans son script au lieu du moteur.
       */
      const sonneur = new Sonneur((p.sons ?? []).map((q) => ({ ...q })))
      brancherAudio(sonneur, rendreSon)
      jeu.sonneur = sonneur
      if (p.musiques?.length) {
        const musicien = new Musicien(p.musiques)
        brancherMusique(musicien, rendreMusique)
        jeu.musicien = musicien
      }
      jeu.ouvrirDialogue = (nom) => {
        const d = (p.dialogues ?? []).find((q) => q.nom === nom)
        // Un dialogue deja ouvert refuse d'etre recouvert : deux boites de
        // texte empilees ne se lisent pas, et celle du dessous serait perdue.
        if (!d || dialogue.ouvert) return false
        dialogue.ouvrir(d.repliques)
        return true
      }
      jeu.poserEntite = (espece, x, y) => peuplement.poser(espece, x, y)
      // Les salles du fichier bornent la camera, comme dans un monde ecrit a
      // la main. Sans cette ligne, un chapitre decoupe dans l'editeur se
      // rouvrait avec une camera qui suit partout — le decoupage semblait
      // enregistre pour rien.
      if (p.salles?.length) jeu.salles = new Salles(p.salles, premiere.tuile)

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
      /*
       * Les declencheurs se recompilent comme les scripts des noeuds : meme
       * atelier, memes refus, meme filet d'erreurs. Un declencheur refuse est
       * COMPTE avec les scripts refuses — le silence serait pire, parce qu'un
       * declencheur ne se voit pas dans la scene.
       */
      const vifs: Declencheur[] = []
      for (const d of p.declencheurs ?? []) {
        const c = compiler(d.script)
        if (c.ok && c.script) {
          vifs.push({
            nom: d.nom, quand: d.quand, salle: d.salle,
            zone: { ...d.zone }, qui: d.qui, unefois: d.unefois, script: c.script,
          })
        } else fautes.push(`déclencheur ${d.nom} : ${c.erreur ?? 'refusé'}`)
      }
      if (vifs.length) jeu.declencheurs = new Declencheurs(vifs, premiere.tuile)
      notes = fautes.length ? ` · ${fautes.length} script(s) refusé(s)` : ''
      if (dirige) jeu.suivreNoeud(dirige.nom)

      // Les entites : un seul script, pose sur la racine, qui les fait toutes
      // vivre. Un script par entite obligerait a en poser un a chaque fois
      // qu'on en ajoute une dans l'editeur — et a l'oublier une fois sur deux.
      jeu.scripts.set(racine.nom, (c) => {
        // Le dialogue d'abord : quand il est ouvert, le monde ne bouge plus.
        // Laisser courir le jeu derriere une boite de texte fait mourir
        // pendant qu'on lit — la faute la plus injuste qu'un jeu commette.
        if (dialogue.ouvert) {
          dialogue.avancerTemps(c.dt * 1000)
          if (c.entrees.consommer('haut')) dialogue.deplacer(-1)
          if (c.entrees.consommer('bas')) dialogue.deplacer(1)
          if (c.entrees.consommer('action') || c.entrees.consommer('saut')) dialogue.valider()
          return
        }
        peuplement.synchroniser()
        peuplement.avancer(c, dirige ?? { x: 0, y: 0 }, c.dt * 1000)
        for (const impact of combat.avancer(c.dt * 1000)) {
          if (impact.fatal) peuplement.tuer(impact.cible)
        }
      })
      // La boite de texte se dessine par-dessus tout, dans le tampon du jeu :
      // les memes pixels, la meme echelle que le reste. On enchaine sur ce qui
      // etait deja branche au lieu de le remplacer.
      const dessinAvant = jeu.apresDessin
      jeu.apresDessin = (ctx, ecran) => {
        dessinAvant?.(ctx, ecran)
        dessinerDialogue(ecran, dialogue, {})
      }
    },
    reinitialiser() {
      // Toutes les entites reprennent leur place, pas seulement le heros : une
      // creature laissee ou elle etait tombee fausserait le deuxieme essai.
      for (const d of departs) { d.n.x = d.x; d.n.y = d.y; d.n.visible = true }
      combat.reinitialiser()
      peuplement.oublier()
      dialogue.fermer()
      // Les « une fois » retirent : rejouer depuis le debut, c'est aussi
      // reentendre la musique du boss et relire le panneau d'entree.
      jeuCourant?.declencheurs?.oublier()
    },
    etat: () => `projet relu · ${cartes.length} carte(s) · ${p.planches.length} planche(s)`
      + ` · ${p.animations.length} clip(s) · ${peuplement.nombre} entité(s)${notes}`,
  }
}
