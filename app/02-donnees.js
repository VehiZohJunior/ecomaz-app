/* ---------------------------------------------------------------------
   2. BASE DE DONNÉES — chargée depuis Supabase (voir supabase-client.js)
   --------------------------------------------------------------------- */
let DB = null;

// Noms officiels des applications :
//   personnel : EcoMaZ-<école> · parents : EcoMaZ-PARENTS D'ELEVES <école> · portier : EcoMaZ-PORTIER <école>
function nomApplication(nomEcole){
  const n = nomEcole || (typeof DB !== 'undefined' && DB && DB.meta && DB.meta.nomEcole) || (window.ECOLE_VITRINE && window.ECOLE_VITRINE.nom_ecole) || '';
  if(window.ESPACE_FIXE === 'parent') return "EcoMaZ-PARENTS D'ELEVES" + (n ? ' ' + n : '');
  if(window.ESPACE_FIXE === 'portier') return 'EcoMaZ-PORTIER' + (n ? ' ' + n : '');
  if(window.ESPACE_FIXE === 'enseignant') return 'EcoMaZ-ENSEIGNANTS' + (n ? ' ' + n : '');
  return n ? 'EcoMaZ-' + n : 'EcoMaZ';
}
// Le nom sous l'icône du téléphone vient du manifeste : on le génère à la volée
// avec le nom de l'école (les applications Parent/Portier le font dans espace-fixe.js).
function appliquerManifestePersonnel(titre){
  try{
    const base = new URL('./', window.location.href);
    const abs = f => new URL(f, base).href;
    const m = { name: titre, short_name: titre, description: 'Gestion scolaire : élèves, notes, présences, comptabilité',
      start_url: base.href, scope: base.href, display: 'standalone', background_color: '#ffffff', theme_color: '#0B1640', orientation: 'portrait-primary',
      icons: [
        { src: abs('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' } ] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    let link = document.querySelector('link[rel="manifest"]');
    if(!link){ link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    link.href = url;
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(meta) meta.setAttribute('content', titre);
  }catch(_e){ /* le manifeste statique reste utilisé */ }
}
function applyBranding(){
  const m = DB.meta;
  document.title = nomApplication(m.nomEcole);
  if(!window.ESPACE_FIXE) appliquerManifestePersonnel(nomApplication(m.nomEcole));
  $('#brandSchoolName').textContent = m.nomEcole;
  $('#anneeScolaire').textContent = m.anneeScolaire;
  $('#topbarPill').textContent = m.anneeScolaire || '';
  $('#topbarPill').title = `Année scolaire ${m.anneeScolaire || ''}`;
  const img = $('#brandLogoImg'), ph = $('#brandLogoEmoji');
  if(m.logo){
    img.src = m.logo; img.style.display = 'block'; ph.style.display = 'none';
    $('#favicon').href = m.logo;
  } else {
    img.style.display = 'none'; ph.style.display = 'block';
    $('#favicon').href = 'data:,';
  }
}

function buildSeed(existingMeta){
  const niveaux = existingMeta?.niveaux?.length ? existingMeta.niveaux : ['prescolaire','primaire'];
  const db = {
    meta: existingMeta ? {...existingMeta, niveaux} : {
      nomEcole: 'Groupe Scolaire Les Petits Génies',
      adresse: 'Cocody Angré, Abidjan',
      telephone: '+225 07 00 00 00 00',
      anneeScolaire: '2025-2026',
      directeurNom: 'Kouassi Jean-Baptiste',
      fondateurNom: "Aya Marie-Claire N'Guessan",
      logo: '',
      loyerMensuel: 500000,
      niveaux,
      heureArriveeAttendue: '07:30',
    },
    classes: classesForNiveaux(niveaux).map(c => ({...c, titulaireId:null})),
    eleves: [],
    enseignants: [],
    notes: [],
    presencesEleves: [],
    presencesEnseignants: [],
    emploiTemps: [],
    programmes: [],
    bulletinsComments: {},
    fraisScolarite: {...FRAIS_SCOLARITE_DEFAUT},
    paiementsScolarite: [],
    activites: [],
    inscriptionsActivites: [],
    paiementsCotisations: [],
    gadgets: [],
    ventesGadgets: [],
    personnelAutre: [],
    paiementsSalaires: [],
    depenses: [],
    messages: [],
    alertesPointage: [],
    echeancesScolarite: [],
    profiles: [],
  };

  /* --- Enseignants : un titulaire par classe + 2 spécialistes --- */
  let matricule = 1;
  db.classes.forEach(c=>{
    const g = Math.random()<0.5;
    const t = {
      id: uid(),
      matricule: `ENS-${String(matricule++).padStart(3,'0')}`,
      nom: pick(NOMS),
      prenom: pick(g?PRENOMS_G:PRENOMS_F),
      sexe: g?'M':'F',
      telephone: `07 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      email: '',
      classesAssignees: [c.id],
      matieres: MATIERES_BY_CYCLE[c.cycle].slice(0, c.cycle==='Primaire'?5:MATIERES_BY_CYCLE[c.cycle].length),
      dateEmbauche: toISO(new Date(2015+randInt(0,9), randInt(0,11), randInt(1,28))),
      statut: 'Actif',
      salaireMensuel: randInt(70,110)*1000,
    };
    t.email = `${t.prenom}.${t.nom}`.toLowerCase().replace(/[^a-z.]/g,'') + '@ecole.ci';
    db.enseignants.push(t);
    c.titulaireId = t.id;
  });
  const ensAnglaisEPS = ['Anglais','EPS'].map(mat=>{
    const g = Math.random()<0.5;
    const t = {
      id: uid(),
      matricule: `ENS-${String(matricule++).padStart(3,'0')}`,
      nom: pick(NOMS), prenom: pick(g?PRENOMS_G:PRENOMS_F), sexe:g?'M':'F',
      telephone: `07 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      email:'', classesAssignees: db.classes.filter(c=>MATIERES_BY_CYCLE[c.cycle].includes(mat)).map(c=>c.id),
      matieres:[mat], dateEmbauche: toISO(new Date(2016+randInt(0,7),randInt(0,11),randInt(1,28))), statut:'Actif',
      salaireMensuel: randInt(75,100)*1000,
    };
    t.email = `${t.prenom}.${t.nom}`.toLowerCase().replace(/[^a-z.]/g,'') + '@ecole.ci';
    db.enseignants.push(t);
    return t;
  });

  /* --- Élèves --- */
  const ageRange = {
    garderie:[2,3], ps:[3,4], ms:[4,5], gs:[5,6], cp1:[6,7], cp2:[7,8], ce1:[8,9], ce2:[9,10], cm1:[10,11], cm2:[11,12],
    sixieme:[11,12], cinquieme:[12,13], quatrieme:[13,14], troisieme:[14,15],
    seconde:[15,16], premiere:[16,17], terminale:[17,18],
    ge1:[18,20], ge2:[19,21], ge3:[20,22], ge4:[21,23], ge5:[22,24],
    fq1:[17,30], fq2:[17,30],
    fp1:[17,30], fp2:[17,30], fp3:[17,30],
    ft1:[17,30], ft2:[17,30], ft3:[17,30],
    l1:[18,22], l2:[19,23], l3:[20,24], m1:[21,26], m2:[22,27],
  };
  let elMat = 1;
  db.classes.forEach(c=>{
    const n = randInt(5,8);
    for(let i=0;i<n;i++){
      const g = Math.random()<0.5;
      const [amin,amax] = ageRange[c.id];
      const age = randInt(amin,amax);
      const birthYear = new Date().getFullYear() - age;
      const eleve = {
        id: uid(),
        matricule: `EL-${String(elMat++).padStart(4,'0')}`,
        nom: pick(NOMS),
        prenom: pick(g?PRENOMS_G:PRENOMS_F),
        sexe: g?'M':'F',
        dateNaissance: toISO(new Date(birthYear, randInt(0,11), randInt(1,28))),
        classeId: c.id,
        parentNom: `${pick(NOMS)} ${pick(Math.random()<0.5?PRENOMS_G:PRENOMS_F)}`,
        parentTel: `0${randInt(1,7)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
        parentAdresse: pick(['Cocody','Yopougon','Marcory','Treichville','Abobo','Koumassi','Angré','Riviera']) + ', Abidjan',
        dateInscription: toISO(new Date(2025, randInt(7,9), randInt(1,28))),
        statut: 'Actif',
      };
      db.eleves.push(eleve);
    }
  });

  /* --- Notes (Trimestre 1 complet, Trimestre 2 partiel) --- */
  db.eleves.forEach(el=>{
    const cycle = db.classes.find(c=>c.id===el.classeId).cycle;
    const matieres = MATIERES_BY_CYCLE[cycle];
    matieres.forEach(mat=>{
      db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 1', type:'Devoir', date: toISO(new Date(2025,9,randInt(1,28)))});
      db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 1', type:'Composition', date: toISO(new Date(2025,10,randInt(1,28)))});
      if(Math.random()<0.5){
        db.notes.push({id:uid(), eleveId:el.id, matiere:mat, note:randInt(8,20), noteSur:20, trimestre:'Trimestre 2', type:'Devoir', date: toISO(new Date(2026,0,randInt(1,28)))});
      }
    });
  });

  /* --- Présences élèves (12 derniers jours ouvrés) --- */
  const days = lastNWeekdays(12);
  days.forEach(date=>{
    db.eleves.forEach(el=>{
      const r = Math.random();
      const statut = r<0.88 ? 'Présent' : (r<0.96 ? 'Absent' : 'Retard');
      db.presencesEleves.push({id:uid(), date, classeId:el.classeId, eleveId:el.id, statut, motif: statut==='Présent' ? '' : pick(MOTIFS_ABSENCE)});
    });
  });

  /* --- Présences enseignants (12 derniers jours ouvrés) --- */
  days.forEach(date=>{
    db.enseignants.forEach(t=>{
      const r = Math.random();
      const statut = r<0.94 ? 'Présent' : (r<0.98 ? 'Absent' : 'Retard');
      db.presencesEnseignants.push({id:uid(), date, enseignantId:t.id, statut, motif: statut==='Présent' ? '' : pick(MOTIFS_ABSENCE)});
    });
  });

  /* --- Messages automatiques générés à partir des absences/retards ci-dessus --- */
  const destAdmin = [
    {nom: db.meta.directeurNom || 'Direction', role:'Directeur', tel:''},
    {nom: db.meta.fondateurNom || 'Fondation', role:'Fondateur', tel:''},
  ];
  db.presencesEleves.filter(p=>p.statut==='Absent').forEach(p=>{
    const el = db.eleves.find(x=>x.id===p.eleveId);
    const classe = db.classes.find(c=>c.id===el.classeId);
    const contenu = composeMsgAbsenceEleve(db.meta.nomEcole, `${el.prenom} ${el.nom}`, classe.nom, p.date, p.motif);
    [{nom:el.parentNom, role:'Parent', tel:el.parentTel}, ...destAdmin].forEach(d=>{
      db.messages.push({id:uid(), date:p.date, heure:`${randInt(7,17)}:${pad(randInt(0,59))}`, destinataireNom:d.nom, destinataireRole:d.role, destinataireTel:d.tel, canal:'SMS', type:'Absence élève', contenu, eleveId:el.id, enseignantId:null});
    });
  });
  db.presencesEnseignants.filter(p=>p.statut==='Absent' || p.statut==='Retard').forEach(p=>{
    const t = db.enseignants.find(x=>x.id===p.enseignantId);
    const contenu = composeMsgEnseignant(db.meta.nomEcole, `${t.prenom} ${t.nom}`, p.date, p.statut, p.motif);
    destAdmin.forEach(d=>{
      db.messages.push({id:uid(), date:p.date, heure:`${randInt(7,17)}:${pad(randInt(0,59))}`, destinataireNom:d.nom, destinataireRole:d.role, destinataireTel:d.tel, canal:'SMS', type: p.statut==='Absent'?'Absence enseignant':'Retard enseignant', contenu, eleveId:null, enseignantId:t.id});
    });
  });

  /* --- Emploi du temps --- */
  db.classes.forEach(c=>{
    const periodes = PERIODES_BY_CYCLE[c.cycle];
    const coursSlots = periodes.map((p,i)=>({...p,i})).filter(p=>p.type==='cours');
    const matieres = MATIERES_BY_CYCLE[c.cycle];
    let matIdx = 0;
    JOURS.forEach(jour=>{
      coursSlots.forEach(slot=>{
        let mat = matieres[matIdx % matieres.length]; matIdx++;
        let ensId = c.titulaireId;
        if(mat==='Anglais') ensId = ensAnglaisEPS[0].id;
        if(mat==='EPS') ensId = ensAnglaisEPS[1].id;
        db.emploiTemps.push({id:uid(), classeId:c.id, jour, slotIndex:slot.i, matiere:mat, enseignantId:ensId});
      });
    });
  });

  /* --- Programmes pédagogiques --- */
  db.classes.forEach(c=>{
    const matieres = MATIERES_BY_CYCLE[c.cycle].slice(0,3);
    matieres.forEach(mat=>{
      db.programmes.push({
        id: uid(), enseignantId: c.titulaireId, classeId: c.id, matiere: mat, trimestre:'Trimestre 1',
        contenu: `Progression du programme officiel de ${mat} pour le niveau ${c.nom} — chapitres 1 à 4 : notions de base, exercices d'application et évaluation formative.`,
        progression: randInt(40,100), dateMaj: todayISO(),
      });
    });
  });

  /* --- Comptabilité : scolarité --- */
  db.eleves.forEach(el=>{
    const du = db.fraisScolarite[el.classeId] || 250000;
    const r = Math.random();
    const cible = r<0.4 ? du : (r<0.85 ? Math.round(du*(randInt(20,80)/100)) : 0);
    const tranches = ['Inscription','Tranche 1','Tranche 2','Tranche 3'];
    let reste = cible, idx = 0;
    while(reste>0 && idx<tranches.length){
      const part = Math.min(reste, Math.round(du/4));
      db.paiementsScolarite.push({id:uid(), eleveId:el.id, montant:part, date: toISO(new Date(2025,9+idx,randInt(1,25))), tranche:tranches[idx], modePaiement:pick(MODES_PAIEMENT)});
      reste -= part; idx++;
    }
  });

  /* --- Comptabilité : activités extra-scolaires --- */
  const activitesSeed = [
    {nom:'Football', montantCotisation:15000, periode:'Trimestriel'},
    {nom:'Danse & Rythme', montantCotisation:12000, periode:'Trimestriel'},
    {nom:'Anglais Renforcé', montantCotisation:20000, periode:'Trimestriel'},
    {nom:'Initiation Informatique', montantCotisation:18000, periode:'Trimestriel'},
  ];
  db.activites = activitesSeed.map(a => ({id:uid(), ...a}));
  db.eleves.forEach(el=>{
    if(Math.random()<0.4){
      const chosen = [...db.activites].sort(()=>Math.random()-0.5).slice(0, randInt(1,2));
      chosen.forEach(act=>{
        db.inscriptionsActivites.push({id:uid(), eleveId:el.id, activiteId:act.id, dateInscription: toISO(new Date(2025,9,randInt(1,28)))});
        if(Math.random()<0.7){
          const montant = Math.random()<0.7 ? act.montantCotisation : Math.round(act.montantCotisation/2);
          db.paiementsCotisations.push({id:uid(), eleveId:el.id, activiteId:act.id, montant, date: toISO(new Date(2025,10,randInt(1,28))), modePaiement:pick(MODES_PAIEMENT)});
        }
      });
    }
  });

  /* --- Comptabilité : boutique scolaire (gadgets) --- */
  const gadgetsSeed = [
    {nom:'T-shirt de sport', prixUnitaire:5000, stock:40},
    {nom:'Cahier de texte officiel', prixUnitaire:1500, stock:80},
    {nom:'Casquette brodée', prixUnitaire:3500, stock:25},
    {nom:'Sac à dos logo école', prixUnitaire:12000, stock:15},
    {nom:'Polo brodé logo', prixUnitaire:6000, stock:30},
    {nom:'Porte-clés École', prixUnitaire:1000, stock:60},
  ];
  db.gadgets = gadgetsSeed.map(g => ({id:uid(), ...g}));
  for(let i=0;i<26;i++){
    const gadget = pick(db.gadgets);
    const qte = randInt(1,3);
    const eleve = Math.random()<0.7 ? pick(db.eleves) : null;
    db.ventesGadgets.push({id:uid(), gadgetId:gadget.id, eleveId: eleve?eleve.id:null, quantite:qte, montantTotal: gadget.prixUnitaire*qte, date: toISO(new Date(Date.now()-randInt(0,45)*86400000)), modePaiement:pick(MODES_PAIEMENT)});
    gadget.stock = Math.max(0, gadget.stock - qte);
  }

  /* --- Comptabilité : personnel non-enseignant --- */
  const personnelSeed = [
    {poste:"Gardien(ne)", salaireMensuel:65000},
    {poste:"Agent d'entretien", salaireMensuel:60000},
    {poste:"Cuisinier(ère)", salaireMensuel:70000},
    {poste:'Comptable', salaireMensuel:120000},
    {poste:'Secrétaire', salaireMensuel:90000},
  ];
  db.personnelAutre = personnelSeed.map(p=>{
    const g = Math.random()<0.5;
    return {
      id: uid(), nom: pick(NOMS), prenom: pick(g?PRENOMS_G:PRENOMS_F), sexe: g?'M':'F',
      poste: p.poste, telephone: `0${randInt(1,7)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
      salaireMensuel: p.salaireMensuel, dateEmbauche: toISO(new Date(2018+randInt(0,6),randInt(0,11),randInt(1,28))), statut:'Actif',
    };
  });

  /* --- Comptabilité : salaires (3 derniers mois) --- */
  const moisRecents = lastNMonths(3);
  const tousPersonnel = [
    ...db.enseignants.map(t => ({id:t.id, type:'enseignant', salaire:t.salaireMensuel})),
    ...db.personnelAutre.map(p => ({id:p.id, type:'autre', salaire:p.salaireMensuel})),
  ];
  moisRecents.forEach((mois, mi)=>{
    const estMoisCourant = mi === moisRecents.length-1;
    tousPersonnel.forEach(p=>{
      const paye = estMoisCourant ? Math.random()<0.55 : true;
      if(paye){
        const [y,m] = mois.split('-').map(Number);
        db.paiementsSalaires.push({id:uid(), personnelId:p.id, personnelType:p.type, mois, montant:p.salaire, datePaiement: toISO(new Date(y,m-1,randInt(25,28))), modePaiement:pick(MODES_PAIEMENT)});
      }
    });
  });

  /* --- Comptabilité : dépenses & charges (loyer inclus) --- */
  moisRecents.forEach(mois=>{
    const [y,m] = mois.split('-').map(Number);
    db.depenses.push({id:uid(), categorie:'Loyer', libelle:`Loyer mensuel — ${moisLabel(mois)}`, montant: db.meta.loyerMensuel, date: toISO(new Date(y,m-1,5)), modePaiement:'Virement bancaire'});
  });
  const depensesSeed = [
    {categorie:'Entretien', libelle:'Réparation plomberie sanitaires'},
    {categorie:'Entretien', libelle:'Peinture salle de classe'},
    {categorie:'Matériel pédagogique', libelle:'Achat de manuels scolaires'},
    {categorie:'Matériel pédagogique', libelle:'Tableaux et craies'},
    {categorie:'Fournitures scolaires', libelle:'Cahiers et fournitures de bureau'},
    {categorie:'Électricité & Eau', libelle:'Facture CIE (électricité)'},
    {categorie:'Électricité & Eau', libelle:'Facture SODECI (eau)'},
    {categorie:'Transport', libelle:'Carburant véhicule scolaire'},
    {categorie:'Restauration', libelle:'Achat vivres cantine'},
    {categorie:'Autre', libelle:'Fournitures de bureau administration'},
  ];
  depensesSeed.forEach(d=>{
    db.depenses.push({id:uid(), categorie:d.categorie, libelle:d.libelle, montant: randInt(15,120)*1000, date: toISO(new Date(Date.now()-randInt(0,150)*86400000)), modePaiement:pick(MODES_PAIEMENT)});
  });

  return db;
}

