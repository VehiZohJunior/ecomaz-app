/* =====================================================================
   BOUTON « RETOUR » (26/11/2026) — demande de Vehi Zoh Junior :
   « ajoute un bouton RETOUR à chaque module ou menu qui s'ouvre ».
   - Barre du haut : « ← Retour » sur chaque écran (sauf l'accueil) ;
     revient à l'écran précédent, ou à l'accueil s'il n'y en a pas.
   - Le bouton « retour » du téléphone (Android) fait la même chose ;
     il ferme d'abord la fenêtre ou le menu ouvert, s'il y en a un.
   go() appelle noterNavigation() et majBoutonRetour().
   ===================================================================== */
const navPile = [];
let navDepuisRetour = false;

function noterNavigation(de, vers){
  if(!de || de === vers) return;
  if(navDepuisRetour){ navDepuisRetour = false; return; }
  navPile.push(de);
  if(navPile.length > 40) navPile.shift();
  try{ history.pushState({ ecomaz: vers }, ''); }catch(_e){}
}
function majBoutonRetour(){
  const b = document.getElementById('btnRetour'); if(!b) return;
  const visible = !!ui.role && !['parent', 'portier'].includes(ui.role) && ui.currentView && ui.currentView !== 'dashboard';
  b.hidden = !visible;
  document.body.classList.toggle('avec-retour', visible);
}
// Bouton de la barre du haut
function retourArriere(){
  if(fermerCoucheOuverte()) return;
  if(navPile.length){ try{ history.back(); return; }catch(_e){} }
  if(ui.currentView !== 'dashboard') go('dashboard');
}
// Ferme d'abord ce qui est ouvert par-dessus l'écran (fenêtre, menu, panneaux)
function fermerCoucheOuverte(){
  if(document.querySelector('#modalBackdrop.open')){ closeModal(); return true; }
  const sb = document.getElementById('sidebar');
  if(sb && sb.classList.contains('open')){ sb.classList.remove('open'); document.getElementById('sidebarBackdrop')?.classList.remove('open'); return true; }
  if(typeof pc !== 'undefined' && pc.ouvert){ pcBasculer(false); return true; }
  const centre = document.getElementById('centreNotif');
  if(centre && centre.style.display !== 'none' && typeof toggleCentre === 'function'){ toggleCentre(false); return true; }
  return false;
}
// Bouton « retour » du téléphone
window.addEventListener('popstate', () => {
  if(!ui.role || ['parent', 'portier'].includes(ui.role)) return;
  if(fermerCoucheOuverte()){ try{ history.pushState({ ecomaz: ui.currentView }, ''); }catch(_e){} return; }
  const v = navPile.pop();
  if(v){ navDepuisRetour = true; go(v); }
  else if(ui.currentView && ui.currentView !== 'dashboard'){ navDepuisRetour = true; go('dashboard'); }
});
function viderNavigation(){ navPile.length = 0; navDepuisRetour = false; majBoutonRetour(); }
