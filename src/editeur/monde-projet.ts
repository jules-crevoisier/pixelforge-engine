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
import { Aventure } from '../demo/aventure.ts'
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
  /*
   * Les departs de TOUTES les scenes, AVEC leur parent.
   *
   * Le parent, parce que le peuplement RETIRE de la scene ce qui meurt — une
   * gelee abattue, un coeur ramasse, le heros lui-meme au reset. « Rejouer »
   * doit donc RACCROCHER les noeuds retires, pas seulement replacer ceux qui
   * restent : sans cela, une creature tuee au premier essai manquait au
   * deuxieme, et un projet reenregistre apres une partie perdait son heros.
   */
  const departs: { n: NoeudSprite; parent: Noeud; x: number; y: number }[] = []
  for (const sc of scenes) {
    const visiter = (n: Noeud): void => {
      for (const e of n.enfants) {
        if (e.type === 'sprite') departs.push({ n: e as NoeudSprite, parent: n, x: e.x, y: e.y })
        visiter(e)
      }
    }
    visiter(sc.racine)
  }
  const projection = { ...p.projection } as Projection
  const combat = new Combat()
  /*
   * Les scripts d'ESPECE, compiles une fois pour tous les niveaux.
   *
   * C'est l'intention « script » : la personne ecrit ce que fait sa creature,
   * la source vit dans l'espece, et l'atelier la recompile ici avec les memes
   * refus que partout — un script d'espece qui touche au DOM ne passerait pas
   * plus la frontiere qu'un script de noeud.
   */
  const scriptsEspeces = new Map<string, NonNullable<ReturnType<typeof compiler>['script']>>()
  const fautesEspeces: string[] = []
  /** Les scripts que le monde a refuses, en clair. L'editeur les publie. */
  const fautesScripts: string[] = []
  for (const e of p.especes ?? []) {
    if (e.comportement !== 'script' || !e.script) continue
    const c = compiler(e.script)
    if (c.ok && c.script) scriptsEspeces.set(e.id, c.script)
    else fautesEspeces.push(`espèce ${e.id} : ${c.erreur ?? 'refusé'}`)
  }
  const peuplement = new Peuplement(
    racine, combat, p.especes ?? [], animations, projection, premiere.tuile,
  )
  peuplement.scriptsEspeces = scriptsEspeces
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
  interface Paire {
    peuplement: Peuplement
    combat: Combat
    /**
     * L'aventure du niveau : mort, reprise, balises, ramassages, coeurs.
     *
     * C'est LA regle que le jeu-temoin a inscrite au carnet : un projet relu
     * mourait sans reapparaitre — le heros disparaissait et la partie restait
     * ouverte sur du vide. La meme aventure que les mondes de demonstration
     * sert maintenant les projets relus ; nulle quand la scene n'a pas de
     * heros, et le niveau vit alors sans regle de mort, comme avant.
     */
    aventure: Aventure | null
    /** Ce que l'aventure dessine — coeurs, etincelles — capture une fois. */
    dessin: ((ctx: CanvasRenderingContext2D, ecran: Parameters<NonNullable<Jeu['apresDessin']>>[1]) => void) | null
    /** Le heros de la scene, pour remettre la reprise a son depart. */
    heros?: NoeudSprite
  }
  const courant: { paire: Paire | null; dirige: NoeudSprite | null } = {
    paire: null,
    dirige: dirige as NoeudSprite | null,
  }
  let fluxActif = nomActif
  let titreOuvert = !!p.deroule?.titre
  /**
   * La fin du jeu, en deux temps : DEMANDEE par un script — souvent dans le
   * meme souffle qu'un dernier dialogue — puis OUVERTE quand plus aucune
   * interface ne la precede. Ouvrir l'ecran de fin par-dessus le dialogue de
   * fin avalerait les derniers mots du jeu.
   */
  let finDemandee = false
  let finOuverte = false
  const paires = new Map<string, Paire>()
  const fabriquerPaire = (r: Noeud, tuile: number): Paire => {
    const h = dirigeDans(recenserDans(r))
    if (!h) {
      const c2 = new Combat()
      const p2 = new Peuplement(r, c2, p.especes ?? [], animations, projection, tuile)
      p2.scriptsEspeces = scriptsEspeces
      return { combat: c2, peuplement: p2, aventure: null, dessin: null }
    }
    const heros2 = h
    const av = new Aventure(r, heros2, {
      especes: p.especes ?? [],
      clips: animations,
      projection,
      tuile,
      pvHeros: (p.especes ?? []).find((e) => e.id === (h as unknown as { espece?: string }).espece)?.pv ?? 3,
      // Les REGLES du projet : ce que le moteur offrait, le createur peut
      // maintenant le refuser — pas d'epee dans un jeu de plateforme pur,
      // pas de coeurs dans un die-and-retry.
      reapparitionMs: p.regles?.reapparitionMs ?? 700,
      epee: p.regles?.epee ?? true,
      coeurs: p.regles?.coeurs ?? true,
    })
    av.peuplement.degatsMatiere = p.regles?.degatsPointes ?? 1
    av.peuplement.scriptsEspeces = scriptsEspeces
    return { combat: av.combat, peuplement: av.peuplement, aventure: av, dessin: null, heros: heros2 }
  }
  const pairePour = (nomCarte: string, r: Noeud, tuile: number): Paire => {
    let paire = paires.get(nomCarte)
    if (!paire) {
      paire = fabriquerPaire(r, tuile)
      paires.set(nomCarte, paire)
    }
    return paire
  }
  /** L'ordre du jeu : le deroule s'il dit quelque chose, sinon les cartes. */
  const ordreDuJeu = (): string[] =>
    (p.deroule?.ordre?.length ? p.deroule.ordre : cartes.map((c) => c.nom))

  const monde: Monde = {
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
    // Les assemblages REPASSENT dans le monde, comme les musiques : un
    // projet relu puis reenregistre les perdrait sinon en silence.
    assemblages: p.assemblages ?? [],
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
    regles: p.regles ?? { epee: true, coeurs: true, reapparitionMs: 700, degatsPointes: 1 },
    peuplement,
    fautesScripts,
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
      /*
       * UNE SEULE sortie audio pour toutes les aventures : chaque niveau a
       * son sonneur — c'est lui qui retient ce qu'il a joue — mais ouvrir un
       * AudioContext par niveau epuiserait la limite du navigateur au
       * troisieme. On branche un sonneur maitre, et l'on donne sa sortie aux
       * autres.
       */
      const maitre = new Sonneur()
      brancherAudio(maitre, rendreSon)
      const equiper = (paire: Paire): Paire => {
        if (paire.aventure && !paire.aventure.sonneur.nombre) {
          paire.aventure.sonneur.ajouter(...(p.sons ?? []).map((q) => ({ ...q })))
          paire.aventure.sonneur.sortie = maitre.sortie
        }
        return paire
      }
      const activer = (paire: Paire): void => {
        courant.paire = equiper(paire)
        // Le sonneur du CONTEXTE est celui du niveau : c.jouer et l'aventure
        // partagent la meme memoire de ce qui a deja sonne a ce pas.
        jeu.sonneur = paire.aventure?.sonneur
          ?? (jeu.sonneur ?? (() => { const q = new Sonneur((p.sons ?? []).map((r) => ({ ...r }))); q.sortie = maitre.sortie; return q })())
        jeu.poserEntite = (esp, x, y) => paire.peuplement.poser(esp, x, y)
        // Les coeurs et les etincelles du niveau : on capture ce que
        // l'aventure dessine, une fois, et le dessin final du monde le
        // rejoue — voir plus bas la chaine d'apresDessin.
        if (paire.aventure && !paire.dessin) {
          const avant = jeu.apresDessin
          jeu.apresDessin = null
          paire.aventure.installerEcran(jeu)
          paire.dessin = jeu.apresDessin
          jeu.apresDessin = avant
        }
      }
      activer(pairePour(nomActif, racine, premiere.tuile))
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
      /*
       * Les salles du fichier bornent la camera — celles de CETTE carte.
       *
       * Une salle nomme sa carte depuis la version 15, comme un declencheur :
       * le decoupage du niveau un s'appliquait au niveau deux, aux memes
       * cases. Une salle sans carte vit partout, ce que faisaient toutes les
       * salles d'avant.
       */
      const sallesPour = (nomCarte: string): Salles | null => {
        const liste = (p.salles ?? []).filter((q) => !(q.carte ?? '') || q.carte === nomCarte)
        return liste.length ? new Salles(liste, premiere.tuile) : null
      }
      jeu.salles = sallesPour(nomActif)
      /*
       * La lumiere de la carte, ou celle du projet : chaque carte peut
       * contredire l'ambiante — la nuit s'epaissit en descendant.
       */
      const ambianteDe = (nomCarte: string): number =>
        cartes.find((q) => q.nom === nomCarte)?.carte.ambiante ?? (p.lumiere?.ambiante ?? 1)
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
        activer(pairePour(nomCible, r2, cible.carte.tuile))
        jeu.salles = sallesPour(nomCible)
        if (jeu.eclairage) jeu.eclairage.ambiante = ambianteDe(nomCible)
        courant.dirige = dirigeDans(recenserDans(r2))
        if (courant.dirige) {
          jeu.suivreNoeud(courant.dirige.nom)
          // La camera SAUTE : glisser d'un niveau a l'autre montrerait tout
          // l'interstice entre deux cartes qui n'ont rien a voir.
          jeu.cadrer()
        }
        fluxActif = nomCible
        return true
      }
      jeu.finDuJeu = () => { finDemandee = true }
      jeu.interfaceOuverte = () => titreOuvert || dialogue.ouvert || finDemandee || finOuverte
      /*
       * LA LUMIERE : la nuit du projet, avec les couleurs du projet.
       *
       * Les sources se recensent chaque image dans la scene COURANTE : une
       * torche du niveau un n'eclaire pas le niveau deux, et une torche
       * ramassee — retiree de la scene — s'eteint sans qu'on ait rien a
       * debrancher. Le cout de ce recensement est proportionnel a la scene,
       * pas au monde ; celui de la passe est mesure au banc de charge.
       */
      const nuitQuelquePart = (p.lumiere?.ambiante ?? 1) < 1
        || cartes.some((q) => (q.carte.ambiante ?? 1) < 1)
      if (nuitQuelquePart) {
        const eclairage = new Eclairage(p.palette.couleurs)
        eclairage.ambiante = ambianteDe(nomActif)
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
      fautes.push(...fautesEspeces)
      notes = fautes.length ? ` · ${fautes.length} script(s) refusé(s)` : ''
      /*
       * Les refus partent aussi a la CONSOLE.
       *
       * Le compte dans la barre d'etat disait « 3 script(s) refuse(s) » et
       * rien d'autre : ni lesquels, ni pourquoi. On garde donc la liste, et
       * l'editeur la lit apres avoir installe le monde — voir `signaler`.
       */
      fautesScripts.length = 0
      fautesScripts.push(...fautes)
      if (dirige) jeu.suivreNoeud(dirige.nom)

      // Les entites : un seul script, pose sur la racine, qui les fait toutes
      // vivre. Un script par entite obligerait a en poser un a chaque fois
      // qu'on en ajoute une dans l'editeur — et a l'oublier une fois sur deux.
      jeu.scripts.set(racine.nom, (c) => {
        // L'ecran-titre gele tout : le jeu commence quand on le demande, pas
        // pendant qu'on lit le titre.
        if (titreOuvert) {
          // Les DEUX se consomment, sans court-circuit : depuis que la
          // consommation est par action, un « ou » paresseux laisserait le
          // saut vivant, et la barre d'espace validerait deux fois.
          const passe = [c.entrees.consommer('action'), c.entrees.consommer('saut')]
          if (passe.some(Boolean)) titreOuvert = false
          return
        }
        // Le dialogue ensuite : quand il est ouvert, le monde ne bouge plus.
        // Laisser courir le jeu derriere une boite de texte fait mourir
        // pendant qu'on lit — la faute la plus injuste qu'un jeu commette.
        if (dialogue.ouvert) {
          dialogue.avancerTemps(c.dt * 1000)
          if (c.entrees.consommer('haut')) dialogue.deplacer(-1)
          if (c.entrees.consommer('bas')) dialogue.deplacer(1)
          const valide = [c.entrees.consommer('action'), c.entrees.consommer('saut')]
          if (valide.some(Boolean)) dialogue.valider()
          return
        }
        // La fin : elle attend que le dernier dialogue soit lu, s'affiche,
        // puis un appui ramene au TITRE — le jeu entier remis a son depart.
        if (finOuverte) {
          const appuis = [c.entrees.consommer('action'), c.entrees.consommer('saut')]
          if (appuis.some(Boolean)) {
            finOuverte = false
            finDemandee = false
            monde.reinitialiser()
            jeu.cadrer()
          }
          return
        }
        if (finDemandee) { finOuverte = true; return }
        const paire = courant.paire
        if (!paire) return
        if (paire.aventure) {
          /*
           * L'AVENTURE fait tout ce que les mondes de demonstration savaient
           * et que les projets relus n'avaient pas : la mort et la REPRISE —
           * a l'entree du niveau, ou a la derniere balise touchee —, la
           * chute hors du monde, l'epee, les coeurs qui se ramassent. Un
           * projet relu est un jeu entier, pas une scene qui se traverse.
           */
          paire.aventure.avancer(
            c, paire.peuplement.regardDe(courant.dirige?.id ?? ''))
        } else {
          paire.peuplement.synchroniser()
          paire.peuplement.avancer(c, courant.dirige ?? { x: 0, y: 0 }, c.dt * 1000)
          for (const impact of paire.combat.avancer(c.dt * 1000)) {
            if (impact.fatal) paire.peuplement.tuer(impact.cible)
          }
        }
      })
      // La boite de texte se dessine par-dessus tout, dans le tampon du jeu :
      // les memes pixels, la meme echelle que le reste. On enchaine sur ce qui
      // etait deja branche au lieu de le remplacer.
      const dessinAvant = jeu.apresDessin
      jeu.apresDessin = (ctx, ecran) => {
        dessinAvant?.(ctx, ecran)
        // L'interface du JEU — dialogue, titre, fin — ne se dessine qu'en
        // jouant : a l'arret, on edite, et un ecran-titre pose sur la vue
        // d'edition cacherait ce qu'on est en train de faire.
        if (!jeu.tourne) return
        // Les coeurs et etincelles du NIVEAU COURANT : c'est une capture par
        // paire, et non un branchement global, pour que changer de carte
        // change aussi la jauge qu'on regarde. Et seulement PENDANT le jeu :
        // des coeurs sur l'ecran d'edition sont du bruit — on les a vus sur
        // une capture, pas dans un banc.
        if (jeu.tourne) courant.paire?.dessin?.(ctx, ecran)
        dessinerDialogue(ecran, dialogue, {})
        if (finOuverte) {
          ctx.fillStyle = 'rgba(10, 8, 16, 0.86)'
          ctx.fillRect(0, 0, ecran.vue.largeur, ecran.vue.hauteur)
          ecrireCentre(ecran, p.deroule?.titre || p.nom, Math.round(ecran.vue.hauteur * 0.3))
          ecrireCentre(ecran, 'FIN', Math.round(ecran.vue.hauteur * 0.45))
          const av = courant.paire?.aventure
          if (av) {
            ecrireCentre(ecran, `${av.morts} mort(s) · ${av.ramasses} trouvaille(s)`,
              Math.round(ecran.vue.hauteur * 0.6))
          }
          ecrireCentre(ecran, 'Espace pour revenir au titre', Math.round(ecran.vue.hauteur * 0.75))
          return
        }
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
    /*
     * Les gestes d'EDITION tiennent la liste des departs a jour. Sans cela,
     * une entite posee puis testee disparaissait au premier « Arreter » :
     * l'aventure vide ce qu'elle a adopte, et seuls les departs sont
     * raccroches. C'est un banc — la boucle « editer dehors, Jouer ici » —
     * qui a deterre la perte, en cherchant une creature qui n'y etait plus.
     */
    retenirDepart(n: NoeudSprite, parent: Noeud) {
      const deja = departs.find((d) => d.n === n)
      if (deja) {
        deja.x = n.x
        deja.y = n.y
        deja.parent = parent
      } else {
        departs.push({ n, parent, x: n.x, y: n.y })
      }
    },
    oublierDepart(n: Noeud) {
      const i = departs.findIndex((d) => d.n === n)
      // Sans l'oubli, une entite RETIREE en edition serait raccrochee au
      // prochain arret — la revenante, le miroir exact de la disparue.
      if (i >= 0) departs.splice(i, 1)
    },
    reinitialiser() {
      // Toutes les entites reprennent leur place, pas seulement le heros : une
      // creature laissee ou elle etait tombee fausserait le deuxieme essai.
      /*
       * L'ORDRE COMPTE. L'aventure d'abord : sa remise a zero VIDE le
       * peuplement, c'est-a-dire retire de la scene tout ce qu'il avait
       * adopte. Ensuite seulement on raccroche et replace chaque noeud a son
       * depart — dans l'autre sens, le vidage retirerait ce qu'on vient de
       * remettre. Et les reprises en dernier, une fois le heros replace.
       */
      for (const paire of paires.values()) {
        if (paire.aventure) paire.aventure.reinitialiser()
        else {
          paire.combat.reinitialiser()
          paire.peuplement.oublier()
        }
      }
      for (const d of departs) {
        d.n.x = d.x
        d.n.y = d.y
        d.n.visible = true
        if (!d.parent.enfants.includes(d.n)) d.parent.enfants.push(d.n)
      }
      for (const paire of paires.values()) {
        if (paire.aventure && paire.heros) {
          paire.aventure.reapparition = { x: paire.heros.x, y: paire.heros.y }
        }
      }
      dialogue.fermer()
      // On revient sur la carte de depart, et l'ecran-titre se rouvre :
      // « rejouer » rejoue le JEU, pas le niveau ou l'on s'etait arrete.
      if (jeuCourant && fluxActif !== nomActif) {
        jeuCourant.carte = premiere
        jeuCourant.racine = racine
        jeuCourant.salles = jeuCourant.salles === null && !(p.salles ?? []).length
          ? null
          : (() => {
            const liste = (p.salles ?? []).filter((q) => !(q.carte ?? '') || q.carte === nomActif)
            return liste.length ? new Salles(liste, premiere.tuile) : null
          })()
        if (jeuCourant.eclairage) {
          jeuCourant.eclairage.ambiante =
            cartes.find((q) => q.nom === nomActif)?.carte.ambiante ?? (p.lumiere?.ambiante ?? 1)
        }
        courant.paire = paires.get(nomActif) ?? courant.paire
        if (courant.paire) {
          jeuCourant.sonneur = courant.paire.aventure?.sonneur ?? jeuCourant.sonneur
          const paireLa = courant.paire
          jeuCourant.poserEntite = (esp, x, y) => paireLa.peuplement.poser(esp, x, y)
        }
        courant.dirige = dirige
        if (dirige) { jeuCourant.suivreNoeud(dirige.nom); jeuCourant.cadrer() }
        fluxActif = nomActif
      }
      titreOuvert = !!p.deroule?.titre
      finDemandee = false
      finOuverte = false
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
      pv: courant.paire?.aventure?.pv ?? -1,
      pvMax: courant.paire?.aventure?.max ?? -1,
      morts: courant.paire?.aventure?.morts ?? 0,
      balises: courant.paire?.aventure?.balisesAtteintes ?? 0,
      finOuverte,
    }),
  }
  return monde
}
