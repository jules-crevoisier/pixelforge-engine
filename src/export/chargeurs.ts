import type { ProjetSerialise } from './format.ts'

/**
 * Les chargeurs generes, un par langage.
 *
 * ## Ce que « marche avec tous les langages » veut dire, honnetement
 *
 * Un onglet de navigateur ne peut pas executer du C++ ni du Rust, et pretendre
 * le contraire serait un mensonge. Ce qu'il peut faire, c'est produire des
 * DONNEES que n'importe quel langage lit, et LE CODE POUR LES LIRE.
 *
 * Le chargeur genere n'est pas un moteur : c'est la structure de donnees du
 * projet, ecrite dans la langue de la cible, plus la lecture du JSON. Le
 * gameplay reste ecrit par la personne, dans son langage, avec ses outils. Ce
 * qu'on lui epargne, c'est de retaper a la main la forme de chaque carte et de
 * chaque noeud — et de se tromper d'un index en le faisant.
 *
 * ## Pourquoi generer plutot que fournir une bibliotheque
 *
 * Une bibliotheque par langage, c'est six depots a maintenir, six versions qui
 * se desynchronisent, et six occasions qu'un champ ajoute ici manque la-bas.
 * Un generateur n'a qu'une source : le format. Ajouter un champ le fait
 * apparaitre dans les six chargeurs le jour meme.
 */
export type Cible = 'typescript' | 'csharp' | 'gdscript' | 'rust' | 'lua' | 'python'

export const CIBLES: { id: Cible; nom: string; fichier: string; note: string }[] = [
  { id: 'typescript', nom: 'TypeScript', fichier: 'projet.ts',
    note: 'Types stricts, lecture directe du JSON.' },
  { id: 'csharp', nom: 'C# (Unity)', fichier: 'Projet.cs',
    note: 'Classes serialisables, lisibles par JsonUtility ou System.Text.Json.' },
  { id: 'gdscript', nom: 'GDScript (Godot)', fichier: 'projet.gd',
    note: 'Un RefCounted par structure, charge avec JSON.parse_string.' },
  { id: 'rust', nom: 'Rust', fichier: 'projet.rs',
    note: 'Structures derivant Deserialize, pour serde_json.' },
  { id: 'lua', nom: 'Lua (LÖVE)', fichier: 'projet.lua',
    note: 'Table simple ; le decodage JSON reste a votre charge.' },
  { id: 'python', nom: 'Python', fichier: 'projet.py',
    note: 'Dataclasses, construites depuis json.load.' },
]

const ENTETE = (langue: string, commentaire: string): string =>
  `${commentaire} Genere par PixelForge Engine — ne pas modifier a la main.\n`
  + `${commentaire} Ce fichier decrit la FORME du projet, pas son contenu :\n`
  + `${commentaire} il se regenere quand le format change, et vos donnees ne\n`
  + `${commentaire} bougent pas. Le gameplay reste a vous, en ${langue}.\n\n`

/** Le chargeur, dans la langue demandee. */
export function chargeur(cible: Cible, p: ProjetSerialise): string {
  switch (cible) {
    case 'typescript': return chargeurTypeScript()
    case 'csharp': return chargeurCSharp()
    case 'gdscript': return chargeurGDScript()
    case 'rust': return chargeurRust()
    case 'lua': return chargeurLua(p)
    case 'python': return chargeurPython()
  }
}

function chargeurTypeScript(): string {
  return `${ENTETE('TypeScript', '//')}export interface Calque {
  nom: string
  visible: boolean
  devant: boolean
  /** Une chaine par rangee, index de tuile separes par des virgules. */
  cases: string[]
  terrain: { tuileDepart: number; jeu: string; dehorsEstPlein: boolean } | null
  presence: string[] | null
}

export interface Carte {
  nom: string
  largeur: number
  hauteur: number
  tuile: number
  calques: Calque[]
  /** Une chaine par rangee, 0 ou 1 colles. */
  solides: string[]
}

export interface Noeud {
  id: string
  nom: string
  type: string
  x: number
  y: number
  visible: boolean
  script: string | null
  proprietes: Record<string, unknown>
  enfants: Noeud[]
}

export interface Projet {
  version: number
  nom: string
  vue: { largeur: number; hauteur: number }
  palette: { nom: string; couleurs: string[] }
  cartes: Carte[]
  scenes: { nom: string; racine: Noeud }[]
}

/** Une case vide. Zero est une vraie tuile : ne pas les confondre. */
export const VIDE = -1

export function chargerProjet(texte: string): Projet {
  return JSON.parse(texte) as Projet
}

/** Deplie un calque en tableau plat, indexe par y * largeur + x. */
export function deplierCases(c: Carte, calque: Calque): Int32Array {
  const out = new Int32Array(c.largeur * c.hauteur)
  calque.cases.forEach((ligne, y) => {
    const vals = ligne.length ? ligne.split(',') : []
    for (let x = 0; x < vals.length; x++) out[y * c.largeur + x] = Number(vals[x])
  })
  return out
}

export function deplierSolides(c: Carte): Uint8Array {
  const out = new Uint8Array(c.largeur * c.hauteur)
  c.solides.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) out[y * c.largeur + x] = ligne[x] === '1' ? 1 : 0
  })
  return out
}
`
}

function chargeurCSharp(): string {
  return `${ENTETE('C#', '//')}using System;
using System.Collections.Generic;

namespace PixelForge
{
    [Serializable]
    public class Calque
    {
        public string nom;
        public bool visible;
        public bool devant;
        /// <summary>Une chaine par rangee, index separes par des virgules.</summary>
        public List<string> cases;
        public Terrain terrain;
        public List<string> presence;
    }

    [Serializable]
    public class Terrain
    {
        public int tuileDepart;
        public string jeu;
        public bool dehorsEstPlein;
    }

    [Serializable]
    public class Carte
    {
        public string nom;
        public int largeur;
        public int hauteur;
        public int tuile;
        public List<Calque> calques;
        /// <summary>Une chaine par rangee, 0 ou 1 colles.</summary>
        public List<string> solides;

        /// <summary>Deplie un calque en tableau plat, indexe par y * largeur + x.</summary>
        public int[] DeplierCases(Calque calque)
        {
            var sortie = new int[largeur * hauteur];
            for (int y = 0; y < calque.cases.Count; y++)
            {
                var ligne = calque.cases[y];
                if (ligne.Length == 0) continue;
                var parts = ligne.Split(',');
                for (int x = 0; x < parts.Length; x++)
                    sortie[y * largeur + x] = int.Parse(parts[x]);
            }
            return sortie;
        }

        public bool Solide(int cx, int cy)
        {
            if (cx < 0 || cy < 0 || cx >= largeur || cy >= hauteur) return true;
            return solides[cy][cx] == '1';
        }
    }

    [Serializable]
    public class Noeud
    {
        public string id;
        public string nom;
        public string type;
        public int x;
        public int y;
        public bool visible;
        public string script;
        public List<Noeud> enfants;
    }

    [Serializable]
    public class Scene
    {
        public string nom;
        public Noeud racine;
    }

    [Serializable]
    public class Palette
    {
        public string nom;
        public List<string> couleurs;
    }

    [Serializable]
    public class Vue
    {
        public int largeur;
        public int hauteur;
    }

    [Serializable]
    public class Projet
    {
        public int version;
        public string nom;
        public Vue vue;
        public Palette palette;
        public List<Carte> cartes;
        public List<Scene> scenes;

        /// <summary>Une case vide. Zero est une vraie tuile.</summary>
        public const int VIDE = -1;
    }
}
`
}

function chargeurGDScript(): string {
  return `${ENTETE('GDScript', '#')}extends RefCounted
class_name ProjetPixelForge

## Une case vide. Zero est une vraie tuile : ne pas les confondre.
const VIDE := -1

var version: int = 0
var nom: String = ""
var vue: Dictionary = {}
var palette: Dictionary = {}
var cartes: Array = []
var scenes: Array = []

static func charger(chemin: String) -> ProjetPixelForge:
	var f := FileAccess.open(chemin, FileAccess.READ)
	if f == null:
		push_error("Projet introuvable : %s" % chemin)
		return null
	var brut = JSON.parse_string(f.get_as_text())
	if typeof(brut) != TYPE_DICTIONARY:
		push_error("Projet illisible : %s" % chemin)
		return null
	var p := ProjetPixelForge.new()
	p.version = brut.get("version", 0)
	p.nom = brut.get("nom", "")
	p.vue = brut.get("vue", {})
	p.palette = brut.get("palette", {})
	p.cartes = brut.get("cartes", [])
	p.scenes = brut.get("scenes", [])
	return p

## Deplie un calque en PackedInt32Array, indexe par y * largeur + x.
static func deplier_cases(carte: Dictionary, calque: Dictionary) -> PackedInt32Array:
	var largeur: int = carte.get("largeur", 0)
	var hauteur: int = carte.get("hauteur", 0)
	var sortie := PackedInt32Array()
	sortie.resize(largeur * hauteur)
	var lignes: Array = calque.get("cases", [])
	for y in range(min(lignes.size(), hauteur)):
		var ligne: String = lignes[y]
		if ligne.is_empty():
			continue
		var parts := ligne.split(",")
		for x in range(min(parts.size(), largeur)):
			sortie[y * largeur + x] = int(parts[x])
	return sortie

static func est_solide(carte: Dictionary, cx: int, cy: int) -> bool:
	var largeur: int = carte.get("largeur", 0)
	var hauteur: int = carte.get("hauteur", 0)
	if cx < 0 or cy < 0 or cx >= largeur or cy >= hauteur:
		return true
	var lignes: Array = carte.get("solides", [])
	if cy >= lignes.size():
		return true
	var ligne: String = lignes[cy]
	return cx < ligne.length() and ligne[cx] == "1"
`
}

function chargeurRust(): string {
  return `${ENTETE('Rust', '//')}use serde::Deserialize;

/// Une case vide. Zero est une vraie tuile : ne pas les confondre.
pub const VIDE: i32 = -1;

#[derive(Debug, Clone, Deserialize)]
pub struct Terrain {
    pub tuile_depart: i32,
    pub jeu: String,
    pub dehors_est_plein: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Calque {
    pub nom: String,
    pub visible: bool,
    pub devant: bool,
    /// Une chaine par rangee, index separes par des virgules.
    pub cases: Vec<String>,
    pub terrain: Option<Terrain>,
    pub presence: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Carte {
    pub nom: String,
    pub largeur: i32,
    pub hauteur: i32,
    pub tuile: i32,
    pub calques: Vec<Calque>,
    /// Une chaine par rangee, 0 ou 1 colles.
    pub solides: Vec<String>,
}

impl Carte {
    /// Deplie un calque en vecteur plat, indexe par y * largeur + x.
    pub fn deplier_cases(&self, calque: &Calque) -> Vec<i32> {
        let mut sortie = vec![VIDE; (self.largeur * self.hauteur) as usize];
        for (y, ligne) in calque.cases.iter().enumerate() {
            if ligne.is_empty() {
                continue;
            }
            for (x, v) in ligne.split(',').enumerate() {
                if x < self.largeur as usize {
                    sortie[y * self.largeur as usize + x] = v.parse().unwrap_or(VIDE);
                }
            }
        }
        sortie
    }

    pub fn est_solide(&self, cx: i32, cy: i32) -> bool {
        if cx < 0 || cy < 0 || cx >= self.largeur || cy >= self.hauteur {
            return true;
        }
        self.solides
            .get(cy as usize)
            .and_then(|l| l.as_bytes().get(cx as usize))
            .map(|b| *b == b'1')
            .unwrap_or(true)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Noeud {
    pub id: String,
    pub nom: String,
    #[serde(rename = "type")]
    pub type_noeud: String,
    pub x: i32,
    pub y: i32,
    pub visible: bool,
    pub script: Option<String>,
    pub enfants: Vec<Noeud>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Scene {
    pub nom: String,
    pub racine: Noeud,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Vue {
    pub largeur: i32,
    pub hauteur: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Palette {
    pub nom: String,
    pub couleurs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Projet {
    pub version: i32,
    pub nom: String,
    pub vue: Vue,
    pub palette: Palette,
    pub cartes: Vec<Carte>,
    pub scenes: Vec<Scene>,
}

impl Projet {
    pub fn charger(texte: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(texte)
    }
}
`
}

function chargeurLua(p: ProjetSerialise): string {
  return `${ENTETE('Lua', '--')}-- Ce chargeur attend une table deja decodee depuis le JSON.
-- LOVE n'embarque pas de decodeur : prenez dkjson, rxi/json.lua, ou celui
-- de votre choix. On ne le fournit pas ici pour ne pas vous imposer une
-- dependance que vous avez peut-etre deja.

local Projet = {}
Projet.__index = Projet

-- Une case vide. Zero est une vraie tuile : ne pas les confondre.
Projet.VIDE = -1
Projet.VERSION_ATTENDUE = ${p.version}

function Projet.depuis(donnees)
  local self = setmetatable({}, Projet)
  self.version = donnees.version or 0
  self.nom = donnees.nom or ""
  self.vue = donnees.vue or { largeur = 320, hauteur = 180 }
  self.palette = donnees.palette or { nom = "", couleurs = {} }
  self.cartes = donnees.cartes or {}
  self.scenes = donnees.scenes or {}
  if self.version ~= Projet.VERSION_ATTENDUE then
    print(("PixelForge : projet en version %d, chargeur en version %d")
      :format(self.version, Projet.VERSION_ATTENDUE))
  end
  return self
end

-- Deplie un calque en table plate, indexee de 1 a largeur * hauteur.
function Projet.deplier_cases(carte, calque)
  local sortie = {}
  for i = 1, carte.largeur * carte.hauteur do sortie[i] = Projet.VIDE end
  for y, ligne in ipairs(calque.cases or {}) do
    local x = 0
    for v in tostring(ligne):gmatch("[^,]+") do
      if x < carte.largeur then
        sortie[(y - 1) * carte.largeur + x + 1] = tonumber(v) or Projet.VIDE
      end
      x = x + 1
    end
  end
  return sortie
end

function Projet.est_solide(carte, cx, cy)
  if cx < 0 or cy < 0 or cx >= carte.largeur or cy >= carte.hauteur then
    return true
  end
  local ligne = (carte.solides or {})[cy + 1]
  if not ligne then return true end
  return ligne:sub(cx + 1, cx + 1) == "1"
end

return Projet
`
}

function chargeurPython(): string {
  return `${ENTETE('Python', '#')}from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# Une case vide. Zero est une vraie tuile : ne pas les confondre.
VIDE = -1


@dataclass
class Terrain:
    tuileDepart: int
    jeu: str
    dehorsEstPlein: bool


@dataclass
class Calque:
    nom: str
    visible: bool
    devant: bool
    cases: list[str]
    terrain: Terrain | None = None
    presence: list[str] | None = None


@dataclass
class Carte:
    nom: str
    largeur: int
    hauteur: int
    tuile: int
    calques: list[Calque] = field(default_factory=list)
    solides: list[str] = field(default_factory=list)

    def deplier_cases(self, calque: Calque) -> list[int]:
        """Deplie un calque en liste plate, indexee par y * largeur + x."""
        sortie = [VIDE] * (self.largeur * self.hauteur)
        for y, ligne in enumerate(calque.cases):
            if not ligne:
                continue
            for x, v in enumerate(ligne.split(",")):
                if x < self.largeur:
                    sortie[y * self.largeur + x] = int(v)
        return sortie

    def est_solide(self, cx: int, cy: int) -> bool:
        if cx < 0 or cy < 0 or cx >= self.largeur or cy >= self.hauteur:
            return True
        if cy >= len(self.solides):
            return True
        ligne = self.solides[cy]
        return cx < len(ligne) and ligne[cx] == "1"


@dataclass
class Noeud:
    id: str
    nom: str
    type: str
    x: int
    y: int
    visible: bool
    script: str | None = None
    proprietes: dict[str, Any] = field(default_factory=dict)
    enfants: list["Noeud"] = field(default_factory=list)


def _noeud(d: dict[str, Any]) -> Noeud:
    return Noeud(
        id=d["id"], nom=d["nom"], type=d["type"], x=d["x"], y=d["y"],
        visible=d["visible"], script=d.get("script"),
        proprietes=d.get("proprietes", {}),
        enfants=[_noeud(e) for e in d.get("enfants", [])],
    )


@dataclass
class Projet:
    version: int
    nom: str
    vue: dict[str, int]
    palette: dict[str, Any]
    cartes: list[Carte] = field(default_factory=list)
    scenes: list[dict[str, Any]] = field(default_factory=list)

    @staticmethod
    def charger(chemin: str) -> "Projet":
        with open(chemin, encoding="utf-8") as f:
            d = json.load(f)
        cartes = [
            Carte(
                nom=c["nom"], largeur=c["largeur"], hauteur=c["hauteur"], tuile=c["tuile"],
                calques=[
                    Calque(
                        nom=l["nom"], visible=l["visible"], devant=l["devant"],
                        cases=l["cases"],
                        terrain=Terrain(**l["terrain"]) if l.get("terrain") else None,
                        presence=l.get("presence"),
                    )
                    for l in c["calques"]
                ],
                solides=c["solides"],
            )
            for c in d.get("cartes", [])
        ]
        scenes = [{"nom": s["nom"], "racine": _noeud(s["racine"])} for s in d.get("scenes", [])]
        return Projet(
            version=d["version"], nom=d["nom"], vue=d["vue"], palette=d["palette"],
            cartes=cartes, scenes=scenes,
        )
`
}
