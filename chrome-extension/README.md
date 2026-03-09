# SKALLE - Extension Chrome Groupes Facebook

Extension pour extraire les membres des groupes Facebook et les importer dans votre dashboard SKALLE pour envoi de DM froids.

## Installation

1. Ouvrez Chrome et allez sur `chrome://extensions/`
2. Activez le "Mode développeur" (en haut à droite)
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier `chrome-extension`

## Configuration

1. Dans le dashboard SKALLE : **Social Prospector** → **Groupes Facebook** → **Générer un token**
2. Copiez le token
3. Cliquez sur l'icône de l'extension dans la barre Chrome
4. Collez le token et cliquez sur "Enregistrer"

## Utilisation

1. Connectez-vous à Facebook
2. Ouvrez un groupe dont vous êtes membre
3. Allez sur la page **Membres** du groupe (`/groups/XXX/members`)
4. Un bouton vert "Importer les membres → SKALLE" apparaît en bas à droite
5. Cliquez pour lancer l'extraction et l'import automatique

## API Base URL

Par défaut l'extension envoie les données à `http://localhost:3000`. Pour la production, modifiez la constante `API_BASE` dans `content.js`.
