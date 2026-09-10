# Évaluation

<!-- Écrit par `npm run agent -- --ecrire`. Ne pas modifier à la main :
     ce fichier est un relevé, pas un document. -->

```

╭─ AGENT D’ÉVALUATION ────────────────────────────────────────────
│ 2026-09-10 · dernier passage 2026-09-10
╰─────────────────────────────────────────────────────────────────

LES ÉPREUVES
  vert   build                    —  2.6 s
  vert   banc                 82/82  0.3 s
  vert   banc:plateforme      40/40  0.3 s
  vert   banc:mondes        203/203  1.3 s
  vert   banc:langages        66/66  1.2 s
  vert   fumee                55/55  27.2 s
  446 vérifications au total, 0 rouge(s)

CE QUE LE PROJET SAIT FAIRE
  Un critère n’est tenu que s’il existe des vérifications qui tomberaient
  sans lui. C’est pourquoi il se lit « n preuves » et non « fait ».

  Celeste — plateforme de précision — 8/8
    ✓ Contrôleur nerveux : coyote, tampon, hauteur variable 5 preuves
    ✓ Dash directionnel, avec récupération                 5 preuves
    ✓ Saut mural et glissade                               11 preuves
    ✓ Correction de coin                                   9 preuves
    ✓ Pointes, mort et point de reprise                    7 preuves
    ✓ Plateformes à sens unique, et descente volontaire    8 preuves
    ✓ Plateformes mobiles qui portent                      9 preuves
    ✓ Niveaux vérifiés franchissables, pas seulement dessinés 7 preuves

  The Binding of Isaac — salles engendrées — 7/7
    ✓ Plan d’étage reproductible depuis une graine         3 preuves
    ✓ Rôles de salle : départ, boss, trésor, boutique      3 preuves
    ✓ Aucune salle injoignable, vérifié case par case      2 preuves
    ✓ Salles écrites à la main, tirées et retournées       6 preuves
    ✓ Caméra verrouillée sur la salle                      13 preuves
    ✓ Tirs, projectiles et ennemis qui annoncent           5 preuves
    ✓ Ramassages et soin                                   2 preuves

  Dead Cells — combat et corps — 6/6
    ✓ Frappes à durée, poussée, invulnérabilité            10 preuves
    ✓ Machines à états par espèce, déclencheurs sur l’image 8 preuves
    ✓ Entités solides : caisses, obstacles mobiles         5 preuves
    ✓ Piétinement et rebond                                8 preuves
    ✓ Pesanteur pour les créatures, en vue de côté         2 preuves
    ✓ Armes et portée réglées, pas devinées                11 preuves

  Faire un jeu sans lire le moteur — 8/8
    ✓ Partir d’un projet vide                              4 preuves
    ✓ Redimensionner la carte, gérer les calques           13 preuves
    ✓ Créer une espèce sans écrire de code                 12 preuves
    ✓ Poser et déplacer une entité à la souris             12 preuves
    ✓ Défaire et refaire, y compris sur les entités        7 preuves
    ✓ Un projet se ferme, se rouvre, se joue               14 preuves
    ✓ Une aide qui dit dans quel ordre s’y prendre         3 preuves
    ✓ Export vers un moteur du commerce                    11 preuves

  Le multijoueur, et ce qu’il exige d’abord — 1/4
    ✓ Simulation à pas fixe, hasard reproductible          3 preuves
    · Entrées déterministes : aucune horloge murale dans la simulation symbole absent : « performance.now » subsiste dans src/runtime/entree.ts
    · Instantané et rejeu de l’état d’un pas               symbole absent : instantane
    · Transport réseau, et remise en phase                 symbole absent : Transport

  Ce qu’un jeu a en plus de son gameplay — 0/5
    · Son : des bruits attachés aux événements d’animation symbole absent : jouerSon
    · Particules et effets                                 symbole absent : Particules
    · Dialogue et texte à l’écran                          symbole absent : Dialogue
    · Sauvegarde de la PARTIE, distincte du projet         symbole absent : sauvegardePartie
    · Écran-titre et menus                                 symbole absent : Menu

CE QU’IL RESTE À FAIRE, DANS L’ORDRE
  À CONSTRUIRE — le code n’existe pas :
    · Entrées déterministes : aucune horloge murale dans la simulation (Le multijoueur, et ce qu’il exige d’abord) — symbole absent : « performance.now » subsiste dans src/runtime/entree.ts
    · Instantané et rejeu de l’état d’un pas (Le multijoueur, et ce qu’il exige d’abord) — symbole absent : instantane
    · Transport réseau, et remise en phase (Le multijoueur, et ce qu’il exige d’abord) — symbole absent : Transport
    · Son : des bruits attachés aux événements d’animation (Ce qu’un jeu a en plus de son gameplay) — symbole absent : jouerSon
    · Particules et effets (Ce qu’un jeu a en plus de son gameplay) — symbole absent : Particules
    · Dialogue et texte à l’écran (Ce qu’un jeu a en plus de son gameplay) — symbole absent : Dialogue
    · Sauvegarde de la PARTIE, distincte du projet (Ce qu’un jeu a en plus de son gameplay) — symbole absent : sauvegardePartie
    · Écran-titre et menus (Ce qu’un jeu a en plus de son gameplay) — symbole absent : Menu

CE QUI A BOUGÉ
  Rien. Ni gagné, ni perdu.

VERDICT : tout est vert · 30/38 critères tenus · 446 vérifications

```
