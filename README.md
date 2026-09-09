# PixelForge Engine

Un éditeur de jeux 2D **fait pour le pixel art**, de bout en bout.

Ce n'est pas un moteur généraliste avec un mode pixel art. C'est l'inverse : la
grille de pixels est le contrat de base, et tout le reste s'y plie.

## Ce que ça veut dire concrètement

- **Tout est en pixels entiers.** Positions, caméra, échelle. Ce qui a besoin de
  précision — une vitesse, une accélération — la garde dans un accumulateur et
  ne se pose sur la grille qu'au dernier moment. Un objet à 0,4 px par image
  avance d'un pixel toutes les deux ou trois images, ce qu'on voit dans les jeux
  de cette époque, au lieu de glisser en sous-pixel.
- **L'échelle est entière, toujours.** 320×180 dans une fenêtre de 1280×800
  donne ×4, pas ×4,44. On préfère des bandes noires à une grille qui ondule.
- **Rien n'est interpolé.** Jamais.
- **La palette est verrouillée pour tout le projet**, et une règle refuse tout
  asset qui en sort.
- **Les collisions se dérivent du dessin**, elles ne se redessinent pas à la
  main.

## Tous les langages

L'éditeur possède les **données** — scènes, tilemaps, sprites, animations — dans
un format ouvert, texte et diffable. Chaque langage cible reçoit un **chargeur
typé généré**. Un runtime de référence en TypeScript fait tourner le jeu dans
l'éditeur, pour que « Play » réponde tout de suite.

Un onglet de navigateur ne peut pas exécuter du C++ ni du Rust ; prétendre le
contraire serait malhonnête. Ce qu'il peut faire, c'est produire des données que
n'importe quel langage lit, et le code pour les lire.

## État

En construction. Le contrat de pixel est posé et testé.

Petit frère de [PixelForge](https://github.com/jules-crevoisier/sprite),
l'éditeur de sprites.
