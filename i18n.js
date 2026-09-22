/* =========================================================================
   EcoMaZ — Internationalisation (i18n)
   ---------------------------------------------------------------------
   Architecture pensée pour ajouter des langues SANS réécrire l'appli :
   chaque texte traduisible passe par t('cle') plutôt que d'être écrit en
   dur. Pour l'instant, seuls l'écran de connexion et le menu de
   navigation sont entièrement traduits en anglais (c'est ce qu'un
   directeur d'école anglophone verrait en premier en évaluant le
   produit) — le reste de l'application reste en français. Étendre la
   traduction à une nouvelle vue = ajouter ses clés dans TRADUCTIONS et
   remplacer le texte en dur par des appels à t('...'), sans toucher à
   cette architecture.
   ========================================================================= */

const LANGUE_PAR_DEFAUT = 'fr';
const LANGUES_DISPONIBLES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

let langCourante = (function(){
  try{ return localStorage.getItem('ecomaz_langue') || LANGUE_PAR_DEFAUT; }
  catch(_e){ return LANGUE_PAR_DEFAUT; }
})();

const TRADUCTIONS = {
  fr: {
    app_name: 'EcoMaZ',
    brand_tagline: 'Garderie · Maternelle · Primaire',

    espaces_sub: 'Sélectionnez votre espace pour continuer',
    espace_enseignant_label: 'Enseignant(e)',
    espace_enseignant_desc: 'Notes, présences élèves, emploi du temps, programmes.',
    espace_secretariat_label: 'Secrétariat',
    espace_secretariat_desc: 'Élèves, enseignants, comptabilité (chiffres globaux masqués).',
    espace_direction_label: 'Direction',
    espace_direction_desc: 'Accès complet, y compris finances et paramètres.',
    espace_fondation_label: 'Fondation',
    espace_fondation_desc: 'Accès complet, identique à la Direction.',

    login_espace_prefix: 'Espace ',
    login_sub: 'Connectez-vous avec le compte fourni par votre établissement',
    label_email: 'Email',
    label_password: 'Mot de passe',
    btn_login: 'Se connecter',
    btn_login_loading: 'Connexion…',
    btn_forgot: 'Mot de passe oublié ?',
    btn_change_espace: "← Changer d'espace",

    forgot_title: 'Mot de passe oublié',
    forgot_sub: 'Entrez votre email — un lien de réinitialisation vous sera envoyé',
    btn_send_link: 'Envoyer le lien',
    btn_send_link_loading: 'Envoi…',
    btn_back_to_login: '← Retour à la connexion',

    sent_title: 'Email envoyé',
    sent_sub: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos spams) — le lien est valable un temps limité.",
    btn_back_to_login_plain: 'Retour à la connexion',

    reset_title: 'Nouveau mot de passe',
    reset_sub: 'Choisissez un nouveau mot de passe pour votre compte',
    label_new_password: 'Nouveau mot de passe',
    label_confirm_password: 'Confirmer le mot de passe',
    btn_save_password: 'Enregistrer le mot de passe',
    btn_save_password_loading: 'Enregistrement…',

    nav_dashboard: 'Tableau de bord',
    nav_group_eleves: 'Élèves',
    nav_eleves: 'Élèves & Inscriptions',
    nav_group_pedagogie: 'Pédagogie',
    nav_notes: 'Notes & Bulletins',
    nav_presences_eleves: 'Pointage élèves (Appel)',
    nav_emploi_temps: 'Emploi du temps',
    nav_programmes: 'Programmes pédagogiques',
    nav_group_pointage_ens: 'Pointage & Enseignants',
    nav_scan: 'Scanner un badge',
    nav_enseignants: 'Enseignants',
    nav_presences_enseignants: 'Pointage enseignants — Journal',
    nav_group_finances: 'Finances',
    nav_comptabilite: 'Comptabilité',
    nav_group_communication: 'Communication',
    nav_messagerie: 'Messagerie',
    nav_group_systeme: 'Système',
    nav_parametres: 'Paramètres',

    footer_annee: 'Année scolaire',
    footer_install: "📲 Installer l'application",
    footer_demo: 'Recharger les données démo',
    footer_switch: '🔒 Changer de profil',
    footer_poweredby: 'Propulsé par',
  },
  en: {
    app_name: 'EcoMaZ',
    brand_tagline: 'Daycare · Preschool · Primary',

    espaces_sub: 'Select your space to continue',
    espace_enseignant_label: 'Teacher',
    espace_enseignant_desc: 'Grades, student attendance, timetable, syllabus.',
    espace_secretariat_label: 'Front Office',
    espace_secretariat_desc: 'Students, teachers, accounting (overall figures hidden).',
    espace_direction_label: 'Head of School',
    espace_direction_desc: 'Full access, including finances and settings.',
    espace_fondation_label: 'Board / Foundation',
    espace_fondation_desc: 'Full access, same as Head of School.',

    login_espace_prefix: '',
    login_sub: 'Sign in with the account provided by your school',
    label_email: 'Email',
    label_password: 'Password',
    btn_login: 'Sign in',
    btn_login_loading: 'Signing in…',
    btn_forgot: 'Forgot password?',
    btn_change_espace: '← Change space',

    forgot_title: 'Forgot password',
    forgot_sub: "Enter your email — we'll send you a reset link",
    btn_send_link: 'Send link',
    btn_send_link_loading: 'Sending…',
    btn_back_to_login: '← Back to sign in',

    sent_title: 'Email sent',
    sent_sub: "If an account exists for this email, a reset link has just been sent. Check your inbox (and spam folder) — the link is valid for a limited time.",
    btn_back_to_login_plain: 'Back to sign in',

    reset_title: 'New password',
    reset_sub: 'Choose a new password for your account',
    label_new_password: 'New password',
    label_confirm_password: 'Confirm password',
    btn_save_password: 'Save password',
    btn_save_password_loading: 'Saving…',

    nav_dashboard: 'Dashboard',
    nav_group_eleves: 'Students',
    nav_eleves: 'Students & Enrollment',
    nav_group_pedagogie: 'Academics',
    nav_notes: 'Grades & Report Cards',
    nav_presences_eleves: 'Student Attendance (Roll Call)',
    nav_emploi_temps: 'Timetable',
    nav_programmes: 'Syllabus',
    nav_group_pointage_ens: 'Staff Clock-in',
    nav_scan: 'Scan a Badge',
    nav_enseignants: 'Teachers',
    nav_presences_enseignants: 'Staff Attendance — Log',
    nav_group_finances: 'Finances',
    nav_comptabilite: 'Accounting',
    nav_group_communication: 'Communication',
    nav_messagerie: 'Messages',
    nav_group_systeme: 'System',
    nav_parametres: 'Settings',

    footer_annee: 'School year',
    footer_install: '📲 Install the app',
    footer_demo: 'Reload demo data',
    footer_switch: '🔒 Switch profile',
    footer_poweredby: 'Powered by',
  },
};

function t(cle, vars){
  const dict = TRADUCTIONS[langCourante] || TRADUCTIONS[LANGUE_PAR_DEFAUT];
  let texte = dict[cle] ?? TRADUCTIONS[LANGUE_PAR_DEFAUT][cle] ?? cle;
  if(vars) for(const k in vars) texte = texte.replaceAll(`{${k}}`, vars[k]);
  return texte;
}

function changerLangue(langue){
  try{ localStorage.setItem('ecomaz_langue', langue); }catch(_e){}
  location.reload();
}

// Traduit tous les éléments statiques de index.html marqués data-i18n
// (le menu de navigation, notamment) — à appeler une fois au chargement.
function appliquerTraductionsDOM(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}
