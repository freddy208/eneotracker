/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react'; // Ajout de useMemo
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Share2, Zap, List, Map as MapIcon, Navigation, Lock, MapPin, AlertCircle, Info, Edit, Search, XCircle, CheckCircle, User, FileText } from 'lucide-react'; // Ajout d'icônes
import { supabase } from './lib/supabase';
import { quartiersDouala } from './data/quartiers';
import L from 'leaflet';

// --- 1. Composant Toast Notification (Feedback moderne) ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgClass = type === 'success' ? 'bg-green-600' : 'bg-red-600';
  
  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-2000 ${bgClass} text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce-in`}>
      {type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
      <span className="text-xs font-bold">{message}</span>
    </div>
  );
};

// Style d'icône dynamique
const createIcon = (color, isDown, count = 1) => {
  const size = Math.min(14 + count * 2, 32);
  return new L.DivIcon({
    html: `<div class="${isDown ? 'pulse-red' : ''}" style="background-color: ${color}; width: ${size}px; height: ${size}px; border: 3px solid white; border-radius: 50%; box-shadow: 0 3px 6px rgba(0,0,0,0.3);"></div>`,
    className: "custom-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = x => (x * Math.PI) / 180;
  const R = 6371e3; // Rayon de la Terre en mètres

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Retourne la distance en mètres
}; 

function App() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuartier, setSelectedQuartier] = useState('');
  const [userCoords, setUserCoords] = useState(null);
  const [activeTab, setActiveTab] = useState('map');
  const [userVotes, setUserVotes] = useState({});
  const [geoError, setGeoError] = useState('');
  
  // --- NOUVEAUX ÉTATS ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' ou 'down'
  const [showManualSelect, setShowManualSelect] = useState(false);
  const [toast, setToast] = useState(null);
  const [showLegal, setShowLegal] = useState(false); // État pour la modale légale

  useEffect(() => {
    const savedVotes = localStorage.getItem('eneo_tracker_votes');
    if (savedVotes) setUserVotes(JSON.parse(savedVotes));
    fetchReports();

    const channel = supabase.channel('realtime-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchReports = async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('reports').select('*').gt('created_at', fourHoursAgo);
    if (!error) setReports(data);
  };

  const canVote = (neighborhood) => {
    const lastVoteTime = userVotes[neighborhood];
    if (!lastVoteTime) return true;
    return Date.now() - lastVoteTime > 30 * 60 * 1000;
  };

  // --- GÉOCODAGE AMÉLIORÉ (Messages Contextuels) ---
  const detectLocationDynamic = () => {
    if (!navigator.geolocation) {
      setGeoError("Votre téléphone ne supporte pas la localisation GPS");
      setToast({ message: "GPS non disponible sur ce téléphone", type: 'error' });
      return;
    }
    
    setLoading(true);
    setGeoError('');
    setShowManualSelect(false);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords({ lat: latitude, lng: longitude });

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'EneoTracker/1.0 (Cameroon Power Outage Tracker)' } }
          );
          
          if (!res.ok) throw new Error('Erreur API');
          const data = await res.json();
          
          const neighborhood = 
            data.address.suburb || data.address.neighbourhood || 
            data.address.quarter || data.address.residential ||
            data.address.city_district || data.address.district || "Zone détectée";
          
          setSelectedQuartier(neighborhood);
          setGeoError('');
        } catch (e) {
          console.error("Erreur géocodage:", e);
          fallbackToStaticList(latitude, longitude);
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        setLoading(false);
        let errorMsg = "Pour signaler facilement, autorise la localisation GPS.";
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Autorisez la localisation dans les paramètres de votre téléphone";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Impossible de localiser votre position, réessayez";
            break;
          case error.TIMEOUT:
            errorMsg = "Le GPS a mis trop de temps, réessayez";
            break;
        }
        
        setGeoError(errorMsg);
        setToast({ message: errorMsg, type: 'error' });
        setShowManualSelect(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const fallbackToStaticList = (latitude, longitude) => {
    const closest = quartiersDouala.reduce((prev, curr) => {
      const distPrev = haversineDistance(latitude, longitude, prev.lat, prev.lng);
      const distCurr = haversineDistance(latitude, longitude, curr.lat, curr.lng);
      return (distCurr < distPrev) ? curr : prev;
    });

    setSelectedQuartier(closest.nom);
    setUserCoords({ lat: closest.lat, lng: closest.lng });
    setGeoError("Position précise introuvable. Quartier le plus proche sélectionné.");
  };

  const sendReport = async (status) => {
    if (!selectedQuartier) return setToast({ message: "Choisissez d'abord votre quartier", type: 'error' });
    
    if (!canVote(selectedQuartier)) {
      return setToast({ message: "Patiente 30 minutes avant de revoter", type: 'error' });
    }

    setLoading(true);
    const reportData = {
      neighborhood: selectedQuartier,
      status: status,
      lat: userCoords?.lat || null,
      lng: userCoords?.lng || null
    };

    const { error } = await supabase.from('reports').insert([reportData]);
    
    if (!error) {
      const updated = { ...userVotes, [selectedQuartier]: Date.now() };
      setUserVotes(updated);
      localStorage.setItem('eneo_tracker_votes', JSON.stringify(updated));
      fetchReports();
      setToast({ 
        message: `✅ Signalement pour ${selectedQuartier} envoyé !`, 
        type: 'success' 
      });
    } else {
      setToast({ message: "❌ Échec de l'envoi. Vérifie ta connexion.", type: 'error' });
    }
    
    setLoading(false);
  };

  // --- OPTIMISATION AVEC USEMEMO ---
  const neighborhoodStats = useMemo(() => {
    const stats = {};
    reports.forEach(report => {
      if (!stats[report.neighborhood]) {
        stats[report.neighborhood] = { down: 0, up: 0, reports: [] };
      }
      if (report.status === 'down') stats[report.neighborhood].down++;
      else stats[report.neighborhood].up++;
      stats[report.neighborhood].reports.push(report);
    });
    return stats;
  }, [reports]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 font-sans text-slate-900 pb-24 relative">
      
      {/* Affichage conditionnel du Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <header className="bg-linear-to-r from-slate-900 to-slate-800 text-white p-4 sticky top-0 z-1000 flex justify-between items-center shadow-2xl border-b-2 border-yellow-500">
        <div className="flex items-center gap-2">
          <Zap size={24} className="text-yellow-400 fill-current animate-pulse" />
          <h1 className="text-lg font-black uppercase italic tracking-tight">Eneo Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] bg-red-600 px-2 py-1 rounded font-bold">LIVE 237</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-5">
        
        {/* --- SECTION QUARTIER AMÉLIORÉE --- */}
        <section className="bg-white rounded-3xl p-6 shadow-xl border-2 border-slate-200 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col flex-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Ton Quartier
              </span>
              <div className="flex items-center gap-2">
                <MapPin size={16} className={selectedQuartier ? "text-green-600" : "text-slate-400"} />
                <span className="text-sm font-bold text-slate-800">
                  {selectedQuartier || "Pas encore détecté"}
                </span>
                
                {/* Bouton changer de quartier */}
                {selectedQuartier && (
                  <button 
                    onClick={() => setShowManualSelect(true)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded-full transition"
                    title="Changer de quartier"
                  >
                    <Edit size={14} />
                  </button>
                )}
              </div>
              
              {geoError && (
                <div className="flex items-center gap-1 mt-2 bg-orange-50 p-1.5 rounded-lg border border-orange-100">
                  <AlertCircle size={12} className="text-orange-500" />
                  <span className="text-[10px] text-orange-700 font-medium">{geoError}</span>
                </div>
              )}
            </div>
            
            <button 
              onClick={detectLocationDynamic} 
              disabled={loading}
              className="bg-linear-to-br from-slate-900 to-slate-700 text-white p-3 rounded-2xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
              title="Détecter automatiquement votre quartier"
            >
              <Navigation size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Sélection manuelle */}
          {(!selectedQuartier || showManualSelect) && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 mb-4">
              <div className="flex gap-2">
                <select 
                  className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-blue-400 transition"
                  onChange={(e) => {
                    const quartierNom = e.target.value;
                    setSelectedQuartier(quartierNom);
                    
                    const quartierInfos = quartiersDouala.find(q => q.nom === quartierNom);
                    if (quartierInfos) {
                      setUserCoords({ lat: quartierInfos.lat, lng: quartierInfos.lng });
                    }
                    
                    setShowManualSelect(false);
                  }}
                  value={selectedQuartier || ""}
                >
                  <option value="">📍 Choisir mon quartier manuellement...</option>
                  {quartiersDouala.map(q => (
                    <option key={q.nom} value={q.nom}>{q.nom}</option>
                  ))}
                </select>
                {showManualSelect && (
                  <button onClick={() => setShowManualSelect(false)} className="bg-slate-100 p-2 rounded-xl hover:bg-slate-200 transition">
                    <XCircle size={20} className="text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Info bulle explicative */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 rounded-lg">
            <div className="flex gap-2 items-start">
              <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-blue-800 leading-relaxed">
                <strong>Signaler une coupure</strong> = dire que le courant est coupé chez toi. 
                <br/><strong>Rétabli</strong> = dire que l'électricité est revenue.
              </p>
            </div>
          </div>

          {/* Boutons de signalement */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => sendReport('down')} 
              disabled={loading || !selectedQuartier || !canVote(selectedQuartier)}
              className={`py-4 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${
                canVote(selectedQuartier) && selectedQuartier
                  ? 'bg-red-600 text-white hover:bg-red-700 hover:-translate-y-1 hover:shadow-xl' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {!canVote(selectedQuartier) && selectedQuartier && <Lock size={14} />}
              🛑 COUPURE
            </button>
            
            <button 
              onClick={() => sendReport('up')} 
              disabled={loading || !selectedQuartier || !canVote(selectedQuartier)}
              className={`py-4 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${
                canVote(selectedQuartier) && selectedQuartier
                  ? 'bg-green-600 text-white hover:bg-green-700 hover:-translate-y-1 hover:shadow-xl' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {!canVote(selectedQuartier) && selectedQuartier && <Lock size={14} />}
              💡 RÉTABLI
            </button>
          </div>
          
          {/* Badge visuel pour le timer de vote */}
          {!canVote(selectedQuartier) && selectedQuartier && (
            <div className="bg-orange-50 border border-orange-200 text-orange-700 text-[10px] font-bold text-center py-2 mt-3 rounded-full flex items-center justify-center gap-2 animate-pulse">
               <Lock size={12} /> 
               Vote bloqué pour {Math.ceil((10 * 60 * 1000 - (Date.now() - userVotes[selectedQuartier])) / 60000)} min
            </div>
          )}
        </section>

        {/* Statistiques rapides */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 text-center shadow-md border border-slate-100">
            <div className="text-2xl font-black text-red-600">{Object.values(neighborhoodStats).filter(s => s.down > s.up).length}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase">Sans courant</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-md border border-slate-100">
            <div className="text-2xl font-black text-green-600">{Object.values(neighborhoodStats).filter(s => s.up >= s.down).length}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase">Avec courant</div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-md border border-slate-100">
            <div className="text-2xl font-black text-slate-800">{reports.length}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase">Signalements</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-200/60 p-1.5 rounded-2xl shadow-inner">
          <button 
            onClick={() => setActiveTab('map')} 
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
              activeTab === 'map' ? 'bg-white shadow-lg text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapIcon size={16} /> CARTE LIVE
          </button>
          <button 
            onClick={() => setActiveTab('list')} 
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
              activeTab === 'list' ? 'bg-white shadow-lg text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List size={16} /> LISTE
          </button>
        </div>

        {/* --- VUE CARTE --- */}
        {activeTab === 'map' && (
          <div className="rounded-3xl overflow-hidden shadow-2xl h-125 border-4 border-white">
            <MapContainer center={[4.05, 9.70]} zoom={12} className="h-full w-full">
              <TileLayer 
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              {Object.entries(neighborhoodStats).map(([neighborhood, stats]) => {
                const reportWithCoords = stats.reports.find(r => r.lat && r.lng);
                if (!reportWithCoords) return null;
                const isDown = stats.down > stats.up;
                const totalCount = stats.down + stats.up;
                return (
                  <Marker 
                    key={neighborhood}
                    position={[reportWithCoords.lat, reportWithCoords.lng]} 
                    icon={createIcon(isDown ? '#dc2626' : '#16a34a', isDown, totalCount)}
                  >
                    <Popup>
                      <div className="text-center p-2">
                        <p className="font-black text-sm uppercase text-slate-800 mb-1">{neighborhood}</p>
                        <div className="flex gap-2 justify-center mb-2">
                          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold">🛑 {stats.down}</span>
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold">💡 {stats.up}</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        )}

        {/* --- VUE LISTE AVEC RECHERCHE ET FILTRES CORRIGÉS --- */}
        {activeTab === 'list' && (
          <div className="space-y-3">
            {/* Barre de recherche */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un quartier..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filtres Rapides CORRIGÉS */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button 
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                }} 
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition whitespace-nowrap ${
                  statusFilter === 'all' 
                    ? 'bg-slate-800 text-white border-slate-800' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Tout
              </button>
              <button 
                onClick={() => {
                  setStatusFilter('down');
                  setSearchQuery('');
                }} 
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition whitespace-nowrap ${
                  statusFilter === 'down'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                Coupés seulement
              </button>
            </div>

            {/* Liste des quartiers avec filtres appliqués */}
            {Object.entries(neighborhoodStats)
              .filter(([name]) => name.toLowerCase().includes(searchQuery.toLowerCase()))
              .filter(([_, stats]) => {
                if (statusFilter === 'down') return stats.down > stats.up;
                return true;
              })
              .sort((a, b) => {
                const aDown = a[1].down > a[1].up;
                const bDown = b[1].down > b[1].up;
                if (aDown !== bDown) return bDown - aDown;
                return (b[1].down + b[1].up) - (a[1].down + a[1].up);
              })
              .map(([neighborhood, stats]) => {
                const isDown = stats.down > stats.up;
                const isCritical = stats.down > 5;

                return (
                  <div 
                    key={neighborhood} 
                    className={`bg-white p-4 rounded-2xl flex justify-between items-center shadow-md border-l-4 transition hover:shadow-lg ${
                      isDown ? 'border-red-600' : 'border-green-600'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{neighborhood}</span>
                        {isCritical && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold animate-pulse">CRITIQUE</span>}
                      </div>
                      
                      <div className="flex gap-3 mt-1.5 text-[10px] font-bold">
                        <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded">🛑 {stats.down}</span>
                        <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded">💡 {stats.up}</span>
                      </div>
                    </div>
                    
                    <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${
                      isDown ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {isDown ? 'COUPÉ' : 'OK'}
                    </div>
                  </div>
                );
              })}
            
            {/* Messages conditionnels */}
            {Object.keys(neighborhoodStats).length === 0 && (
              <div className="bg-white p-8 rounded-2xl text-center shadow-sm">
                <Zap size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold">Aucun signalement récent</p>
                <p className="text-[11px] text-slate-400 mt-1">Sois le premier à vérifier le courant !</p>
              </div>
            )}

            {Object.keys(neighborhoodStats).length > 0 && !Object.entries(neighborhoodStats).some(([_, s]) => s.down > s.up) && (
              <div className="bg-green-50 p-4 rounded-2xl text-center border border-green-100 flex flex-col items-center gap-2">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle size={24} className="text-green-600" />
                </div>
                <p className="text-green-800 font-bold text-sm">✅ Tout va bien, pas de coupure signalée !</p>
                <p className="text-[10px] text-green-700">Profite du courant, tes voisins aussi.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* --- NOUVEAU FOOTER: Bouton WhatsApp à GAUCHE (Style Chat) --- */}
      <footer className="fixed bottom-4 left-4 z-50">
        <button 
          onClick={() => {
            const message = `⚡ Vérifie le courant dans ton quartier et préviens tes voisins !\n${window.location.href}\n\n📍 Signalements en direct\n🗺️ Carte interactive`;
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
          }}
          className="bg-linear-to-r from-green-500 to-green-600 text-white px-5 py-3 rounded-full font-black shadow-xl shadow-green-500/30 flex items-center gap-2 text-xs hover:scale-105 transition-transform active:scale-95 border-b-4 border-green-700"
        >
          <Share2 size={18} /> ALERTER MES VOISINS
        </button>
      </footer>

      {/* --- NOUVEAU: Bouton Mentions Légales à DROITE --- */}
      <div className="fixed bottom-4 right-4 z-50">
        <button 
          onClick={() => setShowLegal(true)}
          className="bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700 transition-colors border-2 border-white"
          title="Mentions Légales"
        >
          <Info size={20} />
        </button>
      </div>

      {/* --- MODALE MENTIONS LÉGALES --- */}
      {showLegal && (
        <div className="fixed inset-0 z-3000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <h2 className="text-sm font-black uppercase tracking-wider">Informations Légales</h2>
              <button onClick={() => setShowLegal(false)} className="p-1 hover:bg-slate-700 rounded-full transition">
                <XCircle size={20} className="text-slate-400 hover:text-white" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              {/* Section NORR */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <FileText size={16} className="text-blue-600" />
                  <h3>Éditeur</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cette application est éditée par <strong>KEPTUKWA Freddy</strong>.<br/>
                  Si vous avez des questions ou des réclamations, veuillez nous contacter via notre numero whatsapp +237 620 187 495.
                </p>
              </div>

              <div className="h-px bg-slate-100 w-full"></div>

              {/* Section Mes Informations */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <User size={16} className="text-green-600" />
                  <h3>Mes Informations</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Localisation :</strong> L'application utilise votre position GPS uniquement pour détecter votre quartier et placer le signalement sur la carte. Ces données ne sont pas utilisées à des fins commerciales.
                </p>
                <p className="text-xs text-slate-600 leading-relaxed mt-2">
                  <strong>Vote :</strong> Votre dernier vote pour chaque quartier est enregistré localement sur votre appareil (LocalStorage) pour éviter les abus et respecter le délai de 30 minutes entre deux signalements.
                </p>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-[10px] text-blue-800 text-center">
                  Cette application est un service communautaire gratuit.
                </p>
              </div>

            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setShowLegal(false)}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs hover:bg-slate-800 transition shadow-lg"
              >
                J'ai compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles CSS additionnels */}
      <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        .pulse-red {
          animation: pulse-red 1.5s ease-in-out infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        @keyframes bounceIn {
            0% { transform: translate(-50%, -100%); opacity: 0; }
            50% { transform: translate(-50%, 10%); opacity: 1; }
            70% { transform: translate(-50%, -5%); }
            100% { transform: translate(-50%, 0); opacity: 1; }
        }
        .animate-bounce-in {
            animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}

export default App;