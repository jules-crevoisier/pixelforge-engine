/**
 * La boucle de jeu, a pas fixe.
 *
 * ## Pourquoi un pas fixe et non le temps ecoule
 *
 * Avec un pas variable — « avance de dt secondes » — la physique depend de la
 * cadence d'affichage. Le meme saut ne monte pas a la meme hauteur a 60 et a
 * 144 images par seconde, une collision se rate quand une image met trop
 * longtemps, et une partie n'est pas reproductible : rejouer les memes
 * touches ne redonne pas le meme resultat. Pour un jeu de precision, et pour
 * tout ce qui touche a la rejouabilite, c'est disqualifiant.
 *
 * Le pas est donc fixe. L'affichage, lui, suit la cadence de l'ecran : on peut
 * faire deux pas de simulation dans une image, ou aucun.
 *
 * ## Le plafond de rattrapage
 *
 * Quand l'onglet revient d'arriere-plan, le temps ecoule peut valoir plusieurs
 * secondes. Sans plafond, la boucle tenterait de rattraper des centaines de
 * pas d'un coup, bloquerait le fil d'execution, et le retard grandirait encore
 * — la « spirale de la mort ». On plafonne donc, et on ACCEPTE de perdre du
 * temps de jeu : mieux vaut un saut dans la partie qu'une page figee.
 */
export interface OptionsBoucle {
  /** Pas de simulation, en millisecondes. 16,667 = 60 Hz. */
  pasMs?: number
  /** Nombre maximal de pas rattrapes dans une seule image. */
  rattrapageMax?: number
}

export class Boucle {
  readonly pasMs: number
  private readonly rattrapageMax: number
  private accumule = 0
  private dernier = 0
  private id = 0
  private enMarche = false
  /** Numero du pas courant, depuis le demarrage. Utile aux bancs. */
  pas = 0

  private readonly avancer: (pasMs: number) => void
  private readonly dessiner: (alpha: number) => void

  // Les champs sont declares a la main plutot qu'en propriete de parametre :
  // Node retire les types a la volee pour faire tourner le banc sans
  // empaqueteur, et cette forme-la est la seule que son mode « retrait seul »
  // ne sait pas traduire. La contrainte est mince et le banc reste sans
  // dependance.
  constructor(
    avancer: (pasMs: number) => void,
    dessiner: (alpha: number) => void,
    opts: OptionsBoucle = {},
  ) {
    this.avancer = avancer
    this.dessiner = dessiner
    this.pasMs = opts.pasMs ?? 1000 / 60
    this.rattrapageMax = opts.rattrapageMax ?? 5
  }

  demarrer(): void {
    if (this.enMarche) return
    this.enMarche = true
    this.dernier = performance.now()
    this.accumule = 0
    const image = (t: number): void => {
      if (!this.enMarche) return
      this.id = requestAnimationFrame(image)
      this.accumule += t - this.dernier
      this.dernier = t

      let n = 0
      while (this.accumule >= this.pasMs && n < this.rattrapageMax) {
        this.avancer(this.pasMs)
        this.accumule -= this.pasMs
        this.pas++
        n++
      }
      // Le retard qu'on renonce a rattraper est jete, pas garde : le garder
      // ferait repartir la spirale a l'image suivante.
      if (this.accumule >= this.pasMs) this.accumule = 0

      // `alpha` dit ou l'on se trouve entre deux pas. Un moteur generaliste
      // s'en sert pour interpoler l'affichage ; ici on ne l'emploie que pour
      // ce qui n'est pas sur la grille — une transition, un fondu — parce
      // qu'interpoler une position casserait le contrat de pixel.
      this.dessiner(this.accumule / this.pasMs)
    }
    this.id = requestAnimationFrame(image)
  }

  arreter(): void {
    this.enMarche = false
    if (this.id) cancelAnimationFrame(this.id)
    this.id = 0
  }

  get tourne(): boolean { return this.enMarche }

  /**
   * Fait avancer la boucle a la main, sans horloge. Pour les bancs.
   *
   * Elle applique le MEME plafond que la vraie boucle, et jette le meme
   * retard. Une premiere version ne le faisait pas : le banc lui donnait cinq
   * secondes et elle rendait cinq cents pas, la ou l'application en aurait
   * fait cinq. Un double de test qui ne se comporte pas comme la chose qu'il
   * remplace ne teste rien — il rassure.
   */
  avancerDe(ms: number): number {
    let n = 0
    this.accumule += ms
    while (this.accumule >= this.pasMs && n < this.rattrapageMax) {
      this.avancer(this.pasMs)
      this.accumule -= this.pasMs
      this.pas++
      n++
    }
    if (this.accumule >= this.pasMs) this.accumule = 0
    return n
  }
}
