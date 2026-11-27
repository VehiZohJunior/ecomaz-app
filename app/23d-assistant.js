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
    if(typeof conseilsRegistreNotes === 'function') lignes.push(...conseilsRegistreNotes());
    lignes.push(...conseilsAssistant2());
    if(typeof conseilsAppelsGroupes === 'function') lignes.push(...conseilsAppelsGroupes());
    if(typeof conseilsPermissions === 'function') lignes.push(...conseilsPermissions());
  }catch(_e){ /* un constat impossible à calculer n'empêche jamais l'affichage du tableau de bord */ }
  return lignes;
}

/* ---------- Assistant (2) : élèves en difficulté scolaire et encaissements à venir (26/11/2026) ---------- */
// Élèves dont la moyenne du trimestre est sous 10, ou a baissé d'au moins 2 points depuis le trimestre précédent
function elevesEnDifficulte(){
  const ordre = TRIMESTRES, t = trimestreCourant(), i = ordre.indexOf(t), r = [];
  (DB.classes || []).forEach(c => {
    let cur = resultatsClasse(c.id, t), lib = t, prec = i > 0 ? resultatsClasse(c.id, ordre[i - 1]) : null;
    if(!cur.effectif && prec && prec.effectif){ cur = prec; lib = ordre[i - 1]; prec = i > 1 ? resultatsClasse(c.id, ordre[i - 2]) : null; }
    cur.lignes.forEach(l => {
      if(l.moyenne === null) return;
      const avant = prec ? (prec.lignes.find(x => x.eleve.id === l.eleve.id) || {}).moyenne : null;
      const baisse = avant != null ? avant - l.moyenne : 0;
      if(l.moyenne < 10 || baisse >= 2){
        const faibles = l.details.filter(d => d.moy !== null && d.moy < 10).sort((a, b) => a.moy - b.moy).slice(0, 3).map(d => d.matiere);
        r.push({ eleve: l.eleve, moyenne: l.moyenne, avant, baisse, trimestre: lib, faibles });
      }
    });
  });
  return r.sort((a, b) => a.moyenne - b.moyenne);
}
function ouvrirElevesEnDifficulte(){
  const l = elevesEnDifficulte();
  const f = n => n.toFixed(2).replace('.', ',');
  openModal('📉 Élèves en difficulté scolaire', `
    <p class="hint">Moyenne sous 10, ou en baisse d’au moins 2 points depuis le trimestre précédent. Un mot au parent tôt dans le trimestre change souvent tout.</p>
    <ul class="liste-compacte">${l.map(x => `<li class="lc-ligne">
      <span class="lc-avatar" aria-hidden="true">${escapeHtml(initials(x.eleve.prenom, x.eleve.nom))}</span>
      <span class="lc-corps"><strong>${escapeHtml(eleveFullName(x.eleve))}</strong>
        <span>${escapeHtml(classeName(x.eleve.classeId))} · ${escapeHtml(libelleTrimestre(x.trimestre))} : <b>${f(x.moyenne)}/20</b>${x.avant != null ? ` (avant ${f(x.avant)}${x.baisse >= 2 ? `, <span style="color:var(--danger)">−${f(x.baisse)}</span>` : ''})` : ''}${x.faibles.length ? ` · à renforcer : ${escapeHtml(x.faibles.join(', '))}` : ''}</span></span>
      ${telephonesWhatsapp(x.eleve.parentTel).length ? `<button class="btn secondary sm" onclick="contacterParentDifficulte('${x.eleve.id}')">Prévenir le parent</button>` : '<span class="hint">Pas de numéro</span>'}
    </li>`).join('')}</ul>`);
}
function contacterParentDifficulte(eleveId){
  const x = elevesEnDifficulte().find(y => y.eleve.id === eleveId); if(!x) return;
  const e = x.eleve, moy = x.moyenne.toFixed(2).replace('.', ',');
  const message = `Bonjour, ici ${DB.meta?.nomEcole || 'l’école'}. Nous suivons de près ${e.prenom} : sa moyenne du ${libelleTrimestre(x.trimestre)} est de ${moy}/20${x.faibles.length ? ` (à renforcer : ${x.faibles.join(', ')})` : ''}. Pouvons-nous convenir d’un petit échange pour l’aider ensemble ? Merci.`;
  ouvrirEnvoiWhatsapp(`📲 Parent de ${eleveFullName(e)}`, telephonesWhatsapp(e.parentTel), message, 'WhatsApp s’ouvrira au numéro du parent avec ce message, que vous pouvez modifier avant l’envoi.');
}

// Tranches qui arrivent à échéance dans les 30 prochains jours et ne sont pas encore payées
function encaissementsAVenir(jours){
  const auj = todayISO(), d = new Date(); d.setDate(d.getDate() + (jours || 30));
  const fin = toISO(d), r = [];
  DB.eleves.filter(e => e.statut === 'Actif').forEach(e => {
    scolariteEleveParEcheance(e.id).detail.forEach(t => {
      if(t.dateEcheance && t.dateEcheance >= auj && t.dateEcheance <= fin && t.statut !== 'paye'){
        const reste = Math.max(0, (t.montant || 0) - (t.paye || 0)); if(reste > 0) r.push({ eleve: e, tranche: t.label, date: t.dateEcheance, reste });
      }
    });
  });
  return r.sort((a, b) => a.date.localeCompare(b.date) || classeName(a.eleve.classeId).localeCompare(classeName(b.eleve.classeId)));
}
function ouvrirEncaissementsAVenir(){
  const l = encaissementsAVenir(30), total = l.reduce((s, x) => s + x.reste, 0);
  const parDate = {}; l.forEach(x => (parDate[x.date] = parDate[x.date] || []).push(x));
  openModal('📅 Encaissements attendus — 30 prochains jours', `
    <p class="hint"><strong>${fmtFCFA(total)}</strong> attendus de ${new Set(l.map(x => x.eleve.id)).size} élève(s). Un rappel aimable quelques jours avant la date limite réduit les retards.</p>
    ${Object.entries(parDate).map(([d, xs]) => `<h4 style="margin:14px 0 6px;">${fmtDate(d)} — ${fmtFCFA(xs.reduce((s, x) => s + x.reste, 0))}</h4>
      <ul class="liste-compacte">${xs.map(x => `<li class="lc-ligne"><span class="lc-corps"><strong>${escapeHtml(eleveFullName(x.eleve))}</strong><span>${escapeHtml(classeName(x.eleve.classeId))} · ${escapeHtml(x.tranche)} · ${fmtFCFA(x.reste)}</span></span>
        ${telephonesWhatsapp(x.eleve.parentTel).length ? `<button class="btn secondary sm" onclick="rappelAimableEcheance('${x.eleve.id}', '${x.date}')">Rappel aimable</button>` : ''}</li>`).join('')}</ul>`).join('')}`);
}
function rappelAimableEcheance(eleveId, date){
  const x = encaissementsAVenir(30).find(y => y.eleve.id === eleveId && y.date === date); if(!x) return;
  const e = x.eleve;
  const message = `Bonjour, ici ${DB.meta?.nomEcole || 'l’école'}. Petit rappel amical : la ${x.tranche.toLowerCase()} de la scolarité de ${e.prenom} (${fmtFCFA(x.reste)}) est attendue au plus tard le ${fmtDate(x.date)}. Vous pouvez payer à l’école ou par Mobile Money. Merci et bonne journée !`;
  ouvrirEnvoiWhatsapp(`📲 Parent de ${eleveFullName(e)}`, telephonesWhatsapp(e.parentTel), message, 'WhatsApp s’ouvrira au numéro du parent avec ce message, que vous pouvez modifier avant l’envoi.');
}
function conseilsAssistant2(){
  const l = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return l;
  try{
    const diff = elevesEnDifficulte();
    if(diff.length) l.push({ ic:'trending-down', texte:`${diff.length} élève${diff.length > 1 ? 's' : ''} en difficulté scolaire`, detail:'Moyenne sous 10 ou en baisse de 2 points', bouton:'Voir', action:'ouvrirElevesEnDifficulte()' });
    if(hasAccess('comptabilite')){
      const enc = encaissementsAVenir(30);
      if(enc.length) l.push({ ic:'calendar', texte:`${fmtFCFA(enc.reduce((s, x) => s + x.reste, 0))} attendus dans les 30 jours`, detail:`${new Set(enc.map(x => x.eleve.id)).size} élève(s), prochaine date le ${fmtDate(enc[0].date)}`, bouton:'Voir', action:'ouvrirEncaissementsAVenir()' });
    }
  }catch(_e){}
  return l;
}
