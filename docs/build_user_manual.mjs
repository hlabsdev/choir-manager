import fs from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

const OUT_DIR = "C:/PROJETS/PERSO/CHOIR-MANAGER/docs";
const OUT_FILE = path.join(OUT_DIR, "Guide_utilisateur_ChoirManager.docx");

const COLORS = {
  navy: "0B2545",
  primary: "4338CA",
  primaryDark: "312E81",
  amber: "D97706",
  ink: "1F2937",
  muted: "64748B",
  light: "F8FAFC",
  blueGray: "E8EEF5",
  indigoLight: "EEF2FF",
  amberLight: "FFF7ED",
  greenLight: "ECFDF5",
  redLight: "FEF2F2",
  border: "CBD5E1",
  white: "FFFFFF",
};

const DXA = 9360;
const FONT = "Calibri";
const CODE_FONT = "Consolas";

function run(text, options = {}) {
  return new TextRun({
    text,
    font: options.code ? CODE_FONT : FONT,
    size: options.size ?? 22,
    bold: options.bold,
    italics: options.italics,
    color: options.color ?? COLORS.ink,
    break: options.break,
  });
}

function p(text, options = {}) {
  const children = Array.isArray(text) ? text : [run(text, options)];
  return new Paragraph({
    children,
    style: options.style ?? "Normal",
    alignment: options.alignment,
    spacing: options.spacing,
    keepNext: options.keepNext,
    keepLines: options.keepLines,
    pageBreakBefore: options.pageBreakBefore,
  });
}

function title(text) {
  return new Paragraph({
    children: [run(text, { size: 60, bold: true, color: COLORS.navy })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 220, line: 300, lineRule: LineRuleType.AUTO },
    keepNext: true,
  });
}

function subtitle(text) {
  return new Paragraph({
    children: [run(text, { size: 30, color: COLORS.primaryDark })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 180, line: 300, lineRule: LineRuleType.AUTO },
    keepNext: true,
  });
}

function kicker(text) {
  return new Paragraph({
    children: [run(text.toUpperCase(), { size: 20, bold: true, color: COLORS.amber })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    keepNext: true,
  });
}

function h1(text, pageBreakBefore = false) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore,
    keepNext: true,
  });
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
  });
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    children: Array.isArray(text) ? text : [run(text)],
    numbering: { reference: "guide-bullets", level },
    spacing: { before: 0, after: 80, line: 300, lineRule: LineRuleType.AUTO },
  });
}

function step(text, level = 0) {
  return new Paragraph({
    children: Array.isArray(text) ? text : [run(text)],
    numbering: { reference: "guide-steps", level },
    spacing: { before: 0, after: 100, line: 300, lineRule: LineRuleType.AUTO },
  });
}

function labeled(label, text) {
  return p([
    run(`${label} : `, { bold: true, color: COLORS.navy }),
    run(text),
  ]);
}

function route(url) {
  return run(url, { code: true, color: COLORS.primaryDark });
}

function callout(label, text, kind = "info") {
  const fills = {
    info: COLORS.indigoLight,
    why: COLORS.greenLight,
    warning: COLORS.amberLight,
    danger: COLORS.redLight,
    capture: COLORS.blueGray,
  };
  return new Paragraph({
    children: [
      run(`${label} - `, { bold: true, color: COLORS.navy }),
      run(text),
    ],
    shading: { fill: fills[kind], type: ShadingType.CLEAR },
    border: {
      top: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4, space: 6 },
      bottom: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4, space: 6 },
      left: {
        style: BorderStyle.SINGLE,
        color: kind === "warning" ? COLORS.amber : COLORS.primary,
        size: 14,
        space: 8,
      },
      right: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4, space: 6 },
    },
    indent: { left: 180, right: 180 },
    spacing: { before: 120, after: 120, line: 290, lineRule: LineRuleType.AUTO },
    keepLines: true,
  });
}

function table(headers, rows, widths) {
  const makeCell = (value, width, header = false) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: header ? { fill: COLORS.blueGray, type: ShadingType.CLEAR } : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4 },
        bottom: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4 },
        left: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4 },
        right: { style: BorderStyle.SINGLE, color: COLORS.border, size: 4 },
      },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      children: [
        new Paragraph({
          children: [run(String(value), { bold: header, color: header ? COLORS.navy : COLORS.ink, size: header ? 20 : 19 })],
          spacing: { before: 0, after: 0, line: 280, lineRule: LineRuleType.AUTO },
        }),
      ],
    });

  return new Table({
    width: { size: DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((value, index) => makeCell(value, widths[index], true)),
      }),
      ...rows.map((row) =>
        new TableRow({
          cantSplit: false,
          children: row.map((value, index) => makeCell(value, widths[index], false)),
        })
      ),
    ],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function capture(id, placement, url, profile, content, framing) {
  return [
    h2(`${id} - ${placement}`),
    labeled("URL", url),
    labeled("Profil", profile),
    labeled("Etat à préparer", content),
    labeled("Cadrage", framing),
  ];
}

const children = [];

// Cover - editorial_cover pattern, compact_reference_guide preset.
children.push(
  p("", { spacing: { before: 1500, after: 0 } }),
  kicker("Manuel utilisateur et support de formation"),
  title("ChoirManager"),
  subtitle("De la découverte complète à l'autonomie opérationnelle"),
  p("Guide par profil, procédures pas à pas, bonnes pratiques et plan de captures", {
    alignment: AlignmentType.CENTER,
    size: 23,
    color: COLORS.muted,
    spacing: { before: 0, after: 900 },
  }),
  p("Edition fondée sur l'application Angular / Django auditée le 24 juillet 2026", {
    alignment: AlignmentType.CENTER,
    size: 19,
    color: COLORS.muted,
    spacing: { before: 0, after: 100 },
  }),
  p("Profils couverts : visiteur, choriste, chef de pupitre, maître de chœur, Bureau, trésorier et opérateur plateforme", {
    alignment: AlignmentType.CENTER,
    size: 19,
    color: COLORS.muted,
    spacing: { before: 0, after: 0 },
  }),
  pageBreak()
);

children.push(
  h1("Avant de commencer"),
  callout(
    "Objectif",
    "Ce manuel part du principe que le lecteur ne connaît ni ChoirManager ni le vocabulaire d'une plateforme de gestion. Il explique quoi faire, comment le faire, pourquoi le faire et comment vérifier que l'action a réussi.",
    "why"
  ),
  p("ChoirManager est une plateforme de gestion de chorale. Elle rassemble dans un même espace les membres, la structure de responsabilité, les répétitions et présences, le répertoire, les annonces, les finances, les cotisations et les rapports."),
  p("Chaque chorale constitue un espace séparé. Une personne connectée ne voit que les données de sa chorale. Les responsabilités sont accordées par des mandats : président, secrétaire, trésorier, maître de chœur, chef de pupitre, etc. Un même membre peut donc cumuler plusieurs droits."),
  h2("Comment lire ce manuel"),
  bullet("Si vous découvrez la plateforme, lisez les chapitres 1 à 4, puis suivez le parcours correspondant à votre profil."),
  bullet("Si vous formez une équipe, utilisez le chapitre 14 : il fournit un déroulé de session, des exercices et des critères de réussite."),
  bullet("Si vous cherchez une action précise, allez directement au module concerné : membres, présences, répertoire, annonces, finances ou rapports."),
  bullet("Si quelque chose ne fonctionne pas, consultez le chapitre 13 avant de contacter le support."),
  callout(
    "Illustrations",
    "Le navigateur intégré demandé n'était pas disponible dans la session de production de cette édition. Les captures ne sont donc pas intégrées. Chaque emplacement C01 à C25 est référencé dans le texte et décrit précisément au chapitre 16 : URL exacte, profil requis, données à afficher et cadrage attendu.",
    "capture"
  ),
  h2("Adresse de la plateforme"),
  p([
    run("Dans ce manuel, remplacez "),
    route("https://<votre-domaine>"),
    run(" par l'adresse réelle fournie par votre organisation. En développement local, l'adresse habituelle est "),
    route("http://localhost:4200"),
    run("."),
  ]),
  h2("Sommaire"),
  bullet("1. Comprendre ChoirManager et les profils"),
  bullet("2. Démarrer en dix minutes"),
  bullet("3. Se connecter et naviguer"),
  bullet("4. Entrer dans la plateforme : nouvelle chorale ou invitation"),
  bullet("5. Tableau de bord et espace personnel"),
  bullet("6. Membres, invitations et mandats"),
  bullet("7. Structure : pupitres, postes et organigramme"),
  bullet("8. Répétitions, pointage et permissions d'absence"),
  bullet("9. Répertoire, partitions et progression"),
  bullet("10. Annonces"),
  bullet("11. Finances et cotisations"),
  bullet("12. Rapports et exports"),
  bullet("13. Résoudre les problèmes courants"),
  bullet("14. Guide du formateur"),
  bullet("15. Check-lists et glossaire"),
  bullet("16. Plan de captures d'écran")
);

children.push(
  h1("1. Comprendre ChoirManager et les profils", true),
  h2("1.1 Les huit zones de travail"),
  table(
    ["Zone", "A quoi elle sert", "Qui l'utilise surtout"],
    [
      ["Accueil", "Voir les informations et raccourcis utiles au rôle connecté.", "Tous"],
      ["Mon espace", "Consulter ses propres informations, présences et cotisations.", "Tout membre rattaché à une chorale"],
      ["Membres", "Rechercher les membres, tenir leurs fiches et gérer les invitations.", "Bureau; lecture aussi pour trésorier et maître de chœur"],
      ["Structure", "Lire l'organigramme; administrer pupitres, postes et droits.", "Tous en lecture; Bureau en gestion"],
      ["Présences", "Créer les répétitions, pointer, résumer et demander une absence.", "Tous; gestion par Bureau et maître de chœur"],
      ["Répertoire", "Consulter chants et partitions; gérer l'apprentissage.", "Tous; gestion par Bureau et maître de chœur"],
      ["Annonces", "Diffuser les informations internes.", "Tous en lecture; Bureau et maître de chœur en publication"],
      ["Finances / Rapports", "Suivre caisse, cotisations, indicateurs et exports.", "Bureau, trésorier, maître de chœur selon le rapport"],
    ],
    [1500, 4860, 3000]
  ),
  h2("1.2 Les profils et leurs droits"),
  table(
    ["Profil", "Ce qu'il peut faire", "Point d'attention"],
    [
      ["Visiteur / responsable d'une nouvelle chorale", "Soumettre une demande d'adhésion publique.", "La demande ne crée pas automatiquement un espace."],
      ["Choriste", "Lire annonces, répertoire, structure et répétitions; demander une absence; consulter son espace.", "Ne voit ni la liste générale des membres ni les finances."],
      ["Chef de pupitre", "Dispose des fonctions du choriste tant qu'aucun autre mandat ne lui est attribué.", "Le groupe chef_pupitre n'ouvre pas actuellement un écran de gestion dédié."],
      ["Maître de chœur", "Gérer répétitions, pointage, permissions, répertoire, annonces et rapports non financiers.", "Ne gère pas les finances et ne modifie pas les membres."],
      ["Bureau", "Gérer membres, invitations, mandats, structure, présences, répertoire, annonces; consulter finances et rapports.", "L'écriture financière demande le droit trésorier."],
      ["Trésorier", "Accéder aux finances, saisir opérations, campagnes, paiements et rapports financiers.", "Le poste standard cumule les groupes bureau et tresorier."],
      ["Super administrateur", "Administrer la plateforme et modérer les nouvelles chorales.", "Sans rattachement à une chorale, il ne peut pas produire un rapport tenant."],
    ],
    [1700, 4900, 2760]
  ),
  callout(
    "Règle importante",
    "Les droits se cumulent. Le libellé de rôle affiché n'énumère pas forcément tous les droits. Un trésorier standard peut par exemple être affiché comme « Bureau » tout en disposant des fonctions financières grâce à son groupe tresorier.",
    "warning"
  ),
  h2("1.3 Vocabulaire minimum"),
  labeled("Chorale", "l'espace isolé de votre organisation dans la plateforme."),
  labeled("Membre", "la fiche d'une personne rattachée à la chorale."),
  labeled("Pupitre", "la section vocale : Soprano, Alto, Ténor, Basse ou autre configuration créée par le Bureau."),
  labeled("Poste", "une fonction organisationnelle portant des droits, par exemple Trésorier ou Maître de chœur."),
  labeled("Mandat", "l'attribution datée d'un poste à un membre. Il peut être actif ou clôturé."),
  labeled("Répétition", "une séance planifiée pouvant recevoir des pointages, un résumé et des chants travaillés."),
  labeled("Permission", "une demande d'absence anticipée, en attente, approuvée ou refusée."),
  labeled("Campagne de cotisation", "une collecte définie pour un ensemble de membres."),
  labeled("Suppression logique", "l'élément disparaît de l'usage courant mais son historique est conservé côté système.")
);

children.push(
  h1("2. Démarrer en dix minutes", true),
  h2("2.1 Parcours express du choriste"),
  step([run("Ouvrez le lien d'invitation envoyé par le Bureau : "), route("/rejoindre/<code>"), run(".")]),
  step("Créez votre identifiant et un mot de passe d'au moins huit caractères."),
  step("Après la redirection, observez l'Accueil : prochaine répétition, état de cotisation et annonces."),
  step([run("Ouvrez "), route("/mon-espace"), run(" pour vérifier votre pupitre, vos présences et vos cotisations.")]),
  step([run("Ouvrez "), route("/presences/permissions"), run(" pour savoir où annoncer une future absence.")]),
  step([run("Ouvrez "), route("/musique"), run(" et vérifiez que vous pouvez consulter les chants et télécharger les partitions.")]),
  callout("Pourquoi", "Ce parcours valide immédiatement que le compte est rattaché à la bonne chorale et que les données personnelles attendues sont visibles.", "why"),
  h2("2.2 Parcours express du maître de chœur"),
  step("Depuis l'Accueil, ouvrez « Pointer une séance » ou le menu Présences."),
  step("Créez une répétition test si aucune séance n'existe, puis ouvrez-la."),
  step("Recherchez un choriste et cliquez sur sa carte pour vérifier le cycle Présent > Retard > Absent > Excusé."),
  step("Ouvrez Répertoire, ajoutez ou consultez un chant, puis associez son statut d'apprentissage à une répétition."),
  step("Ouvrez Présences > Permissions et vérifiez les demandes en attente."),
  h2("2.3 Parcours express du Bureau"),
  step("Ouvrez Membres et testez la recherche et les filtres par pupitre."),
  step("Ouvrez Invitations et vérifiez qu'un code actif peut être copié."),
  step("Ouvrez la fiche d'un membre, puis vérifiez ses mandats et son historique de présence."),
  step("Ouvrez Structure et contrôlez l'organigramme."),
  step("Ouvrez Annonces et vérifiez si vous pouvez publier."),
  h2("2.4 Parcours express du trésorier"),
  step("Ouvrez Finances et vérifiez le solde, les entrées, les sorties et la période."),
  step("Filtrez le journal par sens, catégorie ou dates."),
  step("Ouvrez Cotisations, sélectionnez une campagne et comparez montant attendu, collecté et taux de recouvrement."),
  step("Vérifiez qu'un paiement test crée ou met à jour la cotisation et se reflète dans le journal."),
  step("Ouvrez Rapports > Financier et testez l'export CSV.")
);

children.push(
  h1("3. Se connecter et naviguer", true),
  h2("3.1 Connexion"),
  p([run("URL : "), route("/auth/login")]),
  step("Saisissez le nom d'utilisateur communiqué par le Bureau ou créé depuis votre invitation."),
  step("Saisissez votre mot de passe. L'icône en forme d'œil permet de l'afficher temporairement."),
  step("Cliquez sur « Se connecter ». Vous êtes redirigé vers l'Accueil."),
  callout("Capture recommandée C01", "Page de connexion sur ordinateur, formulaire vide et panneau de présentation visibles.", "capture"),
  callout(
    "Sécurité",
    "N'utilisez pas un compte partagé. Les actions de caisse, de validation et de gestion sont attribuées au compte connecté. Déconnectez-vous sur un poste partagé.",
    "warning"
  ),
  h3("Si la connexion échoue"),
  bullet("Vérifiez la casse du nom d'utilisateur et l'absence d'espace copié avant ou après."),
  bullet("Utilisez l'icône œil pour contrôler le mot de passe, sans l'exposer à une autre personne."),
  bullet("Si le compte vient d'être créé manuellement, confirmez avec le Bureau l'identifiant exact et le mot de passe provisoire."),
  bullet("Il n'existe pas encore de fonction « Mot de passe oublié » dans l'interface. Le support ou un administrateur doit intervenir selon la procédure interne."),
  h2("3.2 Navigation sur ordinateur"),
  p("Le menu vertical présente d'abord les fonctions principales : Accueil, Présences, Répertoire et Annonces. Les fonctions de gestion apparaissent ensuite selon vos droits. « Mon espace » se trouve dans la section Compte."),
  bullet("Cliquez sur le logo ChoirManager pour revenir à l'Accueil."),
  bullet("Utilisez le bouton en haut du menu pour le réduire en rail d'icônes ou le développer."),
  bullet("Entre 768 et 1279 pixels de largeur, le rail réduit peut être imposé automatiquement pour préserver l'espace de travail."),
  bullet("La préférence d'affichage est mémorisée sur grand écran."),
  callout("Capture recommandée C02", "Accueil Bureau sur ordinateur, menu développé, carte de contexte utilisateur et groupes de navigation visibles.", "capture"),
  h2("3.3 Navigation sur mobile"),
  p("Les quatre raccourcis fixes sont Accueil, Présences, Répertoire et Annonces. Le bouton « Menu » ouvre une feuille contenant les autres fonctions autorisées, notamment Membres, Finances, Rapports, Structure et Mon espace."),
  step("Touchez un raccourci de la barre inférieure pour ouvrir directement le module."),
  step("Touchez « Menu » pour afficher toutes les fonctions disponibles."),
  step("Touchez une tuile pour naviguer; la feuille se referme automatiquement."),
  callout("Capture recommandée C03", "Accueil mobile avec la barre inférieure, puis une seconde capture avec la feuille Menu ouverte.", "capture"),
  h2("3.4 Déconnexion"),
  p("Sur ordinateur, utilisez « Déconnexion » en bas du menu. Sur mobile, ouvrez Menu puis utilisez le bouton rouge. La déconnexion est indispensable sur un appareil partagé.")
);

children.push(
  h1("4. Entrer dans la plateforme", true),
  h2("4.1 Demander l'adhésion d'une nouvelle chorale"),
  p([run("URL publique : "), route("/auth/demande-chorale")]),
  p("Ce parcours concerne un responsable dont la chorale ne possède pas encore d'espace ChoirManager."),
  step("Renseignez le nom de la chorale."),
  step("Indiquez éventuellement un préfixe souhaité de cinq caractères maximum. Il servira à former les numéros de membres, par exemple LVO-0042."),
  step("Indiquez la ville et le pays, le nom du contact, son email et, si utile, son téléphone."),
  step("Ajoutez un message de contexte : taille de la chorale, besoin principal, calendrier souhaité."),
  step("Cliquez sur « Envoyer la demande »."),
  p("Une confirmation apparaît. La demande reste « en attente » jusqu'à la revue d'un opérateur. Le texte de l'interface annonce un délai de quelques jours."),
  callout("Pourquoi", "Le provisionnement est modéré pour éviter la création abusive d'espaces et garantir qu'un compte Bureau initial est remis à une personne identifiée.", "why"),
  callout("Capture recommandée C04", "Formulaire public de demande d'adhésion, avec les champs obligatoires et le texte indiquant la revue humaine.", "capture"),
  h2("4.2 Traitement par l'opérateur plateforme"),
  p([run("Administration Django : "), route("/admin/core/demandechorale/")]),
  step("Ouvrez la liste des demandes et sélectionnez une demande en attente."),
  step("Vérifiez le nom, le contact, l'email, le contexte et les éventuels doublons."),
  step("Renseignez le préfixe attribué et la monnaie de gestion. Le préfixe doit être unique."),
  step("Enregistrez la demande."),
  step("Dans la liste, sélectionnez-la puis lancez « Approuver et provisionner »."),
  step("Copiez immédiatement l'identifiant Bureau et le mot de passe généré affichés dans le message de succès, puis transmettez-les par un canal sécurisé."),
  p("L'action crée la chorale, ses pupitres, ses postes, ses catégories financières standard et le premier compte Bureau. Une demande peut aussi être rejetée."),
  callout("Attention", "Le mot de passe généré n'est affiché qu'au moment du provisionnement. Ne l'envoyez pas dans un canal public et demandez son remplacement selon la procédure interne.", "warning"),
  h2("4.3 Rejoindre une chorale existante par invitation"),
  p([run("URL : "), route("/rejoindre/<code>")]),
  step("Ouvrez le lien transmis par le Bureau. La plateforme vérifie le code."),
  step("Vérifiez le nom de la chorale affiché et le pupitre suggéré éventuel."),
  step("Renseignez prénom, nom, email et téléphone si souhaité."),
  step("Choisissez un identifiant unique et un mot de passe d'au moins huit caractères."),
  step("Cliquez sur « Créer mon compte »."),
  p("Le compte est créé dans la chorale associée au code et la connexion est immédiate. Après une courte confirmation, l'Accueil s'ouvre."),
  callout("Capture recommandée C05", "Ecran Rejoindre avec code valide, nom de chorale et pupitre suggéré visibles.", "capture"),
  h3("Code invalide ou expiré"),
  p("Le code peut avoir été désactivé, supprimé, expiré ou avoir atteint son quota d'utilisations. Demandez au Bureau un nouveau lien. Ne tentez pas de modifier manuellement le code."),
  h2("4.4 Création manuelle ou invitation : que choisir ?"),
  table(
    ["Situation", "Méthode recommandée", "Pourquoi"],
    [
      ["Un seul nouveau membre connu", "Création manuelle ou invitation à usage unique.", "Le Bureau contrôle précisément le compte."],
      ["Campagne de recrutement", "Invitation partagée, limitée dans le temps et éventuellement par pupitre.", "Réduit la saisie administrative tout en gardant un périmètre contrôlé."],
      ["Responsable avec droits immédiats", "Créer le membre manuellement puis attribuer un mandat.", "Une invitation crée d'abord un choriste standard."],
      ["Personne sans accès numérique immédiat", "Création manuelle avec mot de passe provisoire remis de façon sûre.", "Le Bureau peut préparer le compte avant la remise."],
    ],
    [2500, 3300, 3560]
  )
);

children.push(
  h1("5. Accueil et Mon espace", true),
  h2("5.1 L'Accueil s'adapte au rôle"),
  p([run("URL : "), route("/dashboard")]),
  p("Tous les utilisateurs voient jusqu'à trois annonces mises en avant. Les cartes, indicateurs et actions rapides changent selon les droits."),
  h3("Vue du choriste"),
  bullet("Prochaine répétition : date, heure et lieu quand une séance future existe."),
  bullet("Etat de cotisation : À jour, Partielle, Impayée ou Aucune cotisation."),
  bullet("Nombre de chants et dernier chant ajouté."),
  bullet("Raccourcis vers Présences, Mon espace et Répertoire."),
  h3("Vue du staff"),
  bullet("Effectif actif, nombre de chants et taux moyen de présence sur les quatre dernières répétitions pointées."),
  bullet("Prochaine répétition et programme de chants associé."),
  bullet("Répartition par pupitre."),
  bullet("Demandes d'absence en attente, avec actions d'approbation ou de refus pour les rôles autorisés."),
  bullet("Solde de caisse uniquement pour Bureau, trésorier ou administrateur."),
  h3("Actions rapides"),
  p("Le maître de chœur voit notamment Pointer une séance et Ajouter un chant. Le Bureau voit Ajouter un membre, Gérer les finances et Publier une annonce selon ses droits. Tout membre peut accéder à Demander une permission."),
  callout("Capture recommandée C06", "Accueil choriste contenant prochaine répétition, cotisation et raccourcis.", "capture"),
  callout("Capture recommandée C07", "Accueil staff avec indicateurs, demandes d'absence et programme.", "capture"),
  h2("5.2 Mon espace"),
  p([run("URL : "), route("/mon-espace")]),
  p("Cette page est en lecture seule. Elle montre votre identité, votre numéro de membre, votre pupitre, votre statut, votre email, vos présences et vos cotisations."),
  bullet("Le taux de présence compte Présent et Retard comme participation."),
  bullet("Chaque cotisation affiche le montant payé, le montant dû, le reste et le statut."),
  bullet("Pour corriger une donnée personnelle ou un pupitre, contactez un membre du Bureau; l'interface Mon espace ne permet pas encore l'édition."),
  callout("Capture recommandée C08", "Mon espace d'un choriste avec les trois blocs identité, présences et cotisations.", "capture")
);

children.push(
  h1("6. Membres, invitations et mandats", true),
  p([run("Liste : "), route("/membres"), run(" - Fiche : "), route("/membres/<id>")]),
  callout("Accès", "La liste est réservée au Bureau, au trésorier et au maître de chœur. Seul le Bureau ou le super administrateur peut créer, modifier, supprimer un membre et gérer ses mandats.", "info"),
  h2("6.1 Rechercher et consulter"),
  step("Utilisez la barre de recherche pour saisir tout ou partie du nom."),
  step("Filtrez par pupitre ou choisissez Inactif."),
  step("Choisissez la vue Grille ou Liste selon votre écran."),
  step("Ouvrez « Voir la fiche » pour les informations détaillées, les présences, les mandats et, si vous y êtes autorisé, les cotisations."),
  p("Le tri suit l'ordre vocal Soprano, Alto, Ténor, Basse, puis l'ordre alphabétique dans chaque pupitre."),
  callout("Capture recommandée C09", "Liste Membres en vue grille avec recherche, filtres et actions visibles.", "capture"),
  h2("6.2 Créer un membre manuellement"),
  step("Cliquez sur « Nouveau membre »."),
  step("Renseignez prénom, nom et date d'adhésion."),
  step("Renseignez si possible email, téléphone, pupitre et sexe."),
  step("Choisissez le statut : Actif, Stagiaire, Honoraire ou Inactif."),
  step("Créez un identifiant unique et un mot de passe provisoire d'au moins huit caractères."),
  step("Cliquez sur « Créer »."),
  callout("Pourquoi", "Le statut détermine notamment l'accès de base. Les membres actifs et stagiaires reçoivent le groupe membre_actif; un membre inactif ne doit pas conserver un accès opérationnel normal.", "why"),
  h3("Après la création"),
  bullet("Remettez l'identifiant et le mot de passe par un canal sûr."),
  bullet("Demandez à la personne de vérifier son nom, son pupitre et son numéro dans Mon espace."),
  bullet("Si elle doit gérer un domaine, attribuez ensuite le mandat correspondant; ne cherchez pas à modifier directement un groupe technique."),
  h2("6.3 Gérer les invitations"),
  step("Dans Membres, cliquez sur « Invitations »."),
  step("Cliquez sur « Nouvelle invitation »."),
  step("Choisissez éventuellement un pupitre suggéré."),
  step("Définissez un maximum d'utilisations. Utilisez 1 pour une invitation nominative; laissez vide pour un code partagé illimité."),
  step("Définissez une date d'expiration lorsque le recrutement est limité dans le temps."),
  step("Ajoutez une note interne claire, par exemple « Recrutement ténors - rentrée 2026 »."),
  step("Générez l'invitation puis utilisez l'icône Copier le lien."),
  p("La liste indique l'état et le nombre d'utilisations. Une invitation peut être désactivée sans la supprimer, ou supprimée si elle n'a plus de valeur opérationnelle."),
  callout("Bonne pratique", "Pour limiter les risques, préférez une date d'expiration et un quota réaliste. Désactivez les codes diffusés dès la fin du recrutement.", "warning"),
  callout("Capture recommandée C10", "Modale Invitations avec au moins un code actif et le formulaire Nouvelle invitation déplié.", "capture"),
  h2("6.4 Modifier une fiche"),
  step("Ouvrez la fiche du membre."),
  step("Cliquez sur « Modifier »."),
  step("Corrigez identité, email, téléphone, pupitre, statut ou sexe."),
  step("Ajoutez éventuellement une photo."),
  step("Enregistrez et vérifiez l'en-tête de la fiche."),
  p("Si l'enregistrement de la photo échoue après la mise à jour des autres champs, le message le précise : les données textuelles peuvent avoir été conservées."),
  h2("6.5 Attribuer un mandat"),
  step("Dans la fiche, ouvrez la section Mandats et cliquez sur « Attribuer un poste »."),
  step("Choisissez le poste et la date de début."),
  step("Cliquez sur « Attribuer »."),
  p("Les droits sont recalculés automatiquement à partir des mandats actifs. Pour un poste marqué « titulaire actif unique », l'attribution échoue si une autre personne l'occupe encore. Clôturez d'abord l'ancien mandat."),
  h2("6.6 Clôturer un mandat"),
  step("Dans la fiche ou la fenêtre Mandats de la liste, repérez le mandat actif."),
  step("Cliquez sur « Clôturer » et confirmez."),
  step("Demandez à l'utilisateur de se reconnecter si son interface affiche encore d'anciens droits, car les rôles sont contenus dans la session d'authentification."),
  callout("Capture recommandée C11", "Fiche membre avec en-tête, section Mandats et bouton Attribuer un poste.", "capture"),
  h2("6.7 Supprimer un membre"),
  p("Le bouton Supprimer effectue une suppression logique : le membre disparaît des usages courants, mais l'historique est conservé. Utilisez cette action pour un départ confirmé, pas pour corriger une simple faute."),
  callout("Avant de supprimer", "Vérifiez les mandats actifs, l'identité et l'éventuel historique financier. Pour une absence temporaire, préférez le statut Inactif.", "warning")
);

children.push(
  h1("7. Structure : pupitres, postes et organigramme", true),
  p([run("URL : "), route("/structure")]),
  h2("7.1 Lire l'organigramme"),
  p("Tout membre authentifié peut consulter les postes classés par type et leurs titulaires actifs. Cette page permet de savoir qui contacter et de comprendre la gouvernance de la chorale."),
  callout("Capture recommandée C12", "Organigramme avec au moins un poste de Bureau, un poste de direction et leurs titulaires.", "capture"),
  h2("7.2 Gérer les pupitres"),
  p("Les fonctions de gestion ne sont visibles que pour le Bureau."),
  step("Cliquez sur « Nouveau pupitre »."),
  step("Renseignez le nom, la catégorie vocale et l'ordre d'affichage."),
  step("Enregistrez puis vérifiez la liste et l'organigramme."),
  p("Un pupitre encore utilisé peut empêcher la suppression. Réaffectez d'abord les membres concernés."),
  h2("7.3 Gérer les postes et les droits"),
  step("Cliquez sur « Nouveau poste » ou l'icône crayon d'un poste existant."),
  step("Renseignez le nom et le type : Bureau, Direction ou Technique."),
  step("Cochez les droits accordés : Bureau, Trésorier, Maître de chœur ou Chef de pupitre."),
  step("Activez « Un seul titulaire actif » pour les fonctions qui ne peuvent être exercées simultanément par plusieurs personnes."),
  step("Enregistrez puis attribuez le poste depuis la fiche du membre."),
  callout(
    "Attention",
    "Modifier les droits d'un poste change les autorisations de tous ses titulaires actifs. Documentez la décision et testez avec un compte représentatif avant une utilisation réelle.",
    "warning"
  )
);

children.push(
  h1("8. Répétitions, pointage et permissions", true),
  p([run("Répétitions : "), route("/presences"), run(" - Permissions : "), route("/presences/permissions")]),
  h2("8.1 Consulter les répétitions"),
  p("Tout membre authentifié peut voir les séances. La séance du jour est sélectionnée automatiquement lorsqu'elle existe. Les répétitions passées restent disponibles dans l'historique."),
  h2("8.2 Créer une répétition"),
  p("Le Bureau, le maître de chœur et le super administrateur peuvent créer et pointer."),
  step("Cliquez sur « Nouvelle répétition »."),
  step("Renseignez la date et l'heure de début; ajoutez le lieu."),
  step("Cliquez sur « Créer ». La nouvelle séance s'ouvre automatiquement."),
  p("Une répétition ne peut pas être dupliquée au même créneau. En cas de message de conflit, vérifiez la liste avant de réessayer."),
  h2("8.3 Pointer une séance"),
  step("Ouvrez la répétition à pointer."),
  step("Utilisez la recherche pour trouver rapidement une personne; les membres sont regroupés par pupitre."),
  step("Touchez ou cliquez une fois sur la carte d'un membre."),
  step("Répétez si nécessaire pour faire défiler les statuts : Présent > Retard > Absent > Excusé > Présent."),
  step("Surveillez l'état de synchronisation. Le statut apparaît immédiatement, puis est confirmé par le serveur."),
  p("Les compteurs Présents, Retards, Absents et Excusés ainsi que le taux de présence se recalculent à chaque action. Le taux considère Présent et Retard comme participation."),
  callout(
    "Erreur de synchronisation",
    "Une carte rouge indique que l'envoi a échoué. Cliquez de nouveau sur cette carte : la plateforme réessaie le même statut au lieu de passer au suivant. Ne quittez pas la séance tant que les erreurs ne sont pas résolues.",
    "danger"
  ),
  p("Un badge peut signaler qu'une demande de permission en attente ou approuvée couvre la date de la séance. Le pointage final reste une décision du responsable."),
  callout("Capture recommandée C13", "Séance de pointage avec groupes de pupitres, plusieurs statuts, compteurs et recherche visibles.", "capture"),
  h2("8.4 Rédiger le résumé de séance"),
  p("Le résumé est visible dans l'historique. Seul le Bureau ou le super administrateur peut le modifier."),
  step("Dans l'historique, ouvrez « Résumé de séance »."),
  step("Saisissez décisions, annonces, consignes et points à retenir."),
  step("Enregistrez."),
  h2("8.5 Demander une absence"),
  step("Ouvrez Présences > Permissions."),
  step("Cliquez sur « Nouvelle demande »."),
  step("Choisissez les dates Du et Au."),
  step("Renseignez un motif explicite et proportionné."),
  step("Cliquez sur « Envoyer »."),
  p("La demande apparaît dans « Mes demandes » avec le statut En attente. La date de fin ne peut pas précéder la date de début."),
  callout("Confidentialité", "Un choriste ne voit que ses propres demandes. Les validateurs autorisés voient les demandes de toute la chorale.", "info"),
  h2("8.6 Approuver ou refuser"),
  p("Le Bureau, le maître de chœur et le super administrateur peuvent traiter les demandes."),
  step("Ouvrez la zone « À valider »."),
  step("Pour une demande, cliquez sur Approuver ou Refuser."),
  step("Pour un lot, cochez les demandes puis utilisez l'action groupée."),
  p("Le refus groupé demande une confirmation. Les demandes déjà traitées ne sont pas retraitées."),
  callout("Capture recommandée C14", "Page Permissions d'un valideur avec une demande en attente, Mes demandes et actions groupées.", "capture")
);

children.push(
  h1("9. Répertoire, partitions et progression", true),
  p([run("URL : "), route("/musique")]),
  h2("9.1 Consulter le répertoire"),
  p("Tout membre authentifié peut consulter les chants et leurs partitions."),
  bullet("Recherchez par titre ou compositeur."),
  bullet("Filtrez par style et par thème."),
  bullet("Utilisez le filtre « Maîtrisés » pour isoler les chants dont le dernier statut est Maîtrisé."),
  bullet("Ouvrez une carte de chant pour voir les informations, les thèmes et les partitions."),
  callout("Capture recommandée C15", "Répertoire avec recherche, filtres, thèmes et plusieurs cartes de chants.", "capture"),
  h2("9.2 Créer un chant"),
  p("Le Bureau, le maître de chœur et le super administrateur disposent du bouton Nouveau chant."),
  step("Renseignez le titre obligatoire."),
  step("Ajoutez compositeur, style, tonalité, tempo et notes d'interprétation."),
  step("Sélectionnez les thèmes utiles ou créez rapidement un nouveau thème."),
  step("Cliquez sur « Créer »."),
  p("Un même titre ne doit pas être créé deux fois dans la chorale. Recherchez avant d'ajouter."),
  h2("9.3 Gérer les partitions"),
  step("Ouvrez le détail d'un chant."),
  step("Dans Ajouter une partition, donnez un nom compréhensible, par exemple « Score complet » ou « Alto - version concert »."),
  step("Choisissez éventuellement le pupitre concerné."),
  step("Sélectionnez le fichier puis téléversez-le."),
  p("Les choristes peuvent ensuite ouvrir ou télécharger le fichier. La suppression d'une partition demande une confirmation."),
  callout("Bonne pratique", "Utilisez une convention de nommage stable avec voix, version ou date. Evitez plusieurs fichiers au nom identique sans indication de version.", "why"),
  h2("9.4 Marquer le travail en répétition"),
  step("Dans le détail du chant, choisissez une répétition."),
  step("Choisissez le statut : Introduit, En travail ou Maîtrisé."),
  step("Cliquez sur « Marquer comme travaillé »."),
  p("Un même chant ne peut être enregistré qu'une fois pour la même répétition. Cette information alimente le programme et les rapports de répertoire."),
  callout("Capture recommandée C16", "Détail d'un chant avec liste de partitions et formulaire de progression par répétition.", "capture"),
  h2("9.5 Supprimer un chant"),
  p("La suppression est logique. Confirmez uniquement après avoir vérifié les partitions et l'historique d'apprentissage associés.")
);

children.push(
  h1("10. Annonces", true),
  p([run("URL : "), route("/annonces")]),
  h2("10.1 Lire les annonces"),
  p("Tous les membres peuvent lire les annonces actives. Les annonces épinglées sont mises en avant et jusqu'à trois apparaissent sur l'Accueil."),
  h2("10.2 Publier une annonce"),
  p("Le Bureau, le maître de chœur et le super administrateur peuvent publier."),
  step("Cliquez sur « Nouvelle annonce »."),
  step("Renseignez un titre court et un contenu autonome : qui, quoi, quand, où et action attendue."),
  step("Activez « Epinglée » si l'information doit rester prioritaire."),
  step("Définissez une date d'expiration pour les annonces temporaires."),
  step("Enregistrez."),
  callout("Pourquoi", "Une date d'expiration évite que des consignes anciennes restent visibles et soient prises pour des informations actuelles.", "why"),
  h2("10.3 Modifier, épingler ou supprimer"),
  bullet("L'icône épingle change la priorité sans ouvrir le formulaire."),
  bullet("L'icône crayon permet de modifier titre, contenu, épinglage et expiration."),
  bullet("L'icône corbeille supprime l'annonce après confirmation."),
  bullet("Le filtre « Inclure les expirées » est visible uniquement aux personnes autorisées à publier."),
  callout("Capture recommandée C17", "Fil d'annonces avec une annonce épinglée, une date d'expiration et les actions d'édition.", "capture")
);

children.push(
  h1("11. Finances et cotisations", true),
  p([run("Journal : "), route("/finances"), run(" - Cotisations : "), route("/finances/cotisations")]),
  callout(
    "Séparation des responsabilités",
    "Le Bureau peut consulter les finances. Les boutons de saisie, modification, paiement, exonération et suppression ne sont disponibles qu'au trésorier ou au super administrateur.",
    "warning"
  ),
  h2("11.1 Lire l'état de caisse"),
  p("Les indicateurs présentent les entrées, les sorties et le solde pour la période. Sans filtre, la période est l'année en cours."),
  step("Utilisez les dates Depuis et Jusqu'au pour limiter la période."),
  step("Filtrez le journal par sens Entrée / Sortie et par catégorie."),
  step("Vérifiez que le libellé de période et les indicateurs se mettent à jour."),
  callout("Capture recommandée C18", "Finances avec indicateurs Entrées, Sorties, Solde et journal filtrable.", "capture"),
  h2("11.2 Enregistrer une opération"),
  step("Cliquez sur « Nouvelle opération »."),
  step("Choisissez Entrée ou Sortie."),
  step("Renseignez la date, un montant strictement positif, une catégorie et un motif."),
  step("Si la catégorie manque, créez-la rapidement en précisant son sens."),
  step("Cliquez sur « Enregistrer » et vérifiez le journal et le solde."),
  callout("Contrôle", "Le sens choisi pour l'opération et celui de la catégorie doivent être cohérents. Utilisez un motif traçable, par exemple un objet, une référence et la période.", "why"),
  h2("11.3 Supprimer une opération"),
  p("La suppression est logique et recalcule l'état de caisse. Avant de confirmer, vérifiez qu'il ne s'agit pas d'une correction à documenter selon les règles comptables de l'organisation."),
  h2("11.4 Créer une campagne de cotisation"),
  step("Ouvrez l'onglet Cotisations."),
  step("Cliquez sur « Nouvelle campagne »."),
  step("Renseignez le nom, le type, le montant par membre et la date de début."),
  step("Indiquez si la campagne est obligatoire."),
  step("Créez la campagne. Elle est sélectionnée automatiquement."),
  h2("11.5 Définir des paliers de tarif"),
  p("Les paliers servent à appliquer des montants différents selon le sexe ou le pupitre, par exemple pour des tenues."),
  step("Sélectionnez la campagne."),
  step("Ouvrez « Ajouter un palier »."),
  step("Renseignez le libellé et le montant."),
  step("Choisissez éventuellement un sexe et/ou un pupitre."),
  step("Enregistrez tous les paliers avant de générer les cotisations."),
  callout("Attention", "Préparez et contrôlez les paliers avant la génération. Ils déterminent le montant dû de chaque membre correspondant.", "warning"),
  h2("11.6 Générer les cotisations"),
  step("Sélectionnez la campagne."),
  step("Cliquez sur « Générer les cotisations »."),
  step("Vérifiez qu'une ligne existe pour chaque membre actif concerné."),
  p("L'opération calcule le montant individuel à partir des paliers applicables ou du montant unitaire de la campagne."),
  h2("11.7 Enregistrer un paiement"),
  step("Repérez la cotisation et cliquez sur « Payer »."),
  step("Renseignez le montant et la date."),
  step("Enregistrez."),
  p("Le statut passe automatiquement de En attente à Partiel ou Payé. Le paiement crée aussi une entrée correspondante dans le journal de caisse."),
  callout("Contrôle croisé", "Après un paiement, vérifiez à la fois la ligne de cotisation et le journal. Cette double vérification évite de traiter deux fois le même versement.", "why"),
  h2("11.8 Modifier le montant dû ou exonérer"),
  bullet("L'action Modifier le montant ajuste le montant dû individuel, par exemple pour une décision exceptionnelle documentée."),
  bullet("L'action Exonérer demande confirmation et place la cotisation au statut Exonéré."),
  bullet("Les filtres Sexe, Pupitre, Statut et Reste minimum facilitent le traitement de groupes."),
  bullet("La sélection permet d'exonérer un lot ou d'encaisser le solde complet de plusieurs cotisations. L'encaissement groupé est transactionnel : tout réussit ou rien n'est enregistré."),
  callout("Capture recommandée C19", "Campagne sélectionnée avec progression, paliers, filtres, lignes de cotisations et actions Payer / Exonérer.", "capture"),
  h2("11.9 Exporter les impayés"),
  p("Cliquez sur « Exporter les impayés ». Le fichier CSV contient membre, montant dû, montant payé, reste et statut pour toutes les lignes dont le reste est supérieur à zéro.")
);

children.push(
  h1("12. Rapports et exports", true),
  p([run("URL : "), route("/rapports")]),
  h2("12.1 Rapports disponibles"),
  table(
    ["Rapport", "Contenu principal", "Profils autorisés"],
    [
      ["Financier", "Entrées et sorties par catégorie, cotisations par campagne, période optionnelle.", "Bureau, trésorier, super administrateur rattaché"],
      ["Présences", "Assiduité par membre et période optionnelle.", "Bureau, maître de chœur, super administrateur rattaché"],
      ["Effectifs", "Répartition par pupitre, statut et sexe.", "Bureau, maître de chœur, super administrateur rattaché"],
      ["Répertoire", "Répartition des chants par apprentissage et par thème.", "Bureau, maître de chœur, super administrateur rattaché"],
    ],
    [1700, 4700, 2960]
  ),
  h2("12.2 Consulter un rapport"),
  step("Cliquez sur l'onglet autorisé souhaité."),
  step("Pour Financier ou Présences, renseignez éventuellement les dates Du et Au."),
  step("Cliquez sur « Appliquer »."),
  step("Vérifiez les indicateurs et répartitions affichés."),
  h2("12.3 Exporter"),
  step("Cliquez sur CSV pour un fichier exploitable dans un tableur."),
  step("Cliquez sur PDF pour un document prêt à diffuser."),
  p("Si les dépendances PDF du serveur ne sont pas installées, l'interface l'indique et l'export CSV reste disponible."),
  callout("Diffusion", "Un rapport peut contenir des données personnelles ou financières. Vérifiez le destinataire, la période et le fichier avant tout partage.", "warning"),
  callout("Capture recommandée C20", "Page Rapports avec onglets autorisés, filtres de période, boutons CSV/PDF et un rapport chargé.", "capture"),
  h2("12.4 Cas du super administrateur"),
  p("Un super administrateur non rattaché à une chorale voit un Accueil neutre. Il ne peut pas produire un rapport sans contexte de chorale. L'administration globale et la modération se font dans l'administration Django.")
);

children.push(
  h1("13. Résoudre les problèmes courants", true),
  h2("13.1 Je ne vois pas un menu ou un bouton"),
  bullet("Comparez votre mandat avec la matrice du chapitre 1."),
  bullet("Reconnectez-vous après une attribution ou une clôture de mandat afin de renouveler la session."),
  bullet("Un chef de pupitre sans autre mandat reste actuellement sur le parcours choriste."),
  bullet("Le Bureau consulte les finances, mais seul le groupe trésorier affiche les actions d'écriture."),
  h2("13.2 Une page revient à l'Accueil"),
  p("La protection de route a probablement détecté des droits insuffisants. Ne contournez pas l'URL. Demandez au Bureau de vérifier le mandat actif."),
  h2("13.3 Une liste est vide"),
  bullet("Vérifiez les filtres actifs, la recherche et la période."),
  bullet("Vérifiez que les données appartiennent bien à votre chorale."),
  bullet("Pour les cotisations, sélectionnez d'abord une campagne et générez les lignes si nécessaire."),
  bullet("Pour le pointage, ouvrez une répétition et assurez-vous que des membres ont le statut Actif."),
  h2("13.4 Une carte de pointage est rouge"),
  p("L'envoi a échoué. Cliquez à nouveau sur la même carte pour réessayer le statut affiché. Vérifiez la connexion et ne quittez pas l'écran avant confirmation."),
  h2("13.5 Impossible de créer une répétition ou un chant"),
  bullet("Une répétition peut déjà exister à la même date et heure."),
  bullet("Un chant du même titre peut déjà exister. Utilisez la recherche avant de créer."),
  h2("13.6 Impossible de supprimer un pupitre ou un poste"),
  p("L'élément est probablement encore utilisé. Réaffectez les membres, clôturez les mandats ou choisissez une mise hors usage selon la politique interne."),
  h2("13.7 Le code d'invitation ne fonctionne plus"),
  p("Il est désactivé, expiré, supprimé ou a atteint sa limite. Le Bureau doit générer un nouveau code."),
  h2("13.8 Le PDF ne se télécharge pas"),
  p("Le serveur peut manquer des bibliothèques de génération PDF. Utilisez CSV et signalez le message exact au support."),
  h2("13.9 Informations à transmettre au support"),
  bullet("Adresse de la page et module concerné."),
  bullet("Date et heure du problème."),
  bullet("Profil ou mandat attendu, sans communiquer le mot de passe."),
  bullet("Action exacte réalisée et résultat attendu."),
  bullet("Message d'erreur complet."),
  bullet("Capture d'écran masquant les données sensibles non nécessaires."),
  bullet("Indiquer si le problème se reproduit après déconnexion et reconnexion."),
  callout("Ne jamais transmettre", "Mot de passe, jeton de session, export financier complet non demandé ou données d'une autre personne sans nécessité de support.", "danger")
);

children.push(
  h1("14. Guide du formateur", true),
  h2("14.1 Préparation"),
  bullet("Préparer un environnement de démonstration, jamais les données de production."),
  bullet("Disposer d'au moins quatre comptes : choriste, maître de chœur, Bureau et trésorier."),
  bullet("Créer une répétition future, une répétition du jour, plusieurs membres actifs, deux chants, une annonce et une campagne de cotisation."),
  bullet("Préparer une demande d'absence en attente et un code d'invitation à usage unique."),
  bullet("Vérifier que les navigateurs ou profils de navigateur sont séparés pour éviter les confusions de session."),
  h2("14.2 Déroulé conseillé - 90 minutes"),
  table(
    ["Durée", "Séquence", "Résultat attendu"],
    [
      ["10 min", "Pourquoi ChoirManager, vocabulaire et profils.", "Les participants savent où se trouvent les modules."],
      ["10 min", "Connexion et navigation ordinateur/mobile.", "Chacun sait revenir à l'Accueil et se déconnecter."],
      ["15 min", "Parcours choriste : invitation, Mon espace, permission.", "Un participant rejoint et soumet une demande."],
      ["20 min", "Présences : créer, pointer, corriger, résumer.", "Le groupe réalise un pointage complet sans erreur rouge."],
      ["15 min", "Membres, mandats, structure et répertoire.", "Le Bureau attribue un rôle; le maître de chœur ajoute un chant."],
      ["15 min", "Finances, cotisations et rapports.", "Le trésorier enregistre un paiement et exporte un rapport."],
      ["5 min", "Questions, support et check-list de fin.", "Chacun sait quoi vérifier avant de quitter."],
    ],
    [1300, 3900, 4160]
  ),
  h2("14.3 Exercices par profil"),
  h3("Choriste"),
  bullet("Trouver la prochaine répétition."),
  bullet("Ouvrir une partition adaptée à son pupitre."),
  bullet("Soumettre une permission couvrant deux jours."),
  bullet("Identifier une cotisation partielle dans Mon espace."),
  h3("Maître de chœur"),
  bullet("Créer une répétition et pointer quatre statuts différents."),
  bullet("Traiter une permission."),
  bullet("Ajouter un chant, une partition et un statut d'apprentissage."),
  h3("Bureau"),
  bullet("Créer une invitation à usage unique et copier son lien."),
  bullet("Modifier le pupitre d'un membre."),
  bullet("Attribuer puis clôturer un mandat de démonstration."),
  bullet("Publier une annonce épinglée avec expiration."),
  h3("Trésorier"),
  bullet("Créer une entrée et une sortie avec catégories adaptées."),
  bullet("Créer une campagne avec deux paliers, puis générer les cotisations."),
  bullet("Enregistrer un paiement partiel, puis contrôler le journal."),
  bullet("Exporter les impayés et le rapport financier CSV."),
  h2("14.4 Critères de réussite"),
  bullet("L'utilisateur sait expliquer la différence entre poste, mandat et droit."),
  bullet("Il sait où effectuer son action sans essayer une URL non autorisée."),
  bullet("Il sait vérifier le résultat d'une écriture : statut, compteur, journal ou rapport."),
  bullet("Il sait reconnaître une erreur de synchronisation et la traiter."),
  bullet("Il sait quelles données ne doivent pas être partagées avec le support."),
  h2("14.5 Validation de fin de formation"),
  p("Demandez à chaque participant de réaliser un scénario complet sans aide, puis de l'expliquer à voix haute : objectif, étapes, contrôle et risque principal. La capacité à expliquer le pourquoi est le meilleur indicateur d'autonomie.")
);

children.push(
  h1("15. Check-lists et glossaire", true),
  h2("15.1 Check-list choriste"),
  bullet("Consulter l'Accueil et les annonces avant une répétition."),
  bullet("Télécharger la bonne partition dans Répertoire."),
  bullet("Déclarer une absence dès qu'elle est connue."),
  bullet("Vérifier régulièrement Mon espace."),
  bullet("Se déconnecter sur un appareil partagé."),
  h2("15.2 Check-list maître de chœur"),
  bullet("Créer ou confirmer la répétition avant la séance."),
  bullet("Vérifier les permissions d'absence."),
  bullet("Pointer tous les membres et résoudre les cartes rouges."),
  bullet("Associer les chants travaillés et leur statut d'apprentissage."),
  bullet("Communiquer les consignes importantes par une annonce."),
  h2("15.3 Check-list Bureau"),
  bullet("Tenir les fiches, statuts et pupitres à jour."),
  bullet("Limiter et désactiver les invitations après usage."),
  bullet("Clôturer les mandats terminés avant d'en attribuer de nouveaux."),
  bullet("Contrôler régulièrement l'organigramme."),
  bullet("Traiter les permissions et archiver les informations de séance utiles."),
  h2("15.4 Check-list trésorier"),
  bullet("Utiliser des catégories et motifs cohérents."),
  bullet("Contrôler le journal après chaque paiement de cotisation."),
  bullet("Revoir les impayés et les exonérations avec les responsables autorisés."),
  bullet("Filtrer la bonne période avant un rapport."),
  bullet("Protéger les exports financiers."),
  h2("15.5 Limites actuelles du MVP"),
  bullet("Pas d'enregistrements audio intégrés."),
  bullet("Pas de notifications push ni d'emails automatiques."),
  bullet("Pas de calendrier externe synchronisé."),
  bullet("Pas d'application mobile native; l'interface web est responsive."),
  bullet("Pas de module Activités / Planning distinct."),
  bullet("Pas de récupération autonome de mot de passe dans l'interface."),
  h2("15.6 Glossaire des statuts"),
  table(
    ["Domaine", "Statuts", "Signification"],
    [
      ["Membre", "Actif, Stagiaire, Honoraire, Inactif", "Situation du membre et accès de base."],
      ["Présence", "Présent, Retard, Absent, Excusé", "Résultat du pointage pour une répétition."],
      ["Permission", "En attente, Approuvée, Refusée", "Décision sur une absence anticipée."],
      ["Apprentissage", "Introduit, En travail, Maîtrisé", "Progression d'un chant dans le répertoire."],
      ["Cotisation", "En attente, Partiel, Payé, Exonéré", "Etat du montant individuel dû."],
      ["Invitation", "Active, désactivée, expirée ou quota atteint", "Possibilité réelle d'utiliser le code."],
    ],
    [1600, 3300, 4460]
  )
);

children.push(
  h1("16. Plan de captures d'écran", true),
  p("Les captures suivantes sont conçues pour compléter ce manuel sans exposer de données réelles. Utilisez un environnement de démonstration, des noms fictifs et une fenêtre propre. La base d'URL est celle de votre déploiement; en local, utilisez http://localhost:4200."),
  callout(
    "Règles de production",
    "Format PNG, largeur minimale 1600 px pour ordinateur et 390 x 844 px pour mobile. Masquer mots de passe, emails réels, téléphones, montants de production et jetons. Conserver le menu et le titre de page lorsque cela aide à se repérer.",
    "warning"
  ),
  ...capture(
    "C01",
    "Après la procédure 3.1",
    "/auth/login",
    "Public",
    "Formulaire vide; panneau de présentation visible; aucune donnée personnelle.",
    "Fenêtre ordinateur complète, sans barre de favoris ni extensions."
  ),
  ...capture(
    "C02",
    "Après 3.2",
    "/dashboard",
    "Bureau",
    "Menu développé; carte chorale et rôle; indicateurs chargés.",
    "Capturer menu et zone principale dans une même image."
  ),
  ...capture(
    "C03",
    "Après 3.3",
    "/dashboard",
    "Choriste sur mobile",
    "Une capture barre inférieure fermée; une capture feuille Menu ouverte.",
    "Viewport 390 x 844; conserver le titre et tous les raccourcis."
  ),
  ...capture(
    "C04",
    "Après 4.1",
    "/auth/demande-chorale",
    "Public",
    "Formulaire vide; texte de revue humaine et champs obligatoires visibles.",
    "Cadrage vertical sur la carte entière."
  ),
  ...capture(
    "C05",
    "Après 4.3",
    "/rejoindre/<code-valide>",
    "Public",
    "Nom de chorale fictif, pupitre suggéré et formulaire vide.",
    "Ne jamais montrer un code actif de production."
  ),
  ...capture(
    "C06",
    "Après 5.1 - vue choriste",
    "/dashboard",
    "Choriste",
    "Prochaine répétition, état de cotisation, dernier chant et annonces.",
    "Capturer uniquement la zone utile; conserver le menu pour le contexte."
  ),
  ...capture(
    "C07",
    "Après 5.1 - vue staff",
    "/dashboard",
    "Maître de chœur ou Bureau",
    "Effectif, taux de présence, programme, demandes d'absence et actions rapides.",
    "Données fictives suffisamment variées pour expliquer les cartes."
  ),
  ...capture(
    "C08",
    "Après 5.2",
    "/mon-espace",
    "Choriste",
    "Identité fictive, au moins trois présences et deux cotisations de statuts différents.",
    "Masquer l'email si le jeu de données n'est pas fictif."
  ),
  ...capture(
    "C09",
    "Après 6.1",
    "/membres",
    "Bureau",
    "Vue grille, filtres, recherche, au moins quatre pupitres et actions visibles.",
    "Utiliser uniquement des identités de démonstration."
  ),
  ...capture(
    "C10",
    "Après 6.3",
    "/membres",
    "Bureau",
    "Modale Invitations; un code de démonstration actif; formulaire déplié.",
    "Révoquer le code après la capture ou utiliser une base jetable."
  ),
  ...capture(
    "C11",
    "Après 6.5",
    "/membres/<id>",
    "Bureau",
    "Fiche d'un membre fictif avec mandat actif et formulaire Attribuer un poste ouvert.",
    "Inclure le titre du membre et la section Mandats."
  ),
  ...capture(
    "C12",
    "Après 7.1",
    "/structure",
    "Tout membre",
    "Organigramme avec Bureau, Direction et Technique.",
    "Cadrage large montrant les regroupements par type."
  ),
  ...capture(
    "C13",
    "Après 8.3",
    "/presences",
    "Maître de chœur",
    "Séance active avec Présent, Retard, Absent, Excusé, compteurs et recherche.",
    "Ne laisser aucune carte rouge, sauf dans une capture de dépannage séparée."
  ),
  ...capture(
    "C14",
    "Après 8.6",
    "/presences/permissions",
    "Maître de chœur ou Bureau",
    "Au moins deux demandes en attente, une sélectionnée, actions groupées visibles.",
    "Motifs fictifs et non sensibles."
  ),
  ...capture(
    "C15",
    "Après 9.1",
    "/musique",
    "Choriste",
    "Plusieurs chants, thèmes, styles, recherche et filtre Maîtrisés.",
    "Eviter un écran vide; afficher des statuts différents."
  ),
  ...capture(
    "C16",
    "Après 9.4",
    "/musique",
    "Maître de chœur",
    "Modale détail d'un chant, partitions et formulaire de progression.",
    "Utiliser des fichiers de démonstration non protégés."
  ),
  ...capture(
    "C17",
    "Après 10.3",
    "/annonces",
    "Bureau",
    "Annonce épinglée, annonce avec expiration et icônes de gestion.",
    "Le texte doit être fictif et lisible."
  ),
  ...capture(
    "C18",
    "Après 11.1",
    "/finances",
    "Trésorier",
    "Indicateurs, filtres, journal avec entrées et sorties.",
    "Montants fictifs; période clairement visible."
  ),
  ...capture(
    "C19",
    "Après 11.8",
    "/finances/cotisations",
    "Trésorier",
    "Campagne, paliers, filtres, plusieurs statuts et actions.",
    "Utiliser des membres fictifs et des montants pédagogiques."
  ),
  ...capture(
    "C20",
    "Après 12.3",
    "/rapports",
    "Bureau ou trésorier",
    "Onglets, période, boutons CSV/PDF et contenu d'un rapport.",
    "Cadrage montrant à la fois contrôles et synthèse."
  ),
  ...capture(
    "C21",
    "Dépannage 13.1",
    "/dashboard",
    "Chef de pupitre sans autre mandat",
    "Menu de type choriste afin d'illustrer l'absence d'écrans de gestion.",
    "Afficher la carte de rôle si possible."
  ),
  ...capture(
    "C22",
    "Dépannage 13.4",
    "/presences",
    "Maître de chœur",
    "Une carte volontairement en erreur rouge dans un environnement de test.",
    "Recadrer sur la carte et l'indication de synchronisation."
  ),
  ...capture(
    "C23",
    "Formation 14.3 - invitation",
    "/rejoindre/<code-valide>",
    "Public",
    "Etat de succès « Bienvenue ! » juste avant redirection.",
    "Utiliser un compte de démonstration jetable."
  ),
  ...capture(
    "C24",
    "Formation 14.3 - paiement",
    "/finances/cotisations",
    "Trésorier",
    "Formulaire de paiement ouvert avec montant et date.",
    "Montant fictif; ne pas capturer de données bancaires."
  ),
  ...capture(
    "C25",
    "Parcours opérateur 4.2",
    "/admin/core/demandechorale/",
    "Super administrateur",
    "Liste de demandes fictives avec statut et action de modération.",
    "Masquer emails, IP et notes internes; ne jamais montrer les identifiants générés."
  ),
  h2("Correspondance rapide entre captures et chapitres"),
  table(
    ["Chapitre", "Captures", "Priorité"],
    [
      ["Connexion et navigation", "C01 à C03", "Haute"],
      ["Onboarding", "C04, C05, C23, C25", "Haute"],
      ["Accueil et profil", "C06 à C08", "Haute"],
      ["Membres et structure", "C09 à C12", "Haute"],
      ["Présences", "C13, C14, C22", "Critique pour la formation"],
      ["Répertoire et annonces", "C15 à C17", "Moyenne"],
      ["Finances et rapports", "C18 à C20, C24", "Critique pour le trésorier"],
      ["Droits particuliers", "C21", "Moyenne"],
    ],
    [2500, 3300, 3560]
  )
);

children.push(
  h1("Conclusion"),
  p("Un utilisateur autonome de ChoirManager sait d'abord identifier son rôle, choisir le bon module, réaliser l'action, puis contrôler son résultat. La plateforme protège les fonctions sensibles par les mandats et garde chaque chorale dans un espace de données séparé."),
  p("Pour maintenir ce manuel à jour, révisez-le dès qu'un menu, un droit, un statut, une validation ou un parcours d'entrée change. Les captures doivent être renouvelées avec les mêmes identifiants C01 à C25 afin de conserver la correspondance avec le texte."),
  callout(
    "Réflexe final",
    "Avant toute action sensible : vérifier la chorale, le profil connecté, l'objet concerné et l'effet attendu. Après l'action : contrôler l'écran, le statut et, pour les finances, le journal.",
    "why"
  )
);

const doc = new Document({
  creator: "OpenAI Codex",
  title: "Guide utilisateur ChoirManager",
  subject: "Manuel utilisateur et support de formation",
  description: "Guide complet par profil pour la plateforme ChoirManager.",
  keywords: "ChoirManager, chorale, guide utilisateur, formation, support",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: COLORS.ink },
        paragraph: {
          spacing: { before: 0, after: 120, line: 300, lineRule: LineRuleType.AUTO },
          widowControl: true,
        },
      },
    },
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 22, color: COLORS.ink },
        paragraph: {
          spacing: { before: 0, after: 120, line: 300, lineRule: LineRuleType.AUTO },
          widowControl: true,
        },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: COLORS.primary },
        paragraph: {
          spacing: { before: 360, after: 200, line: 300, lineRule: LineRuleType.AUTO },
          keepNext: true,
          keepLines: true,
          outlineLevel: 0,
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: COLORS.primary },
        paragraph: {
          spacing: { before: 280, after: 140, line: 300, lineRule: LineRuleType.AUTO },
          keepNext: true,
          keepLines: true,
          outlineLevel: 1,
        },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: COLORS.primaryDark },
        paragraph: {
          spacing: { before: 200, after: 100, line: 300, lineRule: LineRuleType.AUTO },
          keepNext: true,
          keepLines: true,
          outlineLevel: 2,
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "guide-bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 80, line: 300 } },
              run: { font: FONT, color: COLORS.primary },
            },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: "◦",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 900, hanging: 270 }, spacing: { after: 80, line: 300 } },
              run: { font: FONT, color: COLORS.primaryDark },
            },
          },
        ],
      },
      {
        reference: "guide-steps",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 540, hanging: 270 }, spacing: { after: 100, line: 300 } },
              run: { font: FONT, bold: true, color: COLORS.primary },
            },
          },
          {
            level: 1,
            format: LevelFormat.LOWER_LETTER,
            text: "%2.",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 900, hanging: 270 }, spacing: { after: 100, line: 300 } },
              run: { font: FONT, bold: true, color: COLORS.primaryDark },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
        },
        titlePage: true,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                run("CHOIRMANAGER", { size: 17, bold: true, color: COLORS.muted }),
                run("  |  Guide utilisateur et formateur", { size: 17, color: COLORS.muted }),
              ],
              spacing: { before: 0, after: 0 },
            }),
          ],
        }),
        first: new Header({ children: [p("")] }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                run("Edition du 24 juillet 2026  |  Page ", { size: 17, color: COLORS.muted }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: COLORS.muted }),
              ],
            }),
          ],
        }),
        first: new Footer({ children: [p("")] }),
      },
      children,
    },
  ],
});

await fs.mkdir(OUT_DIR, { recursive: true });
const buffer = await Packer.toBuffer(doc);
await fs.writeFile(OUT_FILE, buffer);
console.log(OUT_FILE);
