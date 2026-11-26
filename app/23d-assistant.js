/* =====================================================================
   ASSISTANT — « À faire aujourd'hui » remarque aussi ce qui demande une
   action (26/11/2026). Demande de Vehi Zoh Junior : « rends-la très
   intelligente pour répondre aux attentes des clients ».
   Ajoute au panneau (direction, fondation, secrétariat) des constats
   calculés sur les données déjà chargées, chacun menant à l'outil qui
   existe déjà (pas de doublon) :
   - élèves absents aux derniers appels → onglet « À surveiller » (Contacter) ;
   - familles en retard de paiement → « Relancer les retards » (WhatsApp
     courtois, frères et sœurs regroupés, suivi « Relancé ») ;
   - parents pas encore reliés → écran Parents ↔ Élèves.
   Rien n'est envoyé automatiquement : la personne garde la main.
   ===================================================================== */
function conseilsAssistant(){
  const lignes = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return lignes;
  try{
    const suite = typeof elevesASurveiller === 'function' ? elevesASurveiller().filter(x => x.suite) : [];
    if(suite.length) lignes.push({ ic:'user', texte:`${suite.length} élève${suite.length > 1 ? 's' : ''} absent${suite.length > 1 ? 's' : ''} aux derniers appels`, detail:'Un petit message au parent rassure la famille', bouton:'Voir et contacter',
      action:"basculerRubrique('surveiller', true); document.getElementById('rub-surveiller')?.scrollIntoView({ behavior:'smooth', block:'start' })" });
    if(hasAccess('comptabilite')){
      // famillesEnRetard() : fonction existante de « Relancer les retards » (frères et sœurs regroupés)
      const ret = (DB.paiementsScolarite || []).length && typeof famillesEnRetard === 'function' ? famillesEnRetard(null) : [];
      if(ret.length) lignes.push({ ic:'wallet', texte:`${ret.length} famille${ret.length > 1 ? 's' : ''} en retard de paiement`, detail:`${fmtFCFA(ret.reduce((s, f) => s + f.total, 0))} dont la date limite est passée`, bouton:'Relancer',
        action:"ui.filters.comptaTab='scolarite'; go('comptabilite'); setTimeout(() => ouvrirRelanceImpayes(), 200)" });
    }
    const actifs = DB.eleves.filter(e => e.statut === 'Actif');
    const relies = new Set((DB.parentsEleves || []).map(pe => pe.eleveId));
    const nbRelies = actifs.filter(e => relies.has(e.id)).length;
    if(actifs.length && nbRelies / actifs.length < 0.7 && hasAccess('liens-parents'))
      lignes.push({ ic:'users', texte:`${nbRelies} élève${nbRelies > 1 ? 's' : ''} sur ${actifs.length} ont un parent relié à l’application`, detail:'Invitez les autres : ils verront absences, notes et paiements', bouton:'Inviter les parents', action:"go('liens-parents')" });
  }catch(_e){ /* un constat impossible à calculer n'empêche jamais l'affichage du tableau de bord */ }
  return lignes;
}
