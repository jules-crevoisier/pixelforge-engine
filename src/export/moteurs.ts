import type { ProjetSerialise } from './format.ts'
import { versTexte } from './format.ts'
import { chargeur } from './chargeurs.ts'
import { encoderPng, planchePixels } from './png.ts'
import { versOctets, type Entree } from './paquet.ts'
import { encoderWav } from './wav.ts'
import { rendre as rendreSon } from '../runtime/son.ts'
import { rendreMusique } from '../runtime/musique.ts'

/**
 * L'export vers un projet Godot ou Unity, en un paquet qu'on ouvre.
 *
 * ## Le choix qui gouverne tout : donnees a l'execution, pas ressources natives
 *
 * On pourrait ecrire un `.tscn` avec son TileMap deja rempli, ou une scene
 * Unity avec ses GameObjects. Ce serait plus impressionnant a l'ouverture, et
 * ce serait fragile : le contenu binaire d'un TileMap Godot a change entre 4.2
 * et 4.3, un fichier Unity demande des GUID de meta que rien ne nous autorise
 * a inventer. Un export qui casse a la version suivante du moteur d'accueil
 * est pire qu'un export honnete.
 *
 * Le paquet porte donc les DONNEES — un JSON, des PNG — et le CODE qui les
 * lit, dans la langue du moteur. Les API d'execution (`TileSet.new()`,
 * `Sprite2D`) sont stables depuis des annees, la ou les formats de fichier ne
 * le sont pas. Ce qu'on perd : la carte n'est pas visible dans l'editeur
 * d'accueil avant de lancer. Ce qu'on gagne : ca marche, et ca marchera encore.
 *
 * Pour qui veut des ressources natives et editables, l'export Tiled existe :
 * Godot comme Unity savent l'importer, et c'est le chemin que ces moteurs
 * eux-memes recommandent.
 */

/**
 * Les sons et les musiques, en WAV, communs aux deux cibles.
 *
 * Le projet les garde en donnees — six nombres — parce que ca se relit et se
 * regle. Godot et Unity, eux, ne savent pas synthetiser une onde carree : ils
 * savent lire un fichier. L'export TRADUIT donc, exactement comme il rend des
 * PNG la ou le projet garde des lettres. Le fichier de projet part aussi dans
 * l'archive, si bien qu'un aller-retour reste possible.
 */
function sons(p: ProjetSerialise, dossier: string): Entree[] {
  const sortie: Entree[] = []
  for (const s of p.sons ?? []) {
    sortie.push({
      chemin: `${dossier}/${s.nom}.wav`,
      contenu: encoderWav(rendreSon(s, 44100), 44100),
    })
  }
  for (const m of p.musiques ?? []) {
    sortie.push({
      chemin: `${dossier}/musique-${m.nom}.wav`,
      contenu: encoderWav(rendreMusique(m, 44100), 44100),
    })
  }
  return sortie
}

/** Les PNG des planches, communs aux deux cibles. */
function planches(p: ProjetSerialise, dossier: string): Entree[] {
  return p.planches.map((t) => {
    const img = planchePixels(t.dessins, t.cle, t.largeurCase, t.hauteurCase, t.colonnes)
    return {
      chemin: `${dossier}/${t.nom}.png`,
      contenu: encoderPng(img.largeur, img.hauteur, img.pixels),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Godot 4                                                             */
/* ------------------------------------------------------------------ */

function projetGodot(p: ProjetSerialise): string {
  return `; Projet Godot engendre par PixelForge Engine.
; Les reglages ci-dessous ne sont pas des gouts : ce sont ceux sans lesquels
; un jeu en pixel art ne ressemble pas a ce qu'on a dessine.

config_version=5

[application]

config/name="${p.nom}"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.3", "GL Compatibility")

[display]

; La resolution du jeu, et non celle de la fenetre : c'est le contrat.
window/size/viewport_width=${p.vue.largeur}
window/size/viewport_height=${p.vue.hauteur}
window/size/window_width_override=${p.vue.largeur * 3}
window/size/window_height_override=${p.vue.hauteur * 3}
; "integer" et non "canvas_items" : une echelle fractionnaire fait onduler la
; grille de pixels, et c'est exactement ce que tout le moteur evite.
window/stretch/mode="viewport"
window/stretch/aspect="keep"

[rendering]

; Sans cela, Godot lisse les textures et tout le pixel art devient flou.
textures/canvas_textures/default_texture_filter=0
renderer/rendering_method="gl_compatibility"
`
}

function sceneGodot(): string {
  return `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://pixelforge.gd" id="1_pf"]

[node name="Jeu" type="Node2D"]
script = ExtResource("1_pf")
`
}

function scriptGodot(p: ProjetSerialise): string {
  const carte = p.cartes[0]
  const plancheCarte = p.planches.find((t) => t.nom === carte?.nom) ?? p.planches[0]
  return `extends Node2D
## Charge un projet PixelForge et le construit a l'execution.
##
## On batit le TileSet et les entites par code plutot que de livrer des
## ressources deja faites : les API d'execution de Godot sont stables depuis
## des annees, la ou le contenu binaire d'un TileMap a change entre 4.2 et 4.3.
## Un export qui casse a la version suivante est pire qu'un export honnete.

const Chargeur := preload("res://projet_charge.gd")

@export var chemin_projet: String = "res://projet.json"
@export var nom_carte: String = "${carte?.nom ?? ''}"
@export var planche_carte: String = "${plancheCarte?.nom ?? ''}"

var projet: Chargeur

func _ready() -> void:
	projet = Chargeur.charger(chemin_projet)
	if projet == null:
		push_error("PixelForge : projet illisible")
		return
	var carte := _carte(nom_carte)
	if carte.is_empty():
		push_error("PixelForge : carte introuvable")
		return
	_batir_decor(carte)
	_batir_entites()

func _carte(nom: String) -> Dictionary:
	for c in projet.cartes:
		if c.get("nom", "") == nom:
			return c
	return projet.cartes[0] if projet.cartes.size() > 0 else {}

## Le TileSet, construit depuis la planche. Une tuile par case de la planche,
## dans le meme ordre : c'est ce qui fait que l'index d'une tuile veut dire la
## meme chose des deux cotes.
func _tileset(planche: Dictionary) -> TileSet:
	var lc: int = planche.get("largeurCase", 16)
	var hc: int = planche.get("hauteurCase", 16)
	var colonnes: int = planche.get("colonnes", 8)
	var nombre: int = planche.get("dessins", []).size()

	var ts := TileSet.new()
	ts.tile_size = Vector2i(lc, hc)
	var source := TileSetAtlasSource.new()
	source.texture = load("res://planches/%s.png" % planche.get("nom", ""))
	source.texture_region_size = Vector2i(lc, hc)
	for i in range(nombre):
		source.create_tile(Vector2i(i % colonnes, i / colonnes))
	ts.add_source(source, 0)
	return ts

func _batir_decor(carte: Dictionary) -> void:
	var planche := projet.planche(planche_carte)
	if planche.is_empty():
		push_error("PixelForge : planche de carte introuvable")
		return
	var colonnes: int = planche.get("colonnes", 8)
	var ts := _tileset(planche)
	var largeur: int = carte.get("largeur", 0)

	for calque in carte.get("calques", []):
		var couche := TileMapLayer.new()
		couche.name = calque.get("nom", "calque")
		couche.tile_set = ts
		add_child(couche)
		var cases := Chargeur.deplier_cases(carte, calque)
		for i in range(cases.size()):
			var t: int = cases[i]
			# Le vide vaut moins un, et non zero : zero est une vraie tuile.
			if t == Chargeur.VIDE:
				continue
			couche.set_cell(Vector2i(i % largeur, i / largeur), 0,
				Vector2i(t % colonnes, t / colonnes))

## Les entites : un Sprite2D par noeud qui porte une espece. La region de la
## texture se calcule depuis l'index de son image — c'est la meme arithmetique
## que la planche, et elle doit tomber juste des deux cotes.
func _batir_entites() -> void:
	if projet.scenes.is_empty():
		return
	_parcourir(projet.scenes[0].get("racine", {}))

func _parcourir(noeud: Dictionary) -> void:
	var id_espece = noeud.get("espece", "")
	if typeof(id_espece) == TYPE_STRING and id_espece != "":
		var e := projet.espece(id_espece)
		if not e.is_empty():
			_poser_entite(noeud, e)
	for enfant in noeud.get("enfants", []):
		_parcourir(enfant)

func _poser_entite(noeud: Dictionary, e: Dictionary) -> void:
	var planche := projet.planche(e.get("planche", ""))
	if planche.is_empty():
		return
	var lc: int = planche.get("largeurCase", 16)
	var hc: int = planche.get("hauteurCase", 16)
	var colonnes: int = planche.get("colonnes", 8)
	var index: int = int(noeud.get("image", 0))

	var s := Sprite2D.new()
	s.name = noeud.get("nom", "entite")
	s.texture = load("res://planches/%s.png" % planche.get("nom", ""))
	s.region_enabled = true
	s.region_rect = Rect2(
		(index % colonnes) * lc, (index / colonnes) * hc, lc, hc)
	# L'ancre du moteur est aux pieds ; celle de Godot est au centre. Sans ce
	# decalage, chaque entite flotte d'une demi-case au-dessus du sol.
	s.centered = false
	s.position = Vector2(
		noeud.get("x", 0) - e.get("ancreX", lc / 2.0),
		noeud.get("y", 0) - e.get("ancreY", hc))
	s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(s)
`
}

function lisezMoiGodot(p: ProjetSerialise): string {
  return `# ${p.nom} — projet Godot

Engendre par PixelForge Engine. Godot **4.3 ou plus recent**.

1. Ouvrez ce dossier avec Godot (« Importer », puis choisissez \`project.godot\`).
2. Lancez. \`main.tscn\` charge \`projet.json\` et construit la carte et les
   entites a l'execution.

## Ce que vous trouverez

| Fichier | Ce que c'est |
| --- | --- |
| \`projet.json\` | toutes les donnees : cartes, collision, scene, palette, clips, especes, projection |
| \`planches/*.png\` | les dessins, une planche par fichier |
| \`projet_charge.gd\` | le chargeur : lit le JSON et donne des accesseurs |
| \`pixelforge.gd\` | construit le TileSet, la carte et les entites |

## Pourquoi la carte n'est pas deja dans une ressource

Le contenu binaire d'un TileMap Godot a change entre 4.2 et 4.3. Un export qui
ecrit ce binaire casse a la version suivante ; un export qui appelle les API
d'execution — stables depuis des annees — continue de marcher. Le prix est que
la carte n'apparait qu'au lancement.

Si vous voulez des ressources natives et editables dans l'editeur de Godot,
exportez plutot au format **Tiled** : Godot sait l'importer, et c'est le chemin
que Godot lui-meme recommande.

## Le contrat de pixel

\`project.godot\` fixe deja ce qu'il faut : la resolution du jeu, l'etirement
par viewport, et le filtre de texture au plus proche. Ne les changez pas sans
raison — c'est ce qui empeche la grille de pixels d'onduler.
`
}

export function paquetGodot(p: ProjetSerialise): Entree[] {
  return [
    { chemin: 'project.godot', contenu: versOctets(projetGodot(p)) },
    { chemin: 'main.tscn', contenu: versOctets(sceneGodot()) },
    { chemin: 'pixelforge.gd', contenu: versOctets(scriptGodot(p)) },
    { chemin: 'projet_charge.gd', contenu: versOctets(chargeur('gdscript', p)) },
    { chemin: 'projet.json', contenu: versOctets(versTexte(p)) },
    { chemin: 'LISEZMOI.md', contenu: versOctets(lisezMoiGodot(p)) },
    ...planches(p, 'planches'),
    ...sons(p, 'sons'),
  ]
}

/* ------------------------------------------------------------------ */
/* Unity                                                               */
/* ------------------------------------------------------------------ */

function scriptUnity(p: ProjetSerialise): string {
  const carte = p.cartes[0]
  return `using System.Collections.Generic;
using UnityEngine;
using PixelForge;

/// <summary>
/// Charge un projet PixelForge et le construit a l'execution.
///
/// Comme pour Godot, on batit par code plutot que de livrer des ressources :
/// un asset Unity demande un GUID de meta que rien ne nous autorise a
/// inventer, et un GUID invente casse les references a la premiere
/// reimportation.
/// </summary>
public class PixelForgeChargeur : MonoBehaviour
{
    [Tooltip("Le JSON du projet, glisse depuis Assets/PixelForge/.")]
    public TextAsset projetJson;

    [Tooltip("Une texture par planche, dans l'ordre du projet.")]
    public List<Texture2D> planches = new List<Texture2D>();

    [Tooltip("Pixels par unite. Prenez la taille de vos tuiles.")]
    public int pixelsParUnite = ${carte?.tuile ?? 16};

    private Projet projet;

    void Start()
    {
        if (projetJson == null)
        {
            Debug.LogError("PixelForge : aucun JSON assigne.");
            return;
        }
        projet = JsonUtility.FromJson<Projet>(projetJson.text);
        BatirDecor();
        BatirEntites();
    }

    private Texture2D TexturePour(string nom)
    {
        foreach (var t in planches) if (t != null && t.name == nom) return t;
        return planches.Count > 0 ? planches[0] : null;
    }

    private Sprite Decouper(Planche planche, int index)
    {
        var texture = TexturePour(planche.nom);
        if (texture == null) return null;
        int colonnes = planche.colonnes;
        int lc = planche.largeurCase, hc = planche.hauteurCase;
        // Unity compte les Y depuis le BAS de la texture, le format depuis le
        // haut. Sans cette inversion, toute la planche est lue a l'envers.
        int rangee = index / colonnes;
        int rangees = Mathf.Max(1, Mathf.CeilToInt(planche.dessins.Count / (float)colonnes));
        var rect = new Rect((index % colonnes) * lc, (rangees - 1 - rangee) * hc, lc, hc);
        return Sprite.Create(texture, rect, new Vector2(0f, 0f), pixelsParUnite);
    }

    private void BatirDecor()
    {
        if (projet.cartes.Count == 0) return;
        var carte = projet.cartes[0];
        var planche = projet.Planche(carte.nom) ?? projet.planches[0];
        for (int c = 0; c < carte.calques.Count; c++)
        {
            var calque = carte.calques[c];
            var cases = carte.DeplierCases(calque);
            var parent = new GameObject(calque.nom);
            parent.transform.SetParent(transform, false);
            for (int i = 0; i < cases.Length; i++)
            {
                if (cases[i] == Projet.VIDE) continue;
                var go = new GameObject("t" + i);
                go.transform.SetParent(parent.transform, false);
                var sr = go.AddComponent<SpriteRenderer>();
                sr.sprite = Decouper(planche, cases[i]);
                sr.sortingOrder = c;
                int x = i % carte.largeur, y = i / carte.largeur;
                // Le monde du format descend, celui d'Unity monte.
                go.transform.localPosition = new Vector3(
                    x * carte.tuile / (float)pixelsParUnite,
                    -y * carte.tuile / (float)pixelsParUnite, 0f);
            }
        }
    }

    private void BatirEntites()
    {
        if (projet.scenes.Count == 0) return;
        Parcourir(projet.scenes[0].racine);
    }

    private void Parcourir(Noeud n)
    {
        if (n == null) return;
        // JsonUtility ne sait pas lire un dictionnaire libre — c'est pour cela
        // que le format remonte l'espece et l'image a cote des champs communs.
        if (!string.IsNullOrEmpty(n.espece))
        {
            var e = projet.Espece(n.espece);
            if (e != null) Poser(n, e);
        }
        if (n.enfants != null) foreach (var f in n.enfants) Parcourir(f);
    }

    private void Poser(Noeud n, Espece e)
    {
        var planche = projet.Planche(e.planche);
        if (planche == null) return;
        var go = new GameObject(n.nom);
        go.transform.SetParent(transform, false);
        var sr = go.AddComponent<SpriteRenderer>();
        sr.sprite = Decouper(planche, n.image);
        sr.sortingOrder = 100;
        go.transform.localPosition = new Vector3(
            (n.x - e.ancreX) / (float)pixelsParUnite,
            -(n.y - e.ancreY) / (float)pixelsParUnite, 0f);
    }
}
`
}

function lisezMoiUnity(p: ProjetSerialise): string {
  return `# ${p.nom} — pour Unity

Engendre par PixelForge Engine.

1. Copiez ce dossier dans \`Assets/\` de votre projet Unity.
2. Selectionnez les PNG de \`planches/\` et reglez l'importation :
   **Texture Type: Sprite**, **Filter Mode: Point (no filter)**,
   **Compression: None**. Sans ces trois-la, Unity lisse et compresse vos
   pixels, et le dessin ne ressemble plus a ce que vous avez fait.
3. Posez \`PixelForgeChargeur\` sur un GameObject vide, glissez-y
   \`projet.json\` et les textures.
4. Lancez.

## Ce que vous trouverez

| Fichier | Ce que c'est |
| --- | --- |
| \`projet.json\` | toutes les donnees du projet |
| \`planches/*.png\` | les dessins |
| \`ProjetPixelForge.cs\` | les structures et les accesseurs |
| \`PixelForgeChargeur.cs\` | construit le decor et les entites a l'execution |

## Deux inversions a connaitre

Unity compte les Y depuis le BAS d'une texture et vers le HAUT dans le monde ;
le format fait l'inverse des deux. Le chargeur s'en occupe — c'est ecrit dans
son code, a l'endroit ou ca se produit. Si vous ecrivez le votre, ce sont les
deux fautes que vous ferez.

## Et pour des tuiles natives

Unity a un systeme de Tilemap et un importateur Tiled (SuperTiled2Unity, Tiled
to Unity). L'export **Tiled** de PixelForge y entre directement, et vous
donnera des ressources editables dans l'editeur. Le present paquet vise autre
chose : ne rien demander a installer.

Version du format : ${p.version}.
`
}

export function paquetUnity(p: ProjetSerialise): Entree[] {
  return [
    { chemin: 'PixelForgeChargeur.cs', contenu: versOctets(scriptUnity(p)) },
    { chemin: 'ProjetPixelForge.cs', contenu: versOctets(chargeur('csharp', p)) },
    { chemin: 'projet.json', contenu: versOctets(versTexte(p)) },
    { chemin: 'LISEZMOI.md', contenu: versOctets(lisezMoiUnity(p)) },
    ...sons(p, 'Sons'),
    ...planches(p, 'planches'),
  ]
}

export const PAQUETS: { id: string; nom: string; fichier: string; note: string }[] = [
  {
    id: 'godot',
    nom: 'Projet Godot 4 (.zip)',
    fichier: 'godot.zip',
    note: 'Un projet qui s’ouvre et se lance. Godot 4.3 ou plus récent.',
  },
  {
    id: 'unity',
    nom: 'Dossier Unity (.zip)',
    fichier: 'unity.zip',
    note: 'À copier dans Assets/. Réglez les PNG en Point (no filter).',
  },
]
