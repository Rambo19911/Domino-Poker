import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesFr: MpRulesDoc = {
  intro: [
    "Ce jeu est très dynamique et exige une bonne compréhension des règles pour pouvoir prendre des décisions en peu de temps. Pour s'entraîner, il est recommandé de jouer en mode Solo.",
    "Le multijoueur de Domino Poker est un jeu de table à quatre places en temps réel. Chaque partie utilise un jeu de dominos double-six standard de 28 tuiles, distribuées à raison de 7 tuiles par place. La partie peut se jouer entre quatre joueurs humains, ou avec un mélange d'humains et de bots. Une partie ne peut commencer que lorsque les quatre places sont occupées et qu'au moins une place est occupée par un joueur humain."
  ],
  sections: [
    {
      title: "Salles publiques et privées",
      blocks: [
        "Les joueurs peuvent créer une salle publique ou privée.",
        "Les salles publiques sont conçues pour être trouvées depuis le salon. Les autres joueurs peuvent les repérer dans la liste des salles, ouvrir la vue de la salle, choisir une place libre et rejoindre tant que la salle attend toujours de démarrer.",
        "Les salles privées sont destinées aux joueurs invités. Elles ont le même état et les mêmes places qu'une salle normale, mais rejoindre une salle privée nécessite le code de la salle. On ne peut pas rejoindre une salle privée simplement en utilisant son identifiant via le flux du salon public. Le code de la salle est affiché dans la vue de la salle et ne doit être partagé qu'avec les joueurs que vous souhaitez inviter.",
        "Les salles publiques et privées prennent en charge les mêmes règles de jeu, le même système de places, la même option de remplissage par bots et le même déroulement de partie. La différence porte sur la découvrabilité et l'accès : les salles publiques se rejoignent depuis le salon ; les salles privées nécessitent le code."
      ]
    },
    {
      title: "Places de la salle et contrôles de l'hôte",
      blocks: [
        "Chaque salle compte exactement quatre places. Le joueur qui crée la salle devient l'hôte et est placé à la première place. Les autres joueurs peuvent occuper les places disponibles tant que la salle est en attente.",
        "L'hôte peut remplir les places vides avec des bots. Cela permet de démarrer une partie même si moins de quatre joueurs humains sont disponibles. L'hôte est aussi le seul joueur qui peut lancer la partie.",
        "Une partie ne peut pas démarrer si une place est encore vide. Si l'hôte tente de démarrer trop tôt, le serveur refuse le démarrage. La règle pratique est simple : quatre places occupées sont requises, par des humains ou des bots.",
        "Si l'hôte quitte alors que la salle est encore en attente, le rôle d'hôte passe à un autre joueur humain restant. S'il ne reste aucun joueur humain dans une salle en attente, la salle est détruite."
      ]
    },
    {
      title: "Pièces d'or et salles payantes",
      blocks: [
        "Les salles peuvent être gratuites ou payantes. Lors de la création d'une salle, un hôte connecté peut fixer des frais d'entrée en or — n'importe quel montant jusqu'à son propre solde (0 signifie une salle gratuite, qui fonctionne exactement comme avant).",
        "Seuls les joueurs inscrits et connectés peuvent prendre une place dans une salle payante : ils possèdent un solde d'or. Les joueurs anonymes n'ont pas de portefeuille, ils ne peuvent donc pas rejoindre les salles payantes, mais ils peuvent toujours rejoindre les salles gratuites.",
        "Chaque joueur paie les frais d'entrée au moment où il prend une place, y compris l'hôte. Une place ne peut être prise que si le solde couvre les frais. Les frais collectés forment le pot de la salle.",
        "Avant le début de la partie, l'argent est entièrement remboursable. Si vous quittez votre place alors que la salle est encore en attente, que l'hôte supprime la salle en attente ou que la salle expire avant de démarrer, vos frais d'entrée sont restitués à votre solde.",
        "Une fois la partie commencée, les frais d'entrée ne sont plus remboursables. Quitter, abandonner ou se déconnecter pendant la partie ne restitue pas vos frais — ils restent dans le pot pour les gagnants.",
        "Quand la partie se termine, le pot est partagé entre les deux meilleurs joueurs humains inscrits selon le score total : 70% pour la première place et 30% pour la deuxième. Les bots ne reçoivent jamais de part, et les joueurs qui ont abandonné sont exclus. S'il ne reste qu'un seul humain inscrit, ce joueur remporte tout le pot.",
        "Si tous les humains partent et que la partie est abandonnée sans se terminer, il n'y a pas de gagnant, donc le pot n'est pas distribué.",
        "Le solde que vous voyez se met à jour en direct au fur et à mesure que vous payez, êtes remboursé ou remportez le pot. Le serveur fait toujours autorité sur chaque mouvement de pièces."
      ]
    },
    {
      title: "Une salle à la fois",
      blocks: [
        "Un joueur ne peut être que dans une seule salle à la fois. Si un joueur a déjà créé ou rejoint une salle, le serveur refusera toute tentative de créer une autre salle ou d'en rejoindre une différente jusqu'à ce que ce joueur quitte la salle actuelle, abandonne une partie active, ou que la partie se termine et que la salle soit nettoyée.",
        "Cela empêche une même identité de navigateur d'occuper des places dans plusieurs salles en même temps.",
        "Pour un test local avec plusieurs joueurs humains sur une seule machine, chaque joueur a besoin d'une identité de navigateur distincte, comme des navigateurs différents ou des fenêtres de navigation privée/incognito."
      ]
    },
    {
      title: "Durée de vie de la salle et TTL",
      blocks: [
        "Les salles ont une durée de vie de 1 heure à compter de leur création.",
        "Les salles en attente, en démarrage, terminées ou détruites sont nettoyées une fois leur TTL expiré. Le nettoyage s'exécute périodiquement, de sorte que la suppression peut survenir peu après l'instant exact d'expiration plutôt qu'à la milliseconde précise.",
        "Les salles actives en cours de partie ne sont pas détruites simplement parce que le TTL initial est dépassé. Si une partie est déjà en cours, la salle est autorisée à se terminer. Une fois la partie finie, le serveur délivre le résultat final puis détruit la salle pour que les joueurs soient libres de créer ou de rejoindre une autre salle.",
        "Si tous les joueurs humains se déconnectent d'une partie active, le serveur accorde un court délai de grâce pour la reconnexion. Si aucun humain ne revient pendant ce délai de grâce, la salle abandonnée est détruite."
      ]
    },
    {
      title: "Démarrer la partie",
      blocks: [
        "Quand l'hôte démarre une salle complète, le serveur crée l'état de jeu faisant autorité et envoie à chaque joueur humain assis son propre instantané de partie personnel. Chaque joueur ne reçoit que sa propre main. Les tuiles cachées des adversaires ne sont jamais envoyées aux autres joueurs.",
        "Après que la salle entre en partie, il y a un compte à rebours d'avant-partie de 10 secondes avant le début du premier tour d'annonces. Cela laisse aux joueurs le temps de charger la table avant que le vrai minuteur de tour ne démarre.",
        "Ce compte à rebours d'avant-partie est distinct du minuteur de 10 secondes par tour."
      ]
    },
    {
      title: "Le minuteur de tour de 10 secondes",
      blocks: [
        "Chaque annonce ou coup d'un humain a son propre minuteur de 10 secondes contrôlé par le serveur.",
        "Le minuteur ne démarre que lorsque c'est réellement le tour de ce joueur humain. Si des bots doivent agir avant le prochain humain, le serveur joue d'abord les bots, avec un court délai de rythme, et ne lance qu'ensuite le compte à rebours de 10 secondes du joueur humain. Cela signifie qu'un joueur humain ne perd pas de temps à attendre les animations des bots ou la résolution des tours des bots.",
        "Le serveur fait autorité sur le temps. Le client affiche le compte à rebours, mais c'est le serveur qui décide si une action est arrivée avant l'échéance.",
        "Si un joueur soumet une annonce ou un coup avant l'échéance, l'action est validée et acceptée uniquement si elle est légale.",
        "Si l'action arrive après l'échéance, le serveur la rejette comme trop tardive.",
        "Si le minuteur expire et que le joueur n'a pas agi, le serveur résout automatiquement le tour pour que la partie ne se bloque jamais :",
        {
          list: [
            "Pendant les annonces, l'annonce par dépassement de délai est forcée vers une annonce légale sûre, normalement 0.",
            "Pendant le jeu des tuiles, le serveur choisit et joue un coup légal pour ce joueur.",
            "Si un pli est complété par le coup de dépassement de délai, le serveur détermine le vainqueur du pli et fait avancer la partie."
          ]
        },
        "Les tours manqués à répétition affectent le statut d'inactivité du joueur. Après le premier tour manqué, le joueur est marqué d'un état d'avertissement. Après le deuxième, il est considéré comme inactif. Après le troisième, le jeu automatique est activé pour ce joueur. Un joueur de retour peut reprendre et désactiver le jeu automatique pour retrouver le contrôle manuel."
      ]
    },
    {
      title: "Déconnexions et reconnexions",
      blocks: [
        "Si un joueur se déconnecte pendant une partie, sa place n'est pas retirée immédiatement. La partie continue, et ses tours à venir peuvent être gérés par le système de dépassement de délai s'il ne revient pas à temps.",
        "Quand le joueur se reconnecte avec la même identité de navigateur et le même jeton de reconnexion, le serveur restaure sa salle, sa place, son état de connexion et lui envoie un nouvel instantané personnel. Cet instantané inclut l'état actuel de la partie et, si un tour est actif, l'échéance du tour en cours.",
        "Si un joueur quitte délibérément pendant une partie active, cela est traité comme un abandon. Sa place devient une place de bot, le joueur est renvoyé au salon et ne peut pas reprendre cette même place. Les joueurs restants poursuivent la partie."
      ]
    },
    {
      title: "Annonces et déroulement du jeu",
      blocks: [
        "Chaque manche commence par les annonces. Chaque joueur annonce une fois, en choisissant combien des 7 plis il pense remporter. Les annonces valides vont de 0 à 7.",
        "Une fois toutes les annonces placées, la phase de jeu commence. Les joueurs jouent un domino par pli. Le vainqueur de chaque pli entame le pli suivant.",
        "Le serveur valide chaque coup. Un client peut mettre en évidence les coups possibles par commodité, mais le client ne décide pas de ce qui est légal. Le serveur rejette les coups illégaux, les coups du mauvais joueur, les identifiants de tour périmés et les actions tardives."
      ]
    },
    {
      title: "Règles des tuiles",
      blocks: [
        "Les atouts sont le groupe de tuiles le plus fort. Du plus fort au plus faible, l'ordre des atouts est :",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Les as sont :",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "La tuile 0-6 a un double rôle particulier. Si elle est jouée ou requise comme 0, elle se comporte comme un as. Si elle est déclarée comme 6, elle se comporte comme une tuile 6 ordinaire.",
        "En entamant un pli, un joueur peut entamer avec n'importe quelle tuile. Si la tuile entamée n'est ni un atout ni un double, et qu'elle a deux numéros différents, le joueur doit déclarer quel numéro est demandé.",
        "En suivant un pli :",
        {
          list: [
            "Si un atout a été entamé, les joueurs doivent jouer un atout s'ils en ont un. S'ils ont un atout plus fort que l'atout le plus fort déjà présent dans le pli, ils doivent jouer un atout plus fort.",
            "Si un numéro a été demandé, les joueurs doivent suivre ce numéro avec une tuile non-atout si possible.",
            "S'ils ne peuvent pas suivre le numéro demandé, ils doivent jouer un atout s'ils en ont un.",
            "S'ils ne peuvent pas suivre et n'ont pas d'atout, ils peuvent se défausser de n'importe quelle tuile."
          ]
        }
      ]
    },
    {
      title: "Décompte des points",
      blocks: [
        "Après 7 plis, la manche est décomptée en comparant l'annonce de chaque joueur au nombre de plis qu'il a réellement remportés.",
        {
          list: [
            "Annonce exacte : 15 points par pli annoncé.",
            "Annonce exacte de 7 : 105 points plus un bonus de 50 points.",
            "Plus de plis que l'annonce : 5 points par pli remporté.",
            "Moins de plis que l'annonce : -5 points par pli manquant.",
            "Annonce de 7 échouée : -50 points."
          ]
        },
        "Les points de la manche sont ajoutés au total de la partie. Après le nombre de manches configuré, le joueur ayant le score total le plus élevé l'emporte. Si nécessaire, le jeu applique des critères de départage basés sur le score, l'annonce, les plis remportés et l'ordre des places à partir du donneur."
      ]
    },
    {
      title: "Confidentialité et équité",
      blocks: [
        "Le serveur multijoueur fait autorité. Il détient le jeu mélangé, l'état de la partie, les échéances du minuteur, la validation des coups légaux, le décompte des points et la progression des manches.",
        "Chaque joueur ne reçoit que sa propre main. Les tuiles cachées des autres joueurs ne sont pas incluses dans leurs instantanés. Les informations publiques comprennent les annonces, les plis remportés, les scores totaux, le pli en cours, les plis terminés, les statuts des joueurs et le nombre de tuiles restantes de chaque joueur.",
        "La distribution multijoueur est générée à partir d'une graine côté serveur. Cela rend les parties reproductibles à partir de la graine et de l'historique des événements, ce qui aide pour les contrôles d'équité, la relecture, le débogage et la récupération."
      ]
    },
    {
      title: "Statistiques",
      blocks: [
        "Les statistiques ne sont comptabilisées qu'à partir des parties multijoueur où les quatre places sont occupées par quatre joueurs distincts inscrits (connectés)."
      ]
    }
  ]
};
