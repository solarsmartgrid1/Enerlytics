import React, { useState, useEffect, useContext, createContext, useRef } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Sun, Moon, CloudRain, Cloud, Battery, Zap, Activity, Users, 
  Shield, Droplets, ArrowRightLeft, DollarSign,
  Cpu, AlertCircle, CheckCircle2, LogOut, Download, 
  Plus, Trash2, Info, CloudLightning,
  Server, LayoutGrid, List, BrainCircuit, Clock, AlertTriangle,
  UserCog, MapPin, Phone, Edit2, Save, X
} from 'lucide-react';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, query, orderBy, limit, deleteDoc, updateDoc, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPVgiwfcwmq_oTgwXtTOkWrXW4bCY_tXI",
  authDomain: "solarenerlytics-141e0.firebaseapp.com",
  projectId: "solarenerlytics-141e0",
  storageBucket: "solarenerlytics-141e0.firebasestorage.app",
  messagingSenderId: "59874418021",
  appId: "1:59874418021:web:9aa10a78914f14e508558c",
  measurementId: "G-42VZLJ68X9"
};

let app, analytics, auth, db;
try {
  app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.warn("Running in local simulation mode. Firebase SDK deferred.");
}

// ==========================================
// 1. CONSTANTS, UTILS & ML PREDICTOR
// ==========================================
const TARIFF = { BUY: 0.15, SELL: 0.05 };
// Heavy Glassmorphism Card Style
const modernCard = "bg-white/60 dark:bg-[#12121A]/60 backdrop-blur-2xl border border-white/50 dark:border-white/10 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-all duration-500 ease-out hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_20px_40px_rgb(0,0,0,0.4)] hover:-translate-y-1 relative overflow-hidden group";
const modernButton = "flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold transition-all duration-300 ease-spring active:scale-95 shadow-md hover:shadow-lg";

const mapWmoToState = (code) => {
  if (code <= 3) return { id: 'SUNNY', name: 'Clear Sky', icon: Sun, color: 'text-emerald-500' };
  if (code >= 45 && code <= 48) return { id: 'CLOUDY', name: 'Overcast', icon: Cloud, color: 'text-slate-500' };
  if (code >= 51) return { id: 'RAINY', name: 'Precipitation', icon: CloudRain, color: 'text-blue-500' };
  return { id: 'SUNNY', name: 'Clear', icon: Sun, color: 'text-emerald-500' };
};

// --- MACHINE LEARNING & HYSTERESIS ENGINE ---
const SolarMLPredictor = {
  predictEfficiency: (cloudCover, rainProb, maxTemp) => {
    let efficiency = 1.0; 
    efficiency -= (cloudCover * 0.006);
    efficiency -= (rainProb * 0.003);
    if (maxTemp > 25) efficiency -= ((maxTemp - 25) * 0.004); 
    return Math.max(0.1, Math.min(1.0, efficiency)); 
  },

  decideAction: (efficiencyPct, batteryPct) => {
    if (batteryPct < 40) {
      return { strategy: "Import Mode (Low SoC)", batteryPolicy: "Priority Charging", relays: { r1: true, r2: false, r3: true }, color: "text-rose-500" };
    }
    if (batteryPct >= 85) {
      if (efficiencyPct > 50) return { strategy: "Aggressive Export", batteryPolicy: "Full / Discharging", relays: { r1: false, r2: true, r3: false }, color: "text-emerald-500" };
      else return { strategy: "Weather Hoard Mode", batteryPolicy: "Hold Charge (Low Sun)", relays: { r1: true, r2: true, r3: false }, color: "text-amber-500" };
    }
    return { strategy: efficiencyPct > 70 ? "Balanced (High Yield)" : "Balanced Cycle", batteryPolicy: "Standard Operation", relays: { r1: true, r2: true, r3: false }, color: "text-blue-500" };
  }
};

// ==========================================
// 2. CONTEXTS
// ==========================================
const AuthContext = createContext();
const ThemeContext = createContext();
const ToastContext = createContext();
const DataContext = createContext();

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border text-sm font-bold flex items-center gap-3 animate-fade-slide-up pointer-events-auto transition-all ${
            t.type === 'error' ? 'bg-red-50/90 dark:bg-red-950/80 border-red-200/50 dark:border-red-900/50 text-red-700 dark:text-red-400' : 
            t.type === 'success' ? 'bg-emerald-50/90 dark:bg-emerald-950/80 border-emerald-200/50 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400' : 
            'bg-white/90 dark:bg-[#1A1A24]/90 border-slate-200/50 dark:border-[#2A2A35]/50 text-slate-800 dark:text-slate-200'
          }`}>
            {t.type === 'error' ? <AlertCircle className="w-5 h-5" /> : t.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const DataProvider = ({ children, user }) => {
  const { addToast } = useContext(ToastContext);
  
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(user); 
  
  const [history, setHistory] = useState([]);
  const [liveData, setLiveData] = useState({
    timestamp: Date.now(),
    solar: { voltage: 14.2, current: 4.5, power: 63.9 },
    battery: { voltage: 12.8, percentage: 82, temp: 29 },
    load: { power: 45.0 },
    grid: { voltage: 230, importExport: -18.9 }, 
    relays: { mode: 'auto', r1: true, r2: true, r3: false },
    weather: { current: null, forecast: [], loading: true },
    mlDecision: null,
    billing: { imported: 0, exported: 0, lastReset: new Date().toISOString() } 
  });

  useEffect(() => {
    if (user.role === 'admin' && db) {
      getDocs(collection(db, 'users')).then(snap => {
        const fetchedClients = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.role !== 'admin');
        setClients(fetchedClients);
        if (fetchedClients.length > 0 && activeClient.uid === user.uid) {
          const hwClient = fetchedClients.find(c => c.dataType === 'real');
          setActiveClient(hwClient || fetchedClients[0]); 
        }
      });
    }
  }, [user]);

  const handleClientChange = (uid) => {
    const selected = clients.find(c => c.uid === uid);
    if (selected) {
      setActiveClient(selected);
      setHistory([]); 
    }
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloudcover_mean&timezone=Asia%2FKolkata');
        const data = await res.json();
        
        const forecast = data.daily.time.map((time, index) => {
          const wmoState = mapWmoToState(data.daily.weathercode[index]);
          const effRatio = SolarMLPredictor.predictEfficiency(data.daily.cloudcover_mean[index], data.daily.precipitation_probability_max[index], data.daily.temperature_2m_max[index]);
          return {
            date: new Date(time).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
            maxTemp: data.daily.temperature_2m_max[index], minTemp: data.daily.temperature_2m_min[index],
            rainProb: data.daily.precipitation_probability_max[index], cloudCover: data.daily.cloudcover_mean[index],
            efficiencyPct: Math.round(effRatio * 100),
            ...wmoState
          };
        });
        setLiveData(prev => ({ ...prev, weather: { current: forecast[0], forecast, loading: false } }));
      } catch (err) {
        addToast("Weather Engine failed. Using defaults.", "error");
      }
    };
    fetchWeather();
  }, []);

  useEffect(() => {
    if (liveData.weather.current) {
      const decision = SolarMLPredictor.decideAction(liveData.weather.current.efficiencyPct, liveData.battery.percentage);
      setLiveData(prev => {
        let shouldUpdate = false;
        const updates = {};
        if (prev.mlDecision?.strategy !== decision.strategy || prev.mlDecision?.batteryPolicy !== decision.batteryPolicy) {
          updates.mlDecision = decision;
          shouldUpdate = true;
        }
        if (prev.relays.mode === 'auto') {
          const r1Changed = prev.relays.r1 !== decision.relays.r1;
          const r2Changed = prev.relays.r2 !== decision.relays.r2;
          const r3Changed = prev.relays.r3 !== decision.relays.r3;
          if (r1Changed || r2Changed || r3Changed) {
            updates.relays = { ...prev.relays, ...decision.relays };
            shouldUpdate = true;
            if (activeClient.dataType === 'real' && activeClient.espId && db) {
              setDoc(doc(db, 'devices', activeClient.espId), { relays: updates.relays }, { merge: true }).catch(()=>{});
            }
          }
        }
        return shouldUpdate ? { ...prev, ...updates } : prev;
      });
    }
  }, [liveData.battery.percentage, liveData.relays.mode, liveData.weather.current, activeClient]);

  // PERMANENT FIREBASE SYNC 
  useEffect(() => {
    let unsubLive = null;
    let unsubHist = null;
    let simInterval = null;

    if (!activeClient || !db) return;

    const deviceId = activeClient.dataType === 'real' ? activeClient.espId : `sim_${activeClient.uid}`;

    // Listen to Live State & Billing
    const docRef = doc(db, 'devices', deviceId);
    unsubLive = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const espTime = data.timestamp ? parseInt(data.timestamp) * 1000 : Date.now();
        
        setLiveData(prev => ({
          ...prev,
          timestamp: espTime,
          solar: {
            voltage: data.solar?.voltage ?? prev.solar.voltage,
            current: data.solar?.current ?? prev.solar.current,
            power: data.solar?.power ?? prev.solar.power
          },
          battery: {
            percentage: data.battery?.percentage ?? prev.battery.percentage,
            voltage: data.battery?.voltage ?? prev.battery.voltage,
            temp: data.battery?.temp ?? prev.battery.temp
          },
          load: { power: data.load?.power ?? prev.load.power },
          grid: {
            voltage: data.grid?.voltage ?? prev.grid.voltage,
            importExport: data.grid?.importExport ?? prev.grid.importExport
          },
          relays: data.relays || prev.relays,
          billing: {
            imported: data.billing?.imported ?? prev.billing.imported,
            exported: data.billing?.exported ?? prev.billing.exported,
            lastReset: data.billing?.lastReset ?? prev.billing.lastReset
          }
        }));
      }
    });

    // Load History. Scaled limit to 3000 to hold plenty of 3-second data loops
    const histQuery = query(collection(db, 'devices', deviceId, 'history'), orderBy('id', 'desc'), limit(3000));
    unsubHist = onSnapshot(histQuery, (snap) => {
      const fetchedHist = snap.docs.map(d => {
        const raw = d.data();
        const timeMs = parseInt(raw.id || d.id);
        const dateObj = new Date(timeMs);
        return {
          id: timeMs,
          timestamp: dateObj.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          shortTime: dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          solarV: (parseFloat(raw.solarV) || 0).toFixed(1),
          solarI: (parseFloat(raw.solarI) || 0).toFixed(1),
          solarP: (parseFloat(raw.solarP) || 0).toFixed(1),
          batteryPct: parseInt(raw.batteryPct) || 0,
          loadP: (parseFloat(raw.loadP) || 0).toFixed(1),
          gridStatus: (parseFloat(raw.gridExport) || 0) < 0 ? 'Exporting' : 'Importing'
        };
      });
      setHistory(fetchedHist);
    });

    // SIMULATOR LOGIC
    if (activeClient.dataType === 'sim') {
      let lastTime = Date.now();

      simInterval = setInterval(() => {
        const simTime = Date.now();
        const deltaHours = (simTime - lastTime) / 3600000.0;
        lastTime = simTime;

        setLiveData(prev => {
          let newBat = prev.battery.percentage;
          if (prev.relays.r1) newBat += 0.8; 
          if (prev.relays.r2) newBat -= 0.5; 
          newBat = Math.max(0, Math.min(100, newBat)); 
          const newSolarP = Math.max(0, prev.solar.power + (Math.random() * 2 - 1));
          const newLoadP = Math.max(10, 20 + (Math.random() * 2 - 1));
          const gridExp = newLoadP - newSolarP;
          
          // Real-Time Simulator Billing Math
          const addedImport = gridExp > 0 ? (gridExp * deltaHours) / 1000.0 : 0;
          const addedExport = gridExp < 0 ? (Math.abs(gridExp) * deltaHours) / 1000.0 : 0;
          const newImportTotal = prev.billing.imported + addedImport;
          const newExportTotal = prev.billing.exported + addedExport;

          // Push Live & Billing
          setDoc(docRef, {
            timestamp: Math.floor(simTime / 1000), 
            solar: { power: newSolarP, voltage: prev.solar.voltage, current: prev.solar.current },
            battery: { percentage: newBat, voltage: prev.battery.voltage, temp: prev.battery.temp },
            load: { power: newLoadP },
            grid: { importExport: gridExp },
            relays: prev.relays,
            billing: { imported: newImportTotal, exported: newExportTotal }
          }, { merge: true });

          // Push History Every 3 Seconds (Every Loop)
          const timeMsStr = simTime.toString();
          setDoc(doc(db, 'devices', deviceId, 'history', timeMsStr), {
            id: timeMsStr,
            solarV: prev.solar.voltage,
            solarI: prev.solar.current,
            solarP: newSolarP,
            batteryPct: newBat,
            loadP: newLoadP,
            gridExport: gridExp
          });

          return { ...prev, timestamp: simTime, solar: { ...prev.solar, power: newSolarP }, battery: { ...prev.battery, percentage: newBat }, load: { ...prev.load, power: newLoadP }, grid: { ...prev.grid, importExport: gridExp }, billing: { imported: newImportTotal, exported: newExportTotal, lastReset: prev.billing.lastReset } };
        });
      }, 3000); // 3 Second Loop
    }

    return () => {
      if (unsubLive) unsubLive();
      if (unsubHist) unsubHist();
      if (simInterval) clearInterval(simInterval);
    };
  }, [activeClient]);

  const api = {
    updateRelayMode: (mode) => {
      setLiveData(prev => ({ ...prev, relays: { ...prev.relays, mode } }));
      if (activeClient?.dataType === 'real' && activeClient?.espId && db) {
        setDoc(doc(db, 'devices', activeClient.espId), { relays: { mode } }, { merge: true }).catch(()=>{});
      }
    },
    updateMultipleRelays: async (newRelays) => {
      setLiveData(prev => ({ ...prev, relays: { ...prev.relays, ...newRelays } }));
      if (activeClient?.dataType === 'real' && activeClient?.espId && db) {
        try { await setDoc(doc(db, 'devices', activeClient.espId), { relays: newRelays }, { merge: true }); } 
        catch (e) { console.error("Hardware sync issue"); }
      }
    },
    deleteUser: async (uid) => {
      try {
        await deleteDoc(doc(db, 'users', uid));
        setClients(prev => prev.filter(c => c.uid !== uid));
        addToast('Client removed from directory.', 'success');
      } catch (e) {
        addToast('Failed to remove client.', 'error');
      }
    }
  };

  return <DataContext.Provider value={{ liveData, history, clients, api, activeClient, setActiveClientId: handleClientChange }}>{children}</DataContext.Provider>;
};

// ==========================================
// 4. UI COMPONENTS & LAYOUT
// ==========================================
const LiveStatusBadge = ({ timestamp }) => {
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    const checkLive = () => setIsLive(Date.now() - timestamp < 15000);
    checkLive();
    const interval = setInterval(checkLive, 2000);
    return () => clearInterval(interval);
  }, [timestamp]);

  const formattedDate = new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  }).toUpperCase();

  if (isLive) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-extrabold tracking-wide border border-emerald-500/20 transition-all shrink-0 shadow-sm" title={`Last data: ${formattedDate}`}>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        SYSTEM LIVE
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200/50 dark:bg-[#2A2A35]/50 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-bold border border-slate-300/50 dark:border-[#3A3A45]/50 transition-all shrink-0 shadow-sm backdrop-blur-sm">
      <Clock className="w-3 h-3 opacity-60" />
      <span className="whitespace-nowrap truncate max-w-[120px]">{formattedDate}</span>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null); 
  const [theme, setTheme] = useState('light');
  const [authLoading, setAuthLoading] = useState(true);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    if (!auth) return setAuthLoading(false);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (db) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: firebaseUser.uid, ...userDoc.data() });
          } else {
            const role = firebaseUser.email === 'dilipgowda7259@gmail.com' ? 'admin' : 'user';
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role, dataType: 'sim', name: firebaseUser.email.split('@')[0], mobile: 'N/A', location: 'N/A' });
          }
        } else {
          setUser({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'admin', dataType: 'sim', name: 'Admin', mobile: 'N/A', location: 'N/A' });
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6F8] dark:bg-[#09090E]">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ToastProvider>
        <AuthContext.Provider value={{ user, setUser }}>
          <div className="min-h-screen font-sans flex flex-col relative bg-[#F4F6F8] dark:bg-[#09090E] text-slate-900 dark:text-slate-100 transition-colors duration-500 overflow-x-hidden selection:bg-emerald-500/30">
            <style>{`
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
              
              .glass-bg-elements { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
              .blob-1 { position: absolute; top: -10%; left: -10%; width: 50%; height: 50%; background: rgba(16, 185, 129, 0.15); filter: blur(120px); border-radius: 50%; animation: pulse-slow 8s infinite alternate; }
              .blob-2 { position: absolute; bottom: -10%; right: -10%; width: 50%; height: 50%; background: rgba(99, 102, 241, 0.12); filter: blur(120px); border-radius: 50%; animation: pulse-slow 10s infinite alternate-reverse; }
              .dark .blob-1 { background: rgba(16, 185, 129, 0.1); }
              .dark .blob-2 { background: rgba(99, 102, 241, 0.08); }
              
              @keyframes pulse-slow {
                0% { transform: scale(1) translate(0, 0); opacity: 0.8; }
                100% { transform: scale(1.1) translate(20px, 20px); opacity: 1; }
              }

              @keyframes fadeSlideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .animate-fade-slide-up { animation: fadeSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
              
              .ease-spring { transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            `}</style>
            
            <div className="glass-bg-elements">
              <div className="blob-1" />
              <div className="blob-2" />
            </div>

            <div className="relative z-10 flex-1 flex flex-col h-full w-full">
              {!user ? <LoginPage /> : (
                <DataProvider user={user}>
                  <MainLayout />
                </DataProvider>
              )}
            </div>
          </div>
        </AuthContext.Provider>
      </ToastProvider>
    </ThemeContext.Provider>
  );
}

const LoginPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('dilipgowda7259@gmail.com');
  const [password, setPassword] = useState('RVCE@1234');
  
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [location, setLocation] = useState('');
  
  const [dataType, setDataType] = useState('sim');
  const [espId, setEspId] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (val && isSignUp) {
      const suggested = val.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      setEspId(`${suggested}_hardware`);
    } else {
      setEspId('');
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!auth || !db) throw new Error("Firebase SDK not initialized.");

      if (isSignUp) {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCred.user.uid), {
          name, email, mobile, location, role: 'user', dataType, espId: dataType === 'real' ? espId : ''
        });
      } else {
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (loginErr) {
          if (email === 'dilipgowda7259@gmail.com' && password === 'RVCE@1234' && (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential')) {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, 'users', userCred.user.uid), {
              name: 'System Admin', email, mobile: '0000000000', location: 'Headquarters', role: 'admin', dataType: 'sim', espId: ''
            });
          } else {
            throw loginErr;
          }
        }
      }
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
         setError('Account temporarily locked due to too many failed attempts. Try again later.');
      } else if (err.code === 'auth/email-already-in-use') {
         setError('An account with this email already exists. Please log in.');
      } else {
         setError(err.message.replace('Firebase:', '').trim());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 animate-fade-slide-up">
      <div className={`${modernCard} max-w-md w-full p-8 sm:p-10 !rounded-[2.5rem] border-white/60 dark:border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)]`}>
        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-tr from-slate-900 to-slate-800 dark:from-white dark:to-slate-200 p-4 rounded-3xl shadow-xl transform transition-transform hover:scale-105 duration-300 ease-spring">
              <Zap className="w-8 h-8 text-emerald-400 dark:text-emerald-600" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-center mb-1 text-slate-900 dark:text-white tracking-tight">Solar Enerlytics</h2>
          <p className="text-center text-slate-500 font-medium text-sm mb-8">Secure Grid Management Portal</p>
          
          {error && <div className="mb-6 p-4 bg-red-50/80 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl border border-red-200/50 dark:border-red-800/50 backdrop-blur-md">{error}</div>}

          <form onSubmit={handleAuth} className="space-y-5">
            {isSignUp && (
              <div className="space-y-5 animate-fade-slide-up">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Client Name</label>
                  <input type="text" required value={name} onChange={handleNameChange} placeholder="e.g. RVCE Campus" className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Mobile</label>
                    <input type="tel" required value={mobile} onChange={e => setMobile(e.target.value)} placeholder="e.g. 9876543210" className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Location</label>
                    <input type="text" required value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bangalore" className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} minLength={6} className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
            </div>

            {isSignUp && (
              <div className="pt-4 border-t border-slate-200/50 dark:border-[#2A2A35]/50 animate-fade-slide-up">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Data Source</label>
                  <select value={dataType} onChange={e => setDataType(e.target.value)} className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium cursor-pointer transition-all">
                    <option value="sim">Simulated Environment</option>
                    <option value="real">Real Edge Hardware (ESP32)</option>
                  </select>
                </div>
                {dataType === 'real' && (
                  <div className="mt-5 animate-fade-slide-up">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider pl-1">Hardware ID</label>
                    <input type="text" required value={espId} onChange={e => setEspId(e.target.value)} placeholder="e.g. rvce_hardware" className="w-full px-5 py-3.5 rounded-2xl bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md border border-white/60 dark:border-[#3A3A45]/50 shadow-inner text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium transition-all" />
                    <p className="text-[10px] text-slate-500 mt-2 pl-1 font-medium">Must match the ESP32 Database Path ID.</p>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className={`${modernButton} w-full bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 dark:from-white dark:to-slate-200 dark:hover:from-slate-200 dark:hover:to-slate-300 text-white dark:text-slate-900 py-4 mt-6 disabled:opacity-70 text-[15px]`}>
              {loading ? 'Processing...' : (isSignUp ? 'Register Client' : 'Secure Login')}
            </button>
          </form>

          <div className="mt-8 text-center">
             <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-sm font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-500 transition-colors outline-none focus:underline">
               {isSignUp ? 'Already have an account? Log in' : 'New Client? Create an Account'}
             </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-0 w-full text-center px-4 pointer-events-none animate-fade-slide-up" style={{animationDelay: '0.2s'}}>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          &copy; {new Date().getFullYear()} Solar Enerlytics. All rights reserved.
        </p>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1">
          Designed & Developed by <span className="font-bold text-emerald-600 dark:text-emerald-500">Arya and Team, RVCE</span>
        </p>
      </div>
    </div>
  );
};

const MainLayout = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { user } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { addToast } = useContext(ToastContext);
  const { liveData, activeClient, setActiveClientId, clients } = useContext(DataContext);

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Overview', icon: LayoutGrid, roles: ['admin', 'user'] },
    { id: 'weather', label: 'Forecasting', icon: CloudLightning, roles: ['admin', 'user'] },
    { id: 'relays', label: 'Hardware', icon: Cpu, roles: ['admin', 'user'] },
    { id: 'billing', label: 'Statements', icon: DollarSign, roles: ['admin', 'user'] },
    { id: 'history', label: 'Data Logs', icon: List, roles: ['admin', 'user'] },
    { id: 'users', label: 'Directory', icon: Users, roles: ['admin'] },
    { id: 'profile', label: 'My Profile', icon: UserCog, roles: ['admin', 'user'] },
  ];

  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const handleLogout = async () => {
    if (auth) try { await signOut(auth); } catch (e) {}
    addToast('Logged out securely', 'info');
  };

  const renderPage = () => {
    switch(currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'weather': return <WeatherPage />;
      case 'relays': return <RelayPage />;
      case 'billing': return <BillingPage />;
      case 'history': return <HistoryPage />;
      case 'users': return <UsersPage />;
      case 'profile': return <ProfilePage />;
      default: return <DashboardPage />;
    }
  };

  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const navRefs = useRef([]);

  useEffect(() => {
    const activeIndex = filteredNav.findIndex(item => item.id === currentPage);
    if (activeIndex !== -1 && navRefs.current[activeIndex]) {
      const el = navRefs.current[activeIndex];
      setIndicatorStyle({
        left: el.offsetLeft,
        width: el.offsetWidth,
        opacity: 1
      });
    }
  }, [currentPage, filteredNav.length]);

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-white/70 dark:bg-[#0a0a0f]/70 backdrop-blur-2xl border-b border-white/50 dark:border-white/5 shadow-sm transition-colors duration-500">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-0 sm:h-20 gap-3 sm:gap-0">
            
            <div className="flex justify-between items-center w-full sm:w-auto pr-0 sm:pr-8 sm:border-r border-slate-200/50 dark:border-[#2A2A35]/50 h-full shrink-0">
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center gap-3 transition-opacity hover:opacity-80 group outline-none">
                <div className="bg-gradient-to-tr from-slate-900 to-slate-800 dark:from-white dark:to-slate-200 p-2 rounded-xl shadow-md group-hover:scale-105 transition-transform duration-300 ease-spring">
                  <Zap className="w-5 h-5 text-emerald-400 dark:text-emerald-600" />
                </div>
                <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white hidden md:block">Solar Enerlytics</span>
              </button>

              <div className="flex sm:hidden items-center gap-2">
                 <button onClick={toggleTheme} className="p-2.5 text-slate-500 bg-white/50 dark:bg-[#1A1A24]/50 border border-white/60 dark:border-white/10 rounded-full backdrop-blur-md shadow-sm active:scale-95 transition-all outline-none">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button onClick={handleLogout} className="p-2.5 text-red-500 bg-white/50 dark:bg-[#1A1A24]/50 border border-white/60 dark:border-white/10 rounded-full backdrop-blur-md shadow-sm active:scale-95 transition-all outline-none">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <nav className="flex-1 flex items-center overflow-x-auto no-scrollbar sm:pl-6 h-full items-end pb-2 sm:pb-0 sm:items-center relative">
              <div className="relative flex items-center p-1.5 bg-slate-200/40 dark:bg-[#1A1A24]/60 backdrop-blur-xl rounded-[1.25rem] border border-white/60 dark:border-white/5 shadow-inner">
                {/* Animated Background Pill */}
                <div 
                  className="absolute top-1.5 bottom-1.5 bg-white dark:bg-[#2A2A35] rounded-xl shadow-sm transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.1)]"
                  style={{ left: indicatorStyle.left, width: indicatorStyle.width, opacity: indicatorStyle.opacity }}
                />
                
                <div className="flex gap-1 relative z-10">
                  {filteredNav.map((item, i) => {
                    const isActive = currentPage === item.id;
                    return (
                      <button 
                        key={item.id} 
                        ref={el => navRefs.current[i] = el}
                        onClick={() => setCurrentPage(item.id)} 
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-colors whitespace-nowrap outline-none ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                      >
                        <item.icon className={`w-4 h-4 transition-transform duration-300 ease-spring ${isActive ? 'text-emerald-500 scale-110' : 'opacity-70'}`} /> 
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </nav>

            <div className="hidden sm:flex items-center gap-4 pl-6 shrink-0 h-full">
              {user.role === 'admin' && clients.length > 0 && (
                <div className="flex items-center gap-2 bg-white/50 dark:bg-[#1A1A24]/60 border border-white/60 dark:border-white/10 px-3 py-2 rounded-2xl shadow-sm backdrop-blur-md">
                  <Users className="w-4 h-4 text-emerald-500" />
                  <select value={activeClient?.uid || ''} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent text-sm font-bold outline-none cursor-pointer text-slate-700 dark:text-slate-200 appearance-none pr-4">
                    {clients.map(c => <option key={c.uid} value={c.uid} className="dark:bg-[#1A1A24]">{c.name}</option>)}
                  </select>
                </div>
              )}

              {activeClient && <LiveStatusBadge timestamp={liveData.timestamp} />}
              
              <div className="flex items-center gap-2 border-l border-slate-200/50 dark:border-[#2A2A35]/50 pl-4 h-8">
                <button onClick={toggleTheme} className="p-2.5 text-slate-500 bg-slate-100/50 dark:bg-[#1A1A24]/50 border border-white/60 dark:border-white/5 rounded-full hover:shadow-md active:scale-95 transition-all outline-none group">
                  {theme === 'dark' ? <Sun className="w-4 h-4 group-hover:rotate-45 transition-transform duration-500" /> : <Moon className="w-4 h-4 group-hover:-rotate-12 transition-transform duration-500" />}
                </button>
                <button onClick={() => setCurrentPage('profile')} className="px-3.5 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100/50 dark:bg-[#1A1A24]/50 border border-white/60 dark:border-white/5 rounded-full hover:shadow-md hover:text-emerald-600 dark:hover:text-emerald-400 active:scale-95 transition-all outline-none">
                  {user.name.split(' ')[0]}
                </button>
                <button onClick={handleLogout} className="p-2.5 text-red-500 bg-red-50/50 dark:bg-red-500/10 border border-red-100/50 dark:border-red-500/20 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 hover:shadow-md active:scale-95 transition-all outline-none" title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-28 md:pt-32 pb-28 md:pb-24">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-fade-slide-up">
           <div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white capitalize tracking-tight">
                {filteredNav.find(n => n.id === currentPage)?.label || 'Overview'}
              </h1>
              <p className="text-sm text-slate-500 mt-1.5 font-semibold">
                {currentPage === 'profile' 
                  ? 'Manage your personal account settings and preferences.' 
                  : user.role === 'admin' ? `Viewing live data profile for: ${activeClient?.name || 'Loading...'}` : 'Your personal secure system overview.'}
              </p>
           </div>
        </div>
        <div key={currentPage} className="animate-fade-slide-up" style={{animationFillMode: 'both'}}>
          {renderPage()}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 z-40 w-full border-t border-slate-200/50 dark:border-white/5 bg-white/70 dark:bg-[#0a0a0f]/70 backdrop-blur-2xl transition-colors duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col items-center sm:items-start">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm mb-1 tracking-tight">
              <Zap className="w-4 h-4 text-emerald-500" />
              Solar Enerlytics
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              &copy; {new Date().getFullYear()} All rights reserved. Secure Grid Management.
            </p>
          </div>
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-[#1A1A24]/60 px-5 py-2.5 rounded-full border border-white/60 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:shadow-md">
            Designed & Developed by <span className="text-emerald-600 dark:text-emerald-400">Arya and Team, RVCE</span>
          </div>
        </div>
      </footer>
    </>
  );
};

// ==========================================
// 5. PAGES
// ==========================================

const ProfilePage = () => {
  const { user, setUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: user.name || '',
    mobile: user.mobile || '',
    location: user.location || ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (db && user.uid) {
        await updateDoc(doc(db, 'users', user.uid), formData);
        setUser({ ...user, ...formData });
        addToast("Profile updated successfully.", "success");
        setIsEditing(false);
      }
    } catch (err) {
      addToast("Failed to update profile.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ name: user.name || '', mobile: user.mobile || '', location: user.location || '' });
    setIsEditing(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className={`${modernCard}`}>
        <div className="p-8 border-b border-slate-200/50 dark:border-white/5 flex justify-between items-center bg-white/40 dark:bg-[#1A1A24]/40">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-sm">
              <UserCog className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Account Details</h2>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Personal information and system configuration.</p>
            </div>
          </div>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className={`${modernButton} bg-white dark:bg-[#2A2A35] text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-white/5 hover:shadow-lg text-sm py-2 px-5`}>
              <Edit2 className="w-4 h-4" /> Edit Profile
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={handleCancel} disabled={loading} className={`${modernButton} bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 text-sm py-2 px-5 disabled:opacity-50`}>
                <X className="w-4 h-4" /> Cancel
              </button>
              <button onClick={handleSave} disabled={loading} className={`${modernButton} bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 text-sm py-2 px-5 disabled:opacity-50`}>
                <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
        
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-8 border-b border-slate-200/50 dark:border-white/5">
            <div className="bg-slate-50/50 dark:bg-[#1A1A24]/30 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Email Address</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-200">{user.email}</div>
            </div>
            <div className="bg-slate-50/50 dark:bg-[#1A1A24]/30 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Account Role</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-200 uppercase">{user.role}</div>
            </div>
            {user.role !== 'admin' && (
              <div className="bg-slate-50/50 dark:bg-[#1A1A24]/30 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Target ESP ID</div>
                <div className="text-sm font-mono font-bold text-slate-600 dark:text-slate-400">{user.espId || 'Simulated'}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[11px] uppercase font-extrabold tracking-widest text-slate-500 flex items-center gap-2 ml-1"><Users className="w-3.5 h-3.5"/> Full Name</label>
              {isEditing ? (
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-[#12121A]/50 border border-slate-200 dark:border-white/10 shadow-inner text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              ) : (
                <div className="text-lg font-bold text-slate-900 dark:text-white py-1.5 ml-1">{user.name}</div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase font-extrabold tracking-widest text-slate-500 flex items-center gap-2 ml-1"><Phone className="w-3.5 h-3.5"/> Mobile Number</label>
              {isEditing ? (
                <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange} placeholder="e.g. +91 9876543210" className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-[#12121A]/50 border border-slate-200 dark:border-white/10 shadow-inner text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              ) : (
                <div className="text-lg font-bold text-slate-900 dark:text-white py-1.5 ml-1">{user.mobile || 'Not Provided'}</div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[11px] uppercase font-extrabold tracking-widest text-slate-500 flex items-center gap-2 ml-1"><MapPin className="w-3.5 h-3.5"/> Installation Location</label>
              {isEditing ? (
                <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. RVCE Campus, Mysore Road" className="w-full px-4 py-3 rounded-xl bg-white/50 dark:bg-[#12121A]/50 border border-slate-200 dark:border-white/10 shadow-inner text-slate-900 dark:text-white text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all" />
              ) : (
                <div className="text-lg font-bold text-slate-900 dark:text-white py-1.5 ml-1">{user.location || 'Not Provided'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DashboardPage = () => {
  const { liveData, history, activeClient } = useContext(DataContext);
  const { theme } = useContext(ThemeContext);
  const isRealHardware = activeClient?.dataType === 'real';

  const getOneHourChartData = () => {
    const oneHourAgo = Date.now() - 3600000; 
    let recentHistory = history.filter(h => h.id >= oneHourAgo);
    
    // For 3-second data, 1 hour is 1200 points. Sample down slightly if needed so the browser chart doesn't lag.
    // 60 points gives very smooth charts
    const sampleRate = Math.ceil(recentHistory.length / 60) || 1;
    return recentHistory.filter((_, i) => i % sampleRate === 0).reverse().map(h => ({
      time: h.shortTime,
      solar: parseFloat(h.solarP),
      load: parseFloat(h.loadP)
    }));
  };

  const chartData = getOneHourChartData();

  return (
    <div className="space-y-6">
      {isRealHardware && (
        <div className="bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-4 backdrop-blur-md shadow-sm">
          <Server className="text-emerald-600 dark:text-emerald-400 w-6 h-6 animate-pulse shrink-0" />
          <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Direct TCP Connection to <span className="underline decoration-emerald-500/50 underline-offset-4">{activeClient.name}</span> Hardware Active. Secure live telemetry stream engaged.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard title="PV Array Output" value={`${liveData.solar.power.toFixed(1)} W`} sub={`${liveData.solar.voltage.toFixed(1)}V / ${liveData.solar.current.toFixed(1)}A`} icon={<Sun />} color="emerald" />
        <KpiCard title="Battery Storage" value={`${liveData.battery.percentage}%`} sub={`${liveData.battery.voltage.toFixed(1)}V • ${liveData.battery.temp}°C`} icon={<Battery />} color={liveData.battery.percentage > 20 ? "blue" : "red"} />
        <KpiCard title="Site Load" value={`${liveData.load.power.toFixed(1)} W`} sub="Live Consumption" icon={<Activity />} color="slate" />
        <KpiCard title="Grid Exchange" value={`${Math.abs(liveData.grid.importExport).toFixed(1)} W`} sub={liveData.grid.importExport < 0 ? "Exporting" : "Importing"} icon={<ArrowRightLeft />} color={liveData.grid.importExport < 0 ? "emerald" : "orange"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 ${modernCard} p-6`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-extrabold text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Power Distribution Graph</h3>
            <span className="text-[10px] font-extrabold tracking-widest px-3 py-1.5 bg-slate-100/80 dark:bg-[#1A1A24]/80 text-slate-600 dark:text-slate-300 rounded-full border border-slate-200/50 dark:border-white/5 shadow-inner">1H TIMELINE</span>
          </div>
          <div className="h-72 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                  <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={10} tickLine={false} axisLine={false} tickMargin={10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: theme === 'dark' ? 'rgba(26, 26, 36, 0.9)' : 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(16px)', borderRadius: '16px', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 'bold', color: theme === 'dark' ? '#fff' : '#0f172a', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }} 
                    itemStyle={{fontWeight: 'bold'}}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '15px' }} />
                  <Area type="monotone" dataKey="solar" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSolar)" name="Solar Gen (W)" activeDot={{r: 6, strokeWidth: 0}} />
                  <Area type="monotone" dataKey="load" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorLoad)" name="Consumption (W)" activeDot={{r: 6, strokeWidth: 0}} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="flex items-center justify-center h-full text-slate-400 font-bold text-sm bg-slate-50/50 dark:bg-[#1A1A24]/30 rounded-3xl border border-dashed border-slate-200 dark:border-white/5">Waiting for secure hardware telemetry stream...</div>
            )}
          </div>
        </div>

        <div className={`${modernCard} p-6 flex flex-col`}>
           <h3 className="font-extrabold text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
             <BrainCircuit className="w-4 h-4 text-indigo-500" /> ML Active Strategy
           </h3>
           
           <div className="flex-1 flex flex-col items-center justify-center py-6">
             {liveData.weather.current && liveData.mlDecision ? (
               <div className="flex flex-col items-center text-center group">
                 <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 group-hover:text-indigo-400 transition-colors">Hysteresis AI Active</div>
                 <div className="text-4xl font-black text-slate-900 dark:text-white mb-3 tracking-tight group-hover:scale-105 transition-transform duration-500 ease-spring">
                   {liveData.mlDecision.strategy}
                 </div>
                 <span className={`text-xs font-extrabold tracking-wide ${liveData.mlDecision.color} bg-slate-100/80 dark:bg-[#1A1A24]/80 px-4 py-2 rounded-full border border-slate-200/50 dark:border-white/5 shadow-sm`}>
                   {liveData.mlDecision.batteryPolicy}
                 </span>
               </div>
             ) : (
               <div className="flex flex-col items-center gap-4">
                 <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculating Engine</span>
               </div>
             )}
           </div>
           
           <div className="grid grid-cols-2 gap-4 mt-6">
             <div className="bg-slate-50/80 dark:bg-[#1A1A24]/60 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-inner">
               <div className="text-[9px] text-slate-500 uppercase font-extrabold tracking-widest mb-1.5">Battery Rule</div>
               <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                 {liveData.mlDecision?.relays.r1 ? 'Charge Active' : 'Charge Bypass'}
               </div>
             </div>
             <div className="bg-slate-50/80 dark:bg-[#1A1A24]/60 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-inner">
               <div className="text-[9px] text-slate-500 uppercase font-extrabold tracking-widest mb-1.5">Grid Policy</div>
               <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                 {liveData.mlDecision?.relays.r3 ? 'Importing' : 'Isolated'}
               </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const WeatherPage = () => {
  const { liveData } = useContext(DataContext);

  if (liveData.weather.loading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-sm font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400 animate-pulse">Initializing Global Meteo Engine...</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className={`${modernCard} p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/40 dark:bg-[#12121A]/40`}>
         <div>
            <h2 className="text-xl font-extrabold mb-2 flex items-center gap-3 text-slate-900 dark:text-white tracking-tight">
              <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-xl text-indigo-600 dark:text-indigo-400">
                <BrainCircuit className="w-5 h-5" />
              </div>
              Predictive Weather Modeling
            </h2>
            <p className="text-slate-500 text-sm max-w-3xl font-medium leading-relaxed">
              Live 7-Day forecast integrated directly into the Hysteresis Engine. The AI model adjusts standard efficiency drops by mapping cloud cover density and exact temperature variance automatically to optimize the relays.
            </p>
         </div>
         {liveData.relays.mode === 'auto' ? (
           <div className="flex items-center gap-2 px-5 py-3 bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/20 text-sm font-bold shrink-0 hover:scale-105 transition-transform duration-300 ease-spring">
             <CheckCircle2 className="w-4 h-4" /> AI Auto-Pilot Active
           </div>
         ) : (
           <div className="flex items-center gap-2 px-5 py-3 bg-slate-200 dark:bg-[#2A2A35] text-slate-600 dark:text-slate-300 rounded-full border border-slate-300 dark:border-white/5 text-sm font-bold shrink-0 shadow-inner">
             <AlertCircle className="w-4 h-4" /> Auto-Pilot Disabled
           </div>
         )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {liveData.weather.forecast.map((day, idx) => (
          <div key={idx} className={`${modernCard} p-5 flex flex-col items-center text-center ${idx === 0 ? 'ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-lg shadow-indigo-500/10' : ''}`}>
            {idx === 0 && <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3 bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 rounded-full">Today</span>}
            <div className="text-xs font-extrabold text-slate-500 dark:text-slate-400 mb-4 tracking-wide">{day.date}</div>
            
            <div className="bg-slate-50 dark:bg-[#1A1A24] p-3 rounded-2xl mb-4 shadow-inner group-hover:scale-110 transition-transform duration-300 ease-spring">
              <day.icon className={`w-8 h-8 ${day.color}`} strokeWidth={2.5} />
            </div>
            
            <div className="flex gap-2 text-sm font-black mb-2">
               <span className="text-slate-900 dark:text-slate-100">{day.maxTemp}°</span>
               <span className="text-slate-400">{day.minTemp}°</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-5">
              <span className="flex items-center gap-1"><Cloud className="w-3.5 h-3.5"/> {day.cloudCover}%</span>
              <span className="flex items-center gap-1"><Droplets className="w-3.5 h-3.5 text-blue-500"/> {day.rainProb}%</span>
            </div>

            <div className="w-full pt-4 border-t border-slate-200/50 dark:border-white/5">
              <div className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400 mb-1.5">Predicted Eff.</div>
              <div className={`text-xl font-black tracking-tight ${day.efficiencyPct > 70 ? 'text-emerald-500' : day.efficiencyPct > 40 ? 'text-orange-500' : 'text-rose-500'}`}>{day.efficiencyPct}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RelayPage = () => {
  const { liveData, api } = useContext(DataContext);
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const toggleMode = () => {
    if(user.role !== 'admin') return addToast("Permission Denied: Read-Only for Clients", "error");
    const newMode = liveData.relays.mode === 'auto' ? 'manual' : 'auto';
    api.updateRelayMode(newMode);
    addToast(`System control shifted to ${newMode.toUpperCase()}`, 'info');
  };

  const handleRelayToggle = (relay) => {
    if(user.role !== 'admin') return addToast("Permission Denied: Read-Only for Clients", "error");
    if (liveData.relays.mode === 'auto') return addToast('System is in AUTO mode. Manual overrides disabled.', 'error');
    
    const newRelays = { ...liveData.relays, [relay]: !liveData.relays[relay] };

    // Strict Hardware Interlocks
    if (relay === 'r2' && newRelays.r2) {
        newRelays.r3 = false; 
        addToast('Interlock Engaged: Grid Load cut off to permit Battery Load.', 'info');
    } else if (relay === 'r3' && newRelays.r3) {
        newRelays.r2 = false; 
        addToast('Interlock Engaged: Battery Load cut off to permit Grid Load.', 'info');
    }

    api.updateMultipleRelays({ r1: newRelays.r1, r2: newRelays.r2, r3: newRelays.r3 });
  };

  return (
    <div className="space-y-6">
      <div className={`${modernCard} p-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 dark:bg-[#12121A]/40`}>
        <div className="flex items-center gap-4">
           <div className="bg-slate-100 dark:bg-[#1A1A24] p-3 rounded-2xl shadow-inner">
             <Cpu className="w-6 h-6 text-slate-700 dark:text-slate-300" />
           </div>
           <div>
             <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">Solid State Modules</h2>
             <p className="text-xs font-semibold text-slate-500 mt-0.5">Secure direct TCP interface to edge relays.</p>
           </div>
        </div>
        
        <div className="flex items-center gap-5">
          {user.role === 'admin' ? (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3.5 py-2 rounded-full border border-emerald-200/50 dark:border-emerald-800/50 shadow-sm">
              <Shield className="w-3.5 h-3.5" /> Full Access
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase font-extrabold tracking-widest text-slate-500 bg-slate-100 dark:bg-[#1A1A24] px-3.5 py-2 rounded-full border border-slate-200 dark:border-[#2A2A35] shadow-sm">
              <Info className="w-3.5 h-3.5" /> Read-Only
            </div>
          )}

          <div className="flex bg-slate-200/50 dark:bg-[#1A1A24]/60 p-1 rounded-full border border-slate-300/50 dark:border-white/5 backdrop-blur-md shadow-inner">
            <button onClick={toggleMode} className={`px-5 py-2 rounded-full text-xs font-extrabold tracking-wide transition-all duration-300 outline-none ${liveData.relays.mode === 'auto' ? 'bg-white dark:bg-[#2A2A35] text-indigo-600 dark:text-indigo-400 shadow-md transform scale-105' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              AUTO (AI)
            </button>
            <button onClick={toggleMode} className={`px-5 py-2 rounded-full text-xs font-extrabold tracking-wide transition-all duration-300 outline-none ${liveData.relays.mode === 'manual' ? 'bg-red-500 text-white shadow-md shadow-red-500/30 transform scale-105' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              MANUAL
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <RelayControlCard 
          id="r1" 
          title="Relay 1 (PV Route)" 
          desc="Controls Solar PV destination. OFF (NC): Solar directed to Grid. ON (NO): Solar directed to Battery." 
          state={liveData.relays.r1} 
          isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} 
          onToggle={() => handleRelayToggle('r1')} 
          warning
        />
        <RelayControlCard 
          id="r2" 
          title="Relay 2 (Battery Load)" 
          desc="Controls inverter output. OFF (NC): House disconnected from battery. ON (NO): House powered by Battery." 
          state={liveData.relays.r2} 
          isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} 
          onToggle={() => handleRelayToggle('r2')} 
        />
        <RelayControlCard 
          id="r3" 
          title="Relay 3 (Grid Load)" 
          desc="Controls Grid Power flow. OFF (NC): House disconnected from Grid. ON (NO): House powered directly by Grid." 
          state={liveData.relays.r3} 
          isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} 
          onToggle={() => handleRelayToggle('r3')} 
        />
      </div>
    </div>
  );
};

const HistoryPage = () => {
  const { history } = useContext(DataContext);
  const { addToast } = useContext(ToastContext);
  const [filter, setFilter] = useState('1h');

  // Aggregation Logic - updated for 3-second data density
  const getGroupedHistory = (hist, filterType) => {
    let cutoff = Date.now();
    let bucketSizeMs = 3000; // Default to 3 second raw data for demo

    if (filterType === '1h') { cutoff -= 3600000; bucketSizeMs = 3000; } // Raw 3-Sec Data
    else if (filterType === '6h') { cutoff -= 6 * 3600000; bucketSizeMs = 60000; } // 1 Min avg
    else if (filterType === '12h') { cutoff -= 12 * 3600000; bucketSizeMs = 300000; } // 5 Min avg
    else if (filterType === '1d') { cutoff -= 24 * 3600000; bucketSizeMs = 600000; } // 10 Min avg
    else if (filterType === '7d') { cutoff -= 7 * 24 * 3600000; bucketSizeMs = 1800000; } // 30 Min avg
    else if (filterType === '1mo') { cutoff -= 30 * 24 * 3600000; bucketSizeMs = 7200000; } // 2 Hr avg

    const filtered = hist.filter(h => h.id >= cutoff);
    const buckets = {};
    
    filtered.forEach(h => {
       const bucketTime = Math.floor(h.id / bucketSizeMs) * bucketSizeMs;
       if (!buckets[bucketTime]) {
          buckets[bucketTime] = { count: 0, solarV: 0, solarI: 0, solarP: 0, batteryPct: 0, loadP: 0, exportCount: 0 };
       }
       buckets[bucketTime].count++;
       buckets[bucketTime].solarV += parseFloat(h.solarV);
       buckets[bucketTime].solarI += parseFloat(h.solarI);
       buckets[bucketTime].solarP += parseFloat(h.solarP);
       buckets[bucketTime].batteryPct += h.batteryPct;
       buckets[bucketTime].loadP += parseFloat(h.loadP);
       if (h.gridStatus === 'Exporting') buckets[bucketTime].exportCount++;
    });

    return Object.keys(buckets).map(timeMs => {
       const b = buckets[timeMs];
       const c = b.count;
       const d = new Date(parseInt(timeMs));
       return {
          id: parseInt(timeMs),
          timestamp: d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          solarV: (b.solarV / c).toFixed(1),
          solarI: (b.solarI / c).toFixed(1),
          solarP: (b.solarP / c).toFixed(1),
          batteryPct: Math.round(b.batteryPct / c),
          loadP: (b.loadP / c).toFixed(1),
          gridStatus: (b.exportCount / c) > 0.5 ? 'Exporting' : 'Importing'
       };
    }).sort((a,b) => b.id - a.id);
  };

  const displayHistory = getGroupedHistory(history, filter);

  const handleExportCSV = () => {
    if (displayHistory.length === 0) return addToast('No data to export.', 'error');
    
    const headers = ["Timestamp", "PV Input (V)", "PV Input (A)", "PV Input (W)", "Battery SoC (%)", "Load (W)", "Grid Status"];
    const rows = displayHistory.map(r => [
      `"${r.timestamp}"`, r.solarV, r.solarI, r.solarP, r.batteryPct, r.loadP, r.gridStatus
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Telemetry_Export_${filter}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addToast('CSV download complete.', 'success');
  };

  return (
    <div className={`${modernCard} overflow-hidden flex flex-col h-[calc(100vh-14rem)] bg-white/40 dark:bg-[#12121A]/40`}>
      <div className="p-5 border-b border-slate-200/50 dark:border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-[#1A1A24]/50 backdrop-blur-md z-10">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">Node Telemetry Logs</h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Historical snapshot timeline synced with device telemetry.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-100/80 dark:bg-[#1A1A24]/80 border border-slate-200/50 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold px-4 py-2.5 rounded-full outline-none cursor-pointer shadow-inner backdrop-blur-md appearance-none"
          >
            <option value="1h">Last 1 Hour (Raw 3-Sec Data)</option>
            <option value="6h">Last 6 Hours (1-Min avg)</option>
            <option value="12h">Last 12 Hours (5-Min avg)</option>
            <option value="1d">Last 24 Hours (10-Min avg)</option>
            <option value="7d">Last 7 Days (30-Min avg)</option>
            <option value="1mo">Last 30 Days (2-Hour avg)</option>
          </select>

          <button onClick={handleExportCSV} className={`${modernButton} bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 shadow-md text-xs py-2.5 px-5`}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        <table className="w-full text-left text-sm whitespace-nowrap border-spacing-y-2 border-separate px-4">
          <thead className="text-slate-500 font-extrabold text-[10px] uppercase tracking-widest sticky top-0 z-10 bg-[#F4F6F8]/90 dark:bg-[#09090E]/90 backdrop-blur-xl">
            <tr>
              <th className="px-5 py-4 rounded-l-2xl">Received Timestamp</th>
              <th className="px-5 py-4">PV Input (V/A/W)</th>
              <th className="px-5 py-4">Battery SoC</th>
              <th className="px-5 py-4">Load</th>
              <th className="px-5 py-4 rounded-r-2xl">Grid Status</th>
            </tr>
          </thead>
          <tbody>
            {displayHistory.map((row) => (
              <tr key={row.id} className="bg-white/50 dark:bg-[#1A1A24]/40 hover:bg-white/80 dark:hover:bg-[#1A1A24]/80 transition-colors backdrop-blur-md group">
                <td className="px-5 py-4 font-mono text-xs font-bold text-slate-600 dark:text-slate-400 rounded-l-xl border-y border-l border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">{row.timestamp}</td>
                <td className="px-5 py-4 font-bold text-slate-900 dark:text-slate-200 border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">{row.solarV}V / {row.solarI}A / {row.solarP}W</td>
                <td className="px-5 py-4 border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-2 bg-slate-200/50 dark:bg-[#2A2A35]/50 rounded-full overflow-hidden shadow-inner">
                      <div className={`h-full rounded-full transition-all duration-500 ${row.batteryPct > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${row.batteryPct}%` }}></div>
                    </div>
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">{row.batteryPct}%</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-900 dark:text-slate-200 font-bold border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">{row.loadP} W</td>
                <td className="px-5 py-4 rounded-r-xl border-y border-r border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border shadow-sm ${row.gridStatus === 'Exporting' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20' : 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200/50 dark:border-orange-500/20'}`}>
                    {row.gridStatus}
                  </span>
                </td>
              </tr>
            ))}
            {displayHistory.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-12 text-slate-400 font-semibold text-sm bg-white/30 dark:bg-[#1A1A24]/20 rounded-xl border border-dashed border-slate-200/50 dark:border-white/5">No historical data found for the selected time range.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const BillingPage = () => {
  const { liveData } = useContext(DataContext);
  const netTotal = (liveData.billing.imported * TARIFF.BUY) - (liveData.billing.exported * TARIFF.SELL);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className={`${modernCard} p-6 flex flex-col justify-center text-center items-center`}>
          <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full mb-4 shadow-sm group-hover:scale-110 transition-transform duration-300 ease-spring">
            <ArrowRightLeft className="w-5 h-5 text-orange-500"/>
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-extrabold uppercase tracking-widest mb-1">Total Grid Import</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{liveData.billing.imported.toFixed(4)} <span className="text-sm font-semibold text-slate-400">kWh</span></div>
          <div className="text-xs font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-800/50">Cost Accrued: ₹{(liveData.billing.imported * TARIFF.BUY).toFixed(2)}</div>
        </div>
        <div className={`${modernCard} p-6 flex flex-col justify-center text-center items-center`}>
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-full mb-4 shadow-sm group-hover:scale-110 transition-transform duration-300 ease-spring">
            <Sun className="w-5 h-5 text-emerald-500"/>
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-extrabold uppercase tracking-widest mb-1">Total Solar Export</div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{liveData.billing.exported.toFixed(4)} <span className="text-sm font-semibold text-slate-400">kWh</span></div>
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-100 dark:border-emerald-800/50">Revenue Generated: ₹{(liveData.billing.exported * TARIFF.SELL).toFixed(2)}</div>
        </div>
        <div className={`${modernCard} p-6 flex flex-col justify-center text-center items-center ${netTotal > 0 ? 'ring-2 ring-orange-500/50 bg-orange-50/30 dark:bg-orange-900/10' : 'ring-2 ring-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-900/10'}`}>
          <div className="text-slate-500 dark:text-slate-400 text-[11px] font-extrabold uppercase tracking-widest mb-2">Net Payable Balance</div>
          <div className={`text-5xl font-black tracking-tighter mb-3 group-hover:scale-105 transition-transform duration-300 ease-spring ${netTotal > 0 ? 'text-orange-600 dark:text-orange-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
            ₹{Math.abs(netTotal).toFixed(2)}
          </div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-400">{netTotal > 0 ? 'Outstanding due to Utility' : 'Surplus Credit in Account'}</div>
        </div>
      </div>
      
      <div className={`${modernCard} overflow-hidden`}>
         <div className="p-6 border-b border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-[#1A1A24]/40 flex justify-between items-center">
           <div>
             <h3 className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">Detailed Statement</h3>
             <p className="text-xs font-semibold text-slate-500 mt-1">Current Billing Cycle. Start date: {new Date(liveData.billing.lastReset).toLocaleDateString()}</p>
           </div>
           <div className="flex gap-4 text-xs font-bold bg-slate-100/50 dark:bg-[#12121A]/50 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
             <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Buy: ₹{TARIFF.BUY}/kWh</div>
             <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Sell: ₹{TARIFF.SELL}/kWh</div>
           </div>
         </div>
         <div className="p-6">
           <table className="w-full text-left">
             <thead>
               <tr className="border-b border-slate-200/50 dark:border-white/10 text-slate-500 text-[11px] uppercase tracking-widest font-extrabold">
                 <th className="pb-4 w-1/2">Description</th>
                 <th className="pb-4 text-right">Units (kWh)</th>
                 <th className="pb-4 text-right">Rate</th>
                 <th className="pb-4 text-right">Total Amount</th>
               </tr>
             </thead>
             <tbody className="text-sm">
               <tr className="border-b border-slate-100/50 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-[#1A1A24]/30 transition-colors">
                 <td className="py-5 font-bold text-slate-900 dark:text-slate-100 pl-2">Base Metering Fixed Charge</td>
                 <td className="py-5 text-right font-medium text-slate-400">-</td>
                 <td className="py-5 text-right font-medium text-slate-400">-</td>
                 <td className="py-5 text-right font-black text-slate-900 dark:text-slate-100 pr-2">₹150.00</td>
               </tr>
               <tr className="border-b border-slate-100/50 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-[#1A1A24]/30 transition-colors">
                 <td className="py-5 font-bold text-slate-900 dark:text-slate-100 pl-2">Power Utilized from Grid</td>
                 <td className="py-5 text-right font-bold text-slate-600 dark:text-slate-400">{liveData.billing.imported.toFixed(4)}</td>
                 <td className="py-5 text-right font-bold text-slate-600 dark:text-slate-400">₹{TARIFF.BUY}</td>
                 <td className="py-5 text-right font-black text-orange-500 pr-2">+ ₹{(liveData.billing.imported * TARIFF.BUY).toFixed(2)}</td>
               </tr>
               <tr className="border-b border-slate-200/50 dark:border-white/10 hover:bg-slate-50/50 dark:hover:bg-[#1A1A24]/30 transition-colors">
                 <td className="py-5 font-bold text-slate-900 dark:text-slate-100 pl-2">Power Sold to Grid</td>
                 <td className="py-5 text-right font-bold text-slate-600 dark:text-slate-400">{liveData.billing.exported.toFixed(4)}</td>
                 <td className="py-5 text-right font-bold text-slate-600 dark:text-slate-400">₹{TARIFF.SELL}</td>
                 <td className="py-5 text-right font-black text-emerald-500 pr-2">- ₹{(liveData.billing.exported * TARIFF.SELL).toFixed(2)}</td>
               </tr>
               <tr className="bg-slate-50/50 dark:bg-[#1A1A24]/30 rounded-b-3xl">
                 <td className="py-6 font-extrabold text-slate-900 dark:text-white text-base pl-4 rounded-bl-3xl">Net Total Amount</td>
                 <td></td>
                 <td></td>
                 <td className={`py-6 text-right font-black text-2xl pr-4 rounded-br-3xl ${netTotal + 150 > 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
                   ₹{Math.abs(netTotal + 150).toFixed(2)}
                 </td>
               </tr>
             </tbody>
           </table>
         </div>
      </div>
    </div>
  );
};

const UsersPage = () => {
  const { clients, api } = useContext(DataContext);

  return (
    <div className={`${modernCard} overflow-hidden`}>
      <div className="p-6 border-b border-slate-200/50 dark:border-white/5 flex justify-between items-center bg-white/40 dark:bg-[#1A1A24]/40">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Client Directory</h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">Registered clients securely connected to the ecosystem.</p>
        </div>
      </div>
      <div className="overflow-x-auto p-2">
        <table className="w-full text-left text-sm border-spacing-y-2 border-separate px-4">
           <thead className="text-slate-500 text-[10px] uppercase tracking-widest font-extrabold">
            <tr>
              <th className="px-5 py-4">Client Name</th>
              <th className="px-5 py-4">Contact Info</th>
              <th className="px-5 py-4">Location</th>
              <th className="px-5 py-4">Data Feed Type</th>
              <th className="px-5 py-4 text-right">Admin</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-5 py-12 text-center text-slate-400 font-semibold bg-white/30 dark:bg-[#1A1A24]/20 rounded-xl border border-dashed border-slate-200/50 dark:border-white/5">No active clients registered.</td>
              </tr>
            ) : clients.map(c => (
              <tr key={c.uid} className="bg-white/50 dark:bg-[#1A1A24]/40 hover:bg-white/80 dark:hover:bg-[#1A1A24]/80 transition-colors backdrop-blur-md group rounded-2xl">
                <td className="px-5 py-4 font-bold text-slate-900 dark:text-white rounded-l-2xl border-y border-l border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">{c.name}</td>
                <td className="px-5 py-4 border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">
                  <div className="font-semibold text-slate-600 dark:text-slate-300">{c.email}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{c.mobile || 'No Mobile'}</div>
                </td>
                <td className="px-5 py-4 font-semibold text-slate-600 dark:text-slate-400 border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">{c.location || 'N/A'}</td>
                <td className="px-5 py-4 border-y border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">
                  <span className={`px-3 py-1.5 rounded-full text-[9px] uppercase font-extrabold tracking-widest shadow-sm ${c.dataType === 'real' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50' : 'bg-slate-100 dark:bg-[#2A2A35] text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-[#3A3A45]'}`}>
                    {c.dataType === 'real' ? 'Hardware' : 'Simulated'}
                  </span>
                  {c.dataType === 'real' && <div className="text-[10px] text-slate-400 mt-2 font-mono font-bold">{c.espId}</div>}
                </td>
                <td className="px-5 py-4 text-right rounded-r-2xl border-y border-r border-transparent group-hover:border-slate-200/50 dark:group-hover:border-white/5 transition-colors">
                  <button onClick={() => { if(window.confirm('Delete this client profile from the database?')) api.deleteUser(c.uid); }} className="text-slate-400 hover:text-red-500 p-2 bg-white/50 dark:bg-[#12121A]/50 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all shadow-sm group-hover:shadow-md active:scale-95">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// 6. UI COMPONENTS
// ==========================================
const KpiCard = ({ title, value, sub, icon, color }) => {
  const colorMap = {
    emerald: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 shadow-emerald-500/10',
    blue: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20 shadow-blue-500/10',
    red: 'text-red-500 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 shadow-red-500/10',
    slate: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#2A2A35]/50 border-slate-200 dark:border-[#3A3A45] shadow-slate-500/5',
    orange: 'text-orange-500 bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20 shadow-orange-500/10',
  };
  
  return (
    <div className={`${modernCard} p-6 flex flex-col justify-between h-full`}>
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3 rounded-2xl border shadow-sm group-hover:scale-110 transition-transform duration-300 ease-spring ${colorMap[color]}`}>
          {React.cloneElement(icon, { className: "w-5 h-5", strokeWidth: 2.5 })}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{title}</div>
        <div className="text-3xl font-black text-slate-900 dark:text-white mb-1.5 tracking-tight group-hover:translate-x-1 transition-transform duration-300 ease-spring">{value}</div>
        <div className="text-xs font-semibold text-slate-400">{sub}</div>
      </div>
    </div>
  );
};

const RelayControlCard = ({ title, desc, state, isAuto, onToggle, warning }) => (
  <div className={`${modernCard} p-6 flex flex-col justify-between min-h-[220px] ${state ? 'ring-2 ring-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-900/10' : ''}`}>
    <div>
      <div className="flex justify-between items-center mb-4 border-b border-slate-200/50 dark:border-white/5 pb-4">
        <h4 className="font-extrabold text-[15px] text-slate-900 dark:text-white flex items-center gap-2 tracking-tight group-hover:translate-x-1 transition-transform duration-300">
          {title} 
          {warning && <AlertTriangle className="w-4 h-4 text-amber-500 drop-shadow-sm" title="Safety interlocks apply" />}
        </h4>
      </div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed mb-6">{desc}</p>
    </div>
    
    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-200/50 dark:border-white/5">
      <span className={`text-[10px] font-extrabold uppercase tracking-widest transition-colors ${state ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
        {state ? 'Circuit Engaged (NO)' : 'Circuit Bypassed (NC)'}
      </span>
      
      <button 
        onClick={onToggle} 
        disabled={isAuto} 
        className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none shadow-inner ${state ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-[#3A3A45]'} ${isAuto ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-md active:scale-95'}`}
      >
        <span className="sr-only">Toggle Relay</span>
        <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-500 ease-spring ${state ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
  </div>
);
