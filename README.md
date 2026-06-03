# Open-Scraper

Un fork libre, sécurisé et amélioré de la célèbre extension "Instant Data Scraper".

## ⚠️ Contexte : Pourquoi ce projet ?

Avis à tous les enquêteurs et passionnés d’OSINT.

L’extension Chrome très populaire **Instant Data Scraper** vient de changer de mains (passant de *Web Robots* à une entité nommée *Flavr Technology, LP*). Selon Micah Hoffman (@WebBreacher), référence incontournable de la communauté, ce changement de propriétaire rend l’outil « plus du tout sûr » à utiliser.

🚩 **Pourquoi s’inquiéter ?**
- **Changement de propriétaire opaque** : Les extensions rachetées par des tiers sont souvent transformées en vecteurs de collecte de données publicitaires, voire en malwares/spywares.
- **Risque de confidentialité** : En tant qu’outil de scraping, l’extension a accès au contenu des pages que vous visitez. Vos recherches sensibles pourraient être compromises.
- **Avis d’OSINT-FR** : L’alerte venant de Micah Hoffman est prise très au sérieux par la communauté OSINT mondiale.

🔨 **Que faire ?**
1. **DÉSINSTALLEZ** l’extension originale immédiatement de votre navigateur.
2. **VÉRIFIEZ** vos autres extensions : la pratique du rachat d’outils gratuits pour y injecter du code malveillant est courante.

## 🚀 Le Projet : Ce que nous avons mis en place

Face à ce risque pour la sécurité, **Open-Scraper** a été créé en repartant de la base de la version 1.4.1 de l'extension originale, avant son rachat. Nous avons assaini et amélioré le code :

- **Sécurité et Transparence** : Code entièrement ouvert et auditable, garantissant l'absence de collecte de données en arrière-plan.
- **Refactoring** : Nettoyage complet du code source (anciennement très obfusqué) pour le rendre lisible, documenté (JSDoc) et facile à maintenir. Suppression du code mort (stubs).
- **Améliorations de l'Interface (UI/UX)** :
  - Limitation de la largeur maximale des colonnes (200px) pour éviter les tableaux de résultats illisibles (notamment avec de longues URLs).
  - Ajout d'une troncature intelligente du texte (`text-overflow: ellipsis`).
- **Correction de bugs** : Résolution de problèmes critiques liés à la détection automatique des tableaux.

## ⚙️ Setup : Comment installer l'extension

Pour utiliser cette version sécurisée, vous devez l'installer manuellement ("sideloading") sur votre navigateur :

1. **Récupérez le code** :
   - Clonez ce dépôt sur votre machine : `git clone https://github.com/Lygobate/Open-scraper.git`
   - *Ou* téléchargez le code sous forme d'archive ZIP (via le bouton vert "Code" > "Download ZIP" sur GitHub) et décompressez-le.
2. **Ouvrez Chrome** (ou un navigateur basé sur Chromium comme Brave, Edge) et allez à l'adresse : `chrome://extensions/`
3. Activez le **"Mode développeur"** (bouton en haut à droite).
4. Cliquez sur le bouton **"Charger l'extension non empaquetée"** (en haut à gauche).
5. Sélectionnez le dossier extrait qui contient le fichier `manifest.json`.

L'extension Open-Scraper apparaîtra dans votre liste et sera immédiatement fonctionnelle en toute sécurité !