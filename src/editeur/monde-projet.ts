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
import { Eclairage } from '../runtime/lumiere.ts'
import { brancherAudio } from '../demo/sons-demo.ts'
import { brancherMusique } from '../demo/musiques-demo.ts'
import { dessinerDialogue, ecrireCentre } from '../runtime/rendu-texte.ts'
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
export function mondeDepuisProjet(
  p: ProjetSerialise, nomFichier: string, carteVoulue = '',
): Monde {
  const cartes = p.cartes.map((c) => ({
    nom: c.nom,
    carte: relireCarte(c, (l, h, t) => new Carte(l, h, t)),
  }))
  /*
   * TOUTES les scenes sont relues, pas seulement la premiere.
   *
   * Chaque carte s'apparie a la scene DU MEME NOM — c'est ce qui donne a
   * chaque niveau ses propres creatures. Les projets d'avant la version 12
   * n'ont qu'une scene, « principale », qui ne porte le nom d'aucune carte :
   * elle sert alors de scene a tout le monde, ce qui est exactement ce que
   * faisait l'editeur quand il n'y avait qu'une carte.
   */
  const scenes = p.scenes.map((s) => ({ nom: s.nom, racine: relireNoeud(s.racine) }))
  const sceneDe = (nomCarte: string): Noeud =>
    scenes.find((s) => s.nom === nomCarte)?.racine ?? scenes[0]?.racine ?? ({
      id: 'r', nom: 'scene', type: 'noeud', x: 0, y: 0, visible: true,
      enfants: [], script: null, etat: {},
    } as Noeud)

  const indexActif = Math.max(0, cartes.findIndex((c) => c.nom === carteVoulue))
  const premiere = cartes[indexActif]?.carte ?? new Carte(20, 15, p.projection.hauteurTuile || 16)
  const nomActif = cartes[indexActif]?.nom ?? ''
  const racine = sceneDe(nomActif)

  const recenserDans = (r: Noeud): NoeudSprite[] => {
    const liste: NoeudSprite[] = []
    const f = (n: Noeud): void => {
      if (n.type === 'sprite') liste.push(n as NoeudSprite)
      for (const e of n.enfants) f(e)
    }
    f(r)
    return liste
  }
  const sprites = recenserDans(racine)
  const heros = sprites[0] ?? null

  const animations: Clip[] = p.animations.map((a) => ({
    nom: a.nom,
    images: a.images.map((i) => ({ ...i })),
    boucle: a.boucle as Clip['boucle'],
    evenements: a.evenements.map((e) => ({ ...e })),
    suite: a.suite,
  }))

  const depart = heros ? { x: heros.x, y: heros.y } : { x: 0, y: 0 }
  // Les departs de TOUTES les scenes : rejouer remet aussi les creatures du
  // niveau deux, sinon le second essai d'un jeu a deux niveaux serait fausse.
  const departs = scenes.flatMap((sc) => recenserDans(sc.racine))
    .map((n) => ({ n, x: n.x, y: n.y }))
  const projection = { ...p.projection } as Projection
  const combat = new Combat()
  const peuplement = new Peuplement(
    racine, combat, p.especes ?? [], animations, projection, premiere.tuile,
  )
  // Le joueur : la premiere entite dont l'intention est de se laisser diriger.
  // C'est elle que la camera suit et que les autres poursuivent.
  const dirigeDans = (liste: NoeudSprite[]): NoeudSprite | null => liste.find((n) => {
    const id = (n as unknown as { espece?: string }).espece
    const e = id ? peuplement.especeDe(id) : null
    return !!(e && (e.comportement === 'joueur' || e.comportement === 'plateformeur'))
  }) ?? liste[0] ?? null
  const dirige = dirigeDans(sprites) ?? heros
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

  /*
   * LE FLUX : quelle carte se joue MAINTENANT, et avec quels organes.
   *
   * `courant` est un objet et non trois variables : le script de racine le
   * capture une fois, et `aller` le fait pointer ailleurs. Chaque niveau a
   * son propre peuplement et son propre combat — les creatures du niveau un
   * n'ont rien a faire dans la simulation du niveau deux, et un combat
   * partage garderait des impacts en vol d'un niveau a l'autre.
   */
  const courant = {
    peuplement,
    combat,
    dirige: dirige as NoeudSprite | null,
  }
  let fluxActif = nomActif
  let titreOuvert = !!p.deroule?.titre
  const paires = new Map<string, { peuplement: Peuplement; combat: Combat }>()
  paires.set(nomActif, { peuplement, combat })
  const pairePour = (nomCarte: string, r: Noeud, tuile: number) => {
    let paire = paires.get(nomCarte)
    if (!paire) {
      const c2 = new Combat()
      paire = {
        combat: c2,
        peuplement: new Peuplement(r, c2, p.especes ?? [], animations, projection, tuile),
      }
      paires.set(nomCarte, paire)
    }
    return paire
  }
  /** L'ordre du jeu : le deroule s'il dit quelque chose, sinon les cartes. */
  const ordreDuJeu = (): string[] =>
    (p.deroule?.ordre?.length ? p.deroule.ordre : cartes.map((c) => c.nom))

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
    /*
     * TOUTES les cartes et TOUTES les scenes, vivantes.
     *
     * C'est ce que l'enregistrement serialisera : avant cela, il ne gardait
     * que la carte affichee, et enregistrer un projet de trois niveaux en
     * perdait deux — en silence, la pire maniere.
     */
    cartes,
    scenes,
    carteActive: nomActif,
    deroule: p.deroule ?? { titre: '', ordre: [] },
    lumiere: p.lumiere ?? { ambiante: 1 },
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
      /*
       * CHANGER DE CARTE : le verbe `c.aller`, et son deroule.
       *
       * La carte, la scene, le peuplement et la camera changent d'un seul
       * geste. Le script de racine, lui, ne change PAS : toutes les scenes
       * nomment leur racine « scene », et c'est `courant` qui pointe vers le
       * bon peuplement — voir plus haut.
       */
      jeu.allerCarte = (nomCible) => {
        const cible = cartes.find((q) => q.nom === nomCible)
        if (!cible || nomCible === fluxActif) return false
        const r2 = sceneDe(nomCible)
        jeu.carte = cible.carte
        jeu.racine = r2
        const paire = pairePour(nomCible, r2, cible.carte.tuile)
        courant.peuplement = paire.peuplement
        courant.combat = paire.combat
        courant.dirige = dirigeDans(recenserDans(r2))
        jeu.poserEntite = (esp, x, y) => paire.peuplement.poser(esp, x, y)
        if (courant.dirige) {
          jeu.suivreNoeud(courant.dirige.nom)
          // La camera SAUTE : glisser d'un niveau a l'autre montrerait tout
          // l'interstice entre deux cartes qui n'ont rien a voir.
          jeu.cadrer()
        }
        fluxActif = nomCible
        return true
      }
      jeu.interfaceOuverte = () => titreOuvert || dialogue.ouvert
      /*
       * LA LUMIERE : la nuit du projet, avec les couleurs du projet.
       *
       * Les sources se recensent chaque image dans la scene COURANTE : une
       * torche du niveau un n'eclaire pas le niveau deux, et une torche
       * ramassee — retiree de la scene — s'eteint sans qu'on ait rien a
       * debrancher. Le cout de ce recensement est proportionnel a la scene,
       * pas au monde ; celui de la passe est mesure au banc de charge.
       */
      const ambiante = p.lumiere?.ambiante ?? 1
      if (ambiante < 1) {
        const eclairage = new Eclairage(p.palette.couleurs)
        eclairage.ambiante = ambiante
        eclairage.sources = () => {
          const sources: { x: number; y: number; rayon: number }[] = []
          const visiter = (n: Noeud): void => {
            const id = (n as unknown as { espece?: string }).espece
            if (id && n.visible) {
              const e = peuplement.especeDe(id)
              // Le centre est a mi-hauteur de la boite, pas aux pieds : une
              // lanterne posee au sol eclairerait plus bas que le sol.
              if (e && e.lueur > 0) sources.push({ x: n.x, y: n.y + e.boite.y / 2, rayon: e.lueur })
            }
            for (const q of n.enfants) visiter(q)
          }
          visiter(jeu.racine)
          return sources
        }
        jeu.eclairage = eclairage
      }
      jeu.prochaineCarte = () => {
        const ordre = ordreDuJeu()
        const i = ordre.indexOf(fluxActif)
        return i >= 0 && i + 1 < ordre.length ? ordre[i + 1] : ''
      }

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
      // Les scripts de TOUTES les scenes : un script pose sur une porte du
      // niveau deux doit exister avant qu'on y entre. Deux noeuds du meme nom
      // dans deux scenes partagent le meme script — c'est le nom qui indexe.
      for (const sc of scenes) brancher(sc.racine)
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
            nom: d.nom, quand: d.quand, carte: d.carte ?? '', salle: d.salle,
            zone: { ...d.zone }, qui: d.qui, unefois: d.unefois, script: c.script,
          })
        } else fautes.push(`déclencheur ${d.nom} : ${c.erreur ?? 'refusé'}`)
      }
      if (vifs.length) {
        jeu.declencheurs = new Declencheurs(vifs, premiere.tuile)
        jeu.declencheurs.carteCourante = () => fluxActif
      }
      notes = fautes.length ? ` · ${fautes.length} script(s) refusé(s)` : ''
      if (dirige) jeu.suivreNoeud(dirige.nom)

      // Les entites : un seul script, pose sur la racine, qui les fait toutes
      // vivre. Un script par entite obligerait a en poser un a chaque fois
      // qu'on en ajoute une dans l'editeur — et a l'oublier une fois sur deux.
      jeu.scripts.set(racine.nom, (c) => {
        // L'ecran-titre gele tout : le jeu commence quand on le demande, pas
        // pendant qu'on lit le titre.
        if (titreOuvert) {
          if (c.entrees.consommer('action') || c.entrees.consommer('saut')) titreOuvert = false
          return
        }
        // Le dialogue ensuite : quand il est ouvert, le monde ne bouge plus.
        // Laisser courir le jeu derriere une boite de texte fait mourir
        // pendant qu'on lit — la faute la plus injuste qu'un jeu commette.
        if (dialogue.ouvert) {
          dialogue.avancerTemps(c.dt * 1000)
          if (c.entrees.consommer('haut')) dialogue.deplacer(-1)
          if (c.entrees.consommer('bas')) dialogue.deplacer(1)
          if (c.entrees.consommer('action') || c.entrees.consommer('saut')) dialogue.valider()
          return
        }
        courant.peuplement.synchroniser()
        courant.peuplement.avancer(c, courant.dirige ?? { x: 0, y: 0 }, c.dt * 1000)
        for (const impact of courant.combat.avancer(c.dt * 1000)) {
          if (impact.fatal) courant.peuplement.tuer(impact.cible)
        }
      })
      // La boite de texte se dessine par-dessus tout, dans le tampon du jeu :
      // les memes pixels, la meme echelle que le reste. On enchaine sur ce qui
      // etait deja branche au lieu de le remplacer.
      const dessinAvant = jeu.apresDessin
      jeu.apresDessin = (ctx, ecran) => {
        dessinAvant?.(ctx, ecran)
        dessinerDialogue(ecran, dialogue, {})
        if (titreOuvert && p.deroule?.titre) {
          // Le titre en pixels du jeu, comme tout le reste : un ecran-titre
          // en HTML aurait une autre taille de pixel que le jeu qu'il ouvre.
          ctx.fillStyle = 'rgba(10, 8, 16, 0.82)'
          ctx.fillRect(0, 0, ecran.vue.largeur, ecran.vue.hauteur)
          ecrireCentre(ecran, p.deroule.titre, Math.round(ecran.vue.hauteur * 0.38))
          ecrireCentre(ecran, 'Espace pour commencer', Math.round(ecran.vue.hauteur * 0.62))
        }
      }
    },
    reinitialiser() {
      // Toutes les entites reprennent leur place, pas seulement le heros : une
      // creature laissee ou elle etait tombee fausserait le deuxieme essai.
      for (const d of departs) { d.n.x = d.x; d.n.y = d.y; d.n.visible = true }
      for (const paire of paires.values()) {
        paire.combat.reinitialiser()
        paire.peuplement.oublier()
      }
      dialogue.fermer()
      // On revient sur la carte de depart, et l'ecran-titre se rouvre :
      // « rejouer » rejoue le JEU, pas le niveau ou l'on s'etait arrete.
      if (jeuCourant && fluxActif !== nomActif) {
        jeuCourant.carte = premiere
        jeuCourant.racine = racine
        courant.peuplement = peuplement
        courant.combat = combat
        courant.dirige = dirige
        if (dirige) { jeuCourant.suivreNoeud(dirige.nom); jeuCourant.cadrer() }
        fluxActif = nomActif
      }
      titreOuvert = !!p.deroule?.titre
      // Les « une fois » retirent : rejouer depuis le debut, c'est aussi
      // reentendre la musique du boss et relire le panneau d'entree.
      jeuCourant?.declencheurs?.oublier()
    },
    etat: () => `projet relu · ${cartes.length} carte(s) · ${p.planches.length} planche(s)`
      + ` · ${p.animations.length} clip(s) · ${peuplement.nombre} entité(s)${notes}`,
    sonde: () => ({
      carteActive: fluxActif,
      titreOuvert,
      cartes: cartes.map((c) => c.nom),
      ordre: ordreDuJeu(),
    }),
  }
}
