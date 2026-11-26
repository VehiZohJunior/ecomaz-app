/* =====================================================================
   ASSISTANT — l'application remarque ce qui demande une action (26/11/2026)
   Demande de Vehi Zoh Junior : « rends-la très intelligente pour répondre
   aux attentes des clients ». Ajoute au panneau « À faire aujourd'hui »
   (direction, fondation, secrétariat) des constats calculés à partir des
   données déjà chargées, chacun avec UNE action :
   - élèves absents 3 jours de classe de suite → appeler / écrire au parent ;
   - familles en retard de paiement (date limite passée) → relance WhatsApp
     polie, préparée, à envoyer soi-même ;
   - parents pas encore reliés à l'application → écran Parents ↔ Élèves ;
   - anniversaires des élèves aujourd'hui.
   Rien n'est envoyé automatiquement : la personne garde la main.
   ===================================================================== */
function telWa(tel){ const d = String(tel || '').replace(/\D/g, '').replace(/^225/, ''); return d.length === 10 ? '225' + d : ''; }

function elevesAbsentsDeSuite(n){
  // Les n derniers jours où l'appel a été fait dans la classe : absent à chacun
  const parClasse = {};
  (DB.presencesEleves || []).forEach(p => { (parClasse[p.classeId] = parClasse[p.classeId] || new Set()).add(p.date); });
  const r = [];
  DB.eleves.filter(e => e.statut === 'Actif').forEach(e => {
    const jours = [...(parClasse[e.classeId] || [])].sort().slice(-n);
    if(jours.length < n) return;
    const ps = (DB.presencesEleves || []).filter(p => p.eleveId === e.id && jours.includes(p.date));
    if(ps.length === n && ps.every(p => p.statut === 'Absent')) r.push({ eleve: e, depuis: jours[0] });
  });
  return r;
}
function famillesEnRetard(){
  const auj = todayISO(), r = [];
  DB.eleves.filter(e => e.statut === 'Actif').forEach(e => {
    const g = scolariteEleveParEcheance(e.id);
    const dues = g.detail.filter(d => d.dateEcheance && d.dateEcheance < auj && d.statut !== 'paye');
    const montant = dues.reduce((s, d) => s + Math.max(0, (d.montant || 0) - (d.paye || 0)), 0);
    if(montant > 0) r.push({ eleve: e, montant, tranches: dues.map(d => d.label), plusAncienne: dues.map(d => d.dateEcheance).sort()[0] });
  });
  return r.sort((a, b) => b.montant - a.montant);
}
function anniversairesDuJour(){
  const md = todayISO().slice(5);
  return DB.eleves.filter(e => e.statut === 'Actif' && e.dateNaissance && e.dateNaissance.slice(5) === md);
}

function conseilsAssistant(){
  const lignes = [];
  if(!['secretariat', 'direction', 'fondation'].includes(ui.role)) return lignes;
  try{
    const abs = elevesAbsentsDeSuite(3);
    if(abs.length) lignes.push({ ic:'user', texte:`${abs.length} élève${abs.length > 1 ? 's' : ''} absent${abs.length > 1 ? 's' : ''} 3 jours de suite`, detail:'Prenez des nouvelles auprès des parents', bouton:'Voir et contacter', action:'ouvrirAssistantAbsences()' });
    if(hasAccess('comptabilite')){
      const ret = famillesEnRetard();
      if(ret.length) lignes.push({ ic:'wallet', texte:`${ret.length} famille${ret.length > 1 ? 's' : ''} en retard de paiement`, detail:`${fmtFCFA(ret.reduce((s, x) => s + x.montant, 0))} dont la date limite est passée`, bouton:'Relancer', action:'ouvrirAssistantRetards()' });
    }
    const actifs = DB.eleves.filter(e => e.statut === 'Actif');
    const relies = new Set((DB.parentsEleves || []).map(pe => pe.eleveId));
    const nonRelies = actifs.filter(e => !relies.has(e.id)).length;
    if(actifs.length && nonRelies / actifs.length > 0.3 && hasAccess('liens-parents'))
      lignes.push({ ic:'users', texte:`${actifs.length - nonRelies} parent${actifs.length - nonRelies > 1 ? 's' : ''} sur ${actifs.length} élèves suivent leur enfant dans l’application`, detail:'Invitez les autres : ils verront absences, notes et paiements', bouton:'Inviter les parents', action:"go('liens-parents')" });
    const anniv = anniversairesDuJour();
    if(anniv.length) lignes.push({ ic:'party-popper', texte:`${anniv.length === 1 ? 'Anniversaire' : anniv.length + ' anniversaires'} aujourd’hui`, detail: anniv.slice(0, 3).map(e => `${eleveFullName(e)} (${classeName(e.classeId)})`).join(', ') + (anniv.length > 3 ? '…' : ''), bouton:'Voir', action:'ouvrirAssistantAnniversaires()' });
  }catch(_e){ /* un constat impossible à calculer n'empêche jamais l'affichage du tableau de bord */ }
  return lignes;
}

function ouvrirAssistantAbsences(){
  const abs = elevesAbsentsDeSuite(3);
  openModal('Élèves absents 3 jours de suite', `
    <p class="hint">Absents aux 3 derniers appels de leur classe. Un appel ou un message au parent rassure la famille et montre le sérieux de l’école.</p>
    <ul class="as-liste">${abs.map(({ eleve: e, depuis }) => { const wa = telWa(e.parentTel);
      const msg = `Bonjour ${e.parentNom || ''}, c’est l’école ${DB.meta?.nomEcole || ''}. ${e.prenom} est absent(e) depuis le ${fmtDate(depuis)}. Tout va bien ? Merci de nous donner des nouvelles.`;
      return `<li><div><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))} · depuis le ${fmtDate(depuis)} · ${escapeHtml(e.parentNom || 'parent non renseigné')}</small></div>
        <div class="as-actions">${e.parentTel ? `<a class="btn secondary sm" href="tel:${escapeHtml(String(e.parentTel).replace(/\s/g, ''))}">📞 Appeler</a>` : ''}${wa ? `<a class="btn sm" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : '<span class="hint">Pas de numéro</span>'}</div></li>`; }).join('')}</ul>`);
}
function ouvrirAssistantRetards(){
  const ret = famillesEnRetard();
  const nom = DB.meta?.nomEcole || 'l’école';
  openModal('Familles en retard de paiement', `
    <p class="hint">Date limite dépassée. Le message WhatsApp est déjà rédigé poliment : vous le relisez et vous l’envoyez vous-même.</p>
    <ul class="as-liste">${ret.map(({ eleve: e, montant, tranches, plusAncienne }) => { const wa = telWa(e.parentTel);
      const msg = `Bonjour ${e.parentNom || ''}, ${nom} vous rappelle que ${fmtFCFA(montant)} reste${tranches.length > 1 ? 'nt' : ''} à régler pour la scolarité de ${e.prenom} (${tranches.join(', ')}, date limite du ${fmtDate(plusAncienne)}). Vous pouvez payer à l’école ou par Mobile Money. Merci et bonne journée.`;
      return `<li><div><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))} · ${fmtFCFA(montant)} · ${escapeHtml(tranches.join(', '))}</small></div>
        <div class="as-actions">${wa ? `<a class="btn sm" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 Relancer</a>` : '<span class="hint">Pas de numéro</span>'}</div></li>`; }).join('')}</ul>
    <div class="form-actions"><button type="button" class="btn secondary" onclick="closeModal(); exporterScolariteExcel()">⬇️ Liste complète (Excel)</button></div>`);
}
function ouvrirAssistantAnniversaires(){
  const anniv = anniversairesDuJour();
  openModal('🎂 Anniversaires du jour', `<ul class="as-liste">${anniv.map(e => { const age = new Date().getFullYear() - Number(e.dateNaissance.slice(0, 4)); const wa = telWa(e.parentTel);
    const msg = `Bonjour ${e.parentNom || ''}, toute l’équipe de ${DB.meta?.nomEcole || 'l’école'} souhaite un joyeux anniversaire à ${e.prenom} pour ses ${age} ans ! 🎉`;
    return `<li><div><strong>${escapeHtml(eleveFullName(e))}</strong><small>${escapeHtml(classeName(e.classeId))} · ${age} ans</small></div>
      <div class="as-actions">${wa ? `<a class="btn sm" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 Souhaiter</a>` : ''}</div></li>`; }).join('')}</ul>`);
}
