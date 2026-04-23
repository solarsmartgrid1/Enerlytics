import React, { useState, useEffect, useContext, createContext } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Sun, Moon, CloudRain, Cloud, Battery, Zap, Activity, Users, 
  Shield, Droplets, ArrowRightLeft, DollarSign,
  Cpu, AlertCircle, CheckCircle2, LogOut, Download, 
  Plus, Trash2, Info, ToggleLeft, ToggleRight, CloudLightning,
  Server, LayoutGrid, List, BrainCircuit, Clock, AlertTriangle,
  UserCog, MapPin, Phone, Edit2, Save, X
} from 'lucide-react';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, query, orderBy, limit, getDocs, deleteDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYnzbwy3L1gEMwFNoGBMrGt-Ck74g_xDo",
  authDomain: "solarenerlytics.firebaseapp.com",
  projectId: "solarenerlytics",
  storageBucket: "solarenerlytics.firebasestorage.app",
  messagingSenderId: "1092682628340",
  appId: "1:1092682628340:web:9cae9719a98153dd0172a1",
  measurementId: "G-6EMR6ZYPZH"
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
const modernCard = "bg-white dark:bg-[#12121A] border border-slate-200 dark:border-[#2A2A35] rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] transition-all duration-200 hover:shadow-md";
const modernButton = "flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all active:scale-[0.98]";

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

// ==========================================
// 3. PROVIDERS
// ==========================================
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
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-xl border text-sm font-medium flex items-center gap-3 animate-slide-up pointer-events-auto transition-all ${
            t.type === 'error' ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400' : 
            t.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400' : 
            'bg-white dark:bg-[#1A1A24] border-slate-200 dark:border-[#2A2A35] text-slate-800 dark:text-slate-200'
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
  
  // Admin sees all clients. Regular users only see themselves.
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(user); // The current user profile being viewed
  
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
    billing: { imported: 145.2, exported: 82.5, lastReset: '2026-04-01' }
  });

  // Fetch all clients if Admin
  useEffect(() => {
    if (user.role === 'admin' && db) {
      getDocs(collection(db, 'users')).then(snap => {
        const fetchedClients = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.role !== 'admin');
        setClients(fetchedClients);
        // Auto-select the first hardware client if available, else first client
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
      setHistory([]); // Clear history visually to load new client's data
    }
  };

  // Weather Logic
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

  // ML Processing Loop
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

  // PERMANENT FIREBASE SYNC (Live Data + History Fetching)
  useEffect(() => {
    let unsubLive = null;
    let unsubHist = null;
    let simInterval = null;

    if (!activeClient || !db) return;

    const deviceId = activeClient.dataType === 'real' ? activeClient.espId : `sim_${activeClient.uid}`;

    // 1. Listen to Live State from Firebase
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
        }));
      }
    });

    // 2. Fetch PERMANENT History from Firebase (Increased limit to hold days of data)
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

    // 3. Simulator Engine (Writes purely to Firebase so even sim data is permanent)
    if (activeClient.dataType === 'sim') {
      let tickCount = 0;
      simInterval = setInterval(() => {
        tickCount++;
        const simTime = Date.now();
        setLiveData(prev => {
          let newBat = prev.battery.percentage;
          if (prev.relays.r1) newBat += 0.8; 
          if (prev.relays.r2) newBat -= 0.5; 
          newBat = Math.max(0, Math.min(100, newBat)); 
          const newSolarP = Math.max(0, prev.solar.power + (Math.random() * 2 - 1));
          const newLoadP = Math.max(10, 20 + (Math.random() * 2 - 1));
          const gridExp = newLoadP - newSolarP;
          
          // Push LIVE to Firebase
          setDoc(docRef, {
            timestamp: Math.floor(simTime / 1000), // Match ESP32 format
            solar: { power: newSolarP, voltage: prev.solar.voltage, current: prev.solar.current },
            battery: { percentage: newBat, voltage: prev.battery.voltage, temp: prev.battery.temp },
            load: { power: newLoadP },
            grid: { importExport: gridExp },
            relays: prev.relays
          }, { merge: true });

          // Push HISTORY to Firebase (Every 10 ticks = 30 seconds for simulation speed)
          if (tickCount >= 10) {
            tickCount = 0;
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
          }

          return { ...prev, timestamp: simTime, solar: { ...prev.solar, power: newSolarP }, battery: { ...prev.battery, percentage: newBat }, load: { ...prev.load, power: newLoadP }, grid: { ...prev.grid, importExport: gridExp } };
        });
      }, 3000);
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
      <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/20 transition-all shrink-0" title={`Last data: ${formattedDate}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        LIVE
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-[#1A1A24] text-slate-500 dark:text-slate-400 rounded text-[10px] font-bold border border-slate-200 dark:border-[#2A2A35] transition-all shrink-0">
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

  // Ensures dark mode works properly on the root <html> tag for Tailwind
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Auth Listener fetching robust user profiles
  useEffect(() => {
    if (!auth) return setAuthLoading(false);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (db) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: firebaseUser.uid, ...userDoc.data() });
          } else {
            // Failsafe for manually created users in console before DB sync
            const role = firebaseUser.email === 'admin@solarenerlytics.com' ? 'admin' : 'user';
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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#09090E] text-slate-500 font-bold">Connecting Securely...</div>;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ToastProvider>
        <AuthContext.Provider value={{ user, setUser }}>
          <div className="min-h-screen font-sans flex flex-col relative bg-[#F8FAFC] dark:bg-[#09090E] text-slate-900 dark:text-slate-100 transition-colors duration-300">
            <style>{`
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
              .dot-pattern { background-image: radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px); background-size: 24px 24px; }
              .dark .dot-pattern { background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px); }
            `}</style>
            <div className="absolute inset-0 dot-pattern pointer-events-none z-0"></div>
            <div className="relative z-10 flex-1 flex flex-col">
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
  const [email, setEmail] = useState('admin@solarenerlytics.com');
  const [password, setPassword] = useState('Admin@1234');
  
  // New Profile Fields
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [location, setLocation] = useState('');
  
  const [dataType, setDataType] = useState('sim');
  const [espId, setEspId] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Automatically suggest an ESP ID based on the Client Name input
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
        // --- SIGN UP FLOW ---
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCred.user.uid), {
          name, email, mobile, location, role: 'user', dataType, espId: dataType === 'real' ? espId : ''
        });
      } else {
        // --- LOGIN FLOW ---
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (loginErr) {
          // Special fallback: Auto-create the master admin account if it was never created
          if (email === 'admin@solarenerlytics.com' && password === 'Admin@1234' && (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential')) {
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
    <div className="flex-1 flex items-center justify-center p-4">
      <div className={`${modernCard} max-w-md w-full p-8 sm:p-10 relative overflow-hidden`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
        <div className="relative z-10">
          <div className="flex justify-center mb-4">
            <div className="bg-slate-900 dark:bg-white p-3 rounded-lg shadow-sm">
              <Zap className="w-6 h-6 text-white dark:text-slate-900" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">Solar Enerlytics</h2>
          <p className="text-center text-slate-500 text-sm mb-6">Secure Grid Management Portal</p>
          
          {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800/50">{error}</div>}

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Client Name</label>
                  <input type="text" required value={name} onChange={handleNameChange} placeholder="e.g. RVCE Campus" className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Mobile</label>
                    <input type="tel" required value={mobile} onChange={e => setMobile(e.target.value)} placeholder="e.g. 9876543210" className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Location</label>
                    <input type="text" required value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Bangalore" className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Email Address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} minLength={6} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
            </div>

            {isSignUp && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#2A2A35]">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 mt-2 uppercase tracking-wide">Data Source</label>
                  <select value={dataType} onChange={e => setDataType(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium cursor-pointer">
                    <option value="sim">Simulated Environment</option>
                    <option value="real">Real Edge Hardware (ESP32)</option>
                  </select>
                </div>
                {dataType === 'real' && (
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Hardware ID</label>
                    <input type="text" required value={espId} onChange={e => setEspId(e.target.value)} placeholder="e.g. rvce_hardware" className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
                    <p className="text-[10px] text-slate-500 mt-1">Must match the ESP32 Database Path ID.</p>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className={`${modernButton} w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 py-3 mt-4 disabled:opacity-70`}>
              {loading ? 'Processing...' : (isSignUp ? 'Register Client' : 'Secure Login')}
            </button>
          </form>

          <div className="mt-6 text-center">
             <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-sm font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-500 transition-colors">
               {isSignUp ? 'Already have an account? Log in' : 'New Client? Create an Account'}
             </button>
          </div>
        </div>
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

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white dark:bg-[#12121A] border-b border-slate-200 dark:border-[#2A2A35] shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-0 sm:h-16 gap-2 sm:gap-0">
            
            <div className="flex justify-between items-center w-full sm:w-auto pr-0 sm:pr-8 border-r-0 sm:border-r border-slate-200 dark:border-[#2A2A35] h-full shrink-0">
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
                <div className="bg-slate-900 dark:bg-white p-1.5 rounded text-white dark:text-slate-900">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white hidden md:block">Solar Enerlytics</span>
              </button>

              <div className="flex sm:hidden items-center gap-2">
                 <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1A1A24] rounded-md transition-colors">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button onClick={handleLogout} className="p-2 text-slate-500 hover:bg-red-50 hover:text-red-500 rounded-md">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <nav className="flex-1 flex items-center overflow-x-auto no-scrollbar sm:pl-6 h-full items-end pb-1 sm:pb-0 sm:items-center">
              <div className="flex gap-1 sm:gap-2 px-1 w-full">
                {filteredNav.map(item => {
                  const isActive = currentPage === item.id;
                  return (
                    <button key={item.id} onClick={() => setCurrentPage(item.id)} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'bg-slate-100 dark:bg-[#1A1A24] text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1A1A24]/50'}`}>
                      <item.icon className={`w-4 h-4 ${isActive ? 'text-emerald-500' : 'opacity-60'}`} /> {item.label}
                    </button>
                  )
                })}
              </div>
            </nav>

            <div className="hidden sm:flex items-center gap-3 pl-6 shrink-0">
              {user.role === 'admin' && clients.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] px-2.5 py-1.5 rounded-lg shadow-inner mr-2">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <select value={activeClient?.uid || ''} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent text-sm font-bold outline-none cursor-pointer text-slate-700 dark:text-slate-300">
                    {clients.map(c => <option key={c.uid} value={c.uid} className="dark:bg-[#1A1A24]">{c.name}</option>)}
                  </select>
                </div>
              )}

              {activeClient && <LiveStatusBadge timestamp={liveData.timestamp} />}
              
              <button onClick={toggleTheme} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1A1A24] rounded-md transition-colors">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              
              <div className="flex items-center gap-2 border-l border-slate-200 dark:border-[#2A2A35] pl-3 ml-1">
                <button onClick={() => setCurrentPage('profile')} className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-500 transition-colors mr-2">
                  {user.name}
                </button>
                <button onClick={handleLogout} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors" title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
           <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                {filteredNav.find(n => n.id === currentPage)?.label || 'Overview'}
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-medium">
                {currentPage === 'profile' 
                  ? 'Manage your personal account settings.' 
                  : user.role === 'admin' ? `Viewing data profile for: ${activeClient?.name || 'Loading...'}` : 'Your personal system overview.'}
              </p>
           </div>
        </div>
        {renderPage()}
      </main>
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
    <div className="max-w-2xl">
      <div className={`${modernCard} overflow-hidden`}>
        <div className="p-6 border-b border-slate-200 dark:border-[#2A2A35] flex justify-between items-center bg-slate-50/50 dark:bg-[#1A1A24]/50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2.5 rounded-full text-emerald-600 dark:text-emerald-400">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account Details</h2>
              <p className="text-xs text-slate-500">Personal information and system configuration.</p>
            </div>
          </div>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className={`${modernButton} bg-slate-100 dark:bg-[#2A2A35] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#3A3A45] text-xs py-1.5`}>
              <Edit2 className="w-3.5 h-3.5" /> Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={loading} className={`${modernButton} bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 text-xs py-1.5 disabled:opacity-50`}>
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={loading} className={`${modernButton} bg-emerald-500 hover:bg-emerald-600 text-white text-xs py-1.5 disabled:opacity-50`}>
                <Save className="w-3.5 h-3.5" /> {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
        
        <div className="p-6 space-y-6">
          {/* Read-only System Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b border-slate-100 dark:border-[#2A2A35]">
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">Email Address</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">{user.email}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">Account Role</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-200 uppercase">{user.role}</div>
            </div>
            {user.role !== 'admin' && (
              <div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">Target ESP ID</div>
                <div className="text-sm font-mono text-slate-600 dark:text-slate-400">{user.espId || 'Simulated'}</div>
              </div>
            )}
          </div>

          {/* Editable Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5"><Users className="w-3 h-3"/> Full Name</label>
              {isEditing ? (
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#12121A] border border-slate-200 dark:border-[#3A3A45] text-slate-900 dark:text-white text-sm outline-none focus:border-emerald-500" />
              ) : (
                <div className="text-base font-semibold text-slate-900 dark:text-white py-1">{user.name}</div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5"><Phone className="w-3 h-3"/> Mobile Number</label>
              {isEditing ? (
                <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange} placeholder="e.g. +91 9876543210" className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#12121A] border border-slate-200 dark:border-[#3A3A45] text-slate-900 dark:text-white text-sm outline-none focus:border-emerald-500" />
              ) : (
                <div className="text-base font-semibold text-slate-900 dark:text-white py-1">{user.mobile || 'Not Provided'}</div>
              )}
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> Installation Location</label>
              {isEditing ? (
                <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. RVCE Campus, Mysore Road" className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#12121A] border border-slate-200 dark:border-[#3A3A45] text-slate-900 dark:text-white text-sm outline-none focus:border-emerald-500" />
              ) : (
                <div className="text-base font-semibold text-slate-900 dark:text-white py-1">{user.location || 'Not Provided'}</div>
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

  // 1 Hour Graph Data
  const getOneHourChartData = () => {
    const oneHourAgo = Date.now() - 3600000; // 1 hour in ms
    let recentHistory = history.filter(h => h.id >= oneHourAgo);
    
    // Sub-sample to ~60 points max so browser graph doesn't lag if ESP sends 1200 points/hr
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
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
          <Server className="text-emerald-500 w-5 h-5 animate-pulse shrink-0" />
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Direct TCP Connection to {activeClient.name} Hardware Active. Real-time telemetry engaged.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="PV Array Output" value={`${liveData.solar.power} W`} sub={`${liveData.solar.voltage}V / ${liveData.solar.current}A`} icon={<Sun />} color="emerald" />
        <KpiCard title="Battery Storage" value={`${liveData.battery.percentage}%`} sub={`${liveData.battery.voltage}V • ${liveData.battery.temp}°C`} icon={<Battery />} color={liveData.battery.percentage > 20 ? "blue" : "red"} />
        <KpiCard title="Site Load" value={`${liveData.load.power} W`} sub="Live Consumption" icon={<Activity />} color="slate" />
        <KpiCard title="Grid Exchange" value={`${Math.abs(liveData.grid.importExport)} W`} sub={liveData.grid.importExport < 0 ? "Exporting" : "Importing"} icon={<ArrowRightLeft />} color={liveData.grid.importExport < 0 ? "emerald" : "orange"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-2 ${modernCard} p-5`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400">Power Distribution</h3>
            <span className="text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-[#1A1A24] text-slate-600 dark:text-slate-400 rounded">1H Timeline</span>
          </div>
          <div className="h-64">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#2A2A35' : '#e2e8f0'} vertical={false} />
                  <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1A1A24' : '#ffffff', borderRadius: '8px', border: theme === 'dark' ? '1px solid #2A2A35' : '1px solid #e2e8f0', fontSize: '12px', color: theme === 'dark' ? '#fff' : '#000' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="solar" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSolar)" name="Solar Gen (W)" />
                  <Area type="monotone" dataKey="load" stroke="#64748b" strokeWidth={2} fillOpacity={1} fill="url(#colorLoad)" name="Consumption (W)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
               <div className="flex items-center justify-center h-full text-slate-400 text-sm">Waiting for hardware telemetry...</div>
            )}
          </div>
        </div>

        <div className={`${modernCard} p-5 flex flex-col`}>
           <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
             <BrainCircuit className="w-4 h-4 text-indigo-500" /> ML Active Strategy
           </h3>
           
           <div className="flex-1 flex flex-col items-center justify-center">
             {liveData.weather.current && liveData.mlDecision ? (
               <div className="flex flex-col items-center text-center">
                 <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Hysteresis AI Active</div>
                 <div className="text-4xl font-black text-slate-900 dark:text-white mb-2">
                   {liveData.mlDecision.strategy}
                 </div>
                 <span className={`text-sm font-bold ${liveData.mlDecision.color} bg-slate-50 dark:bg-[#1A1A24] px-3 py-1 rounded-full border border-slate-100 dark:border-[#2A2A35]`}>
                   {liveData.mlDecision.batteryPolicy}
                 </span>
               </div>
             ) : (
               <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             )}
           </div>
           
           <div className="grid grid-cols-2 gap-3 mt-6">
             <div className="bg-slate-50 dark:bg-[#1A1A24] p-3 rounded-lg border border-slate-100 dark:border-[#2A2A35]">
               <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Battery Rule</div>
               <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                 {liveData.mlDecision?.relays.r1 ? 'Charge Active' : 'Charge Bypass'}
               </div>
             </div>
             <div className="bg-slate-50 dark:bg-[#1A1A24] p-3 rounded-lg border border-slate-100 dark:border-[#2A2A35]">
               <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Grid Policy</div>
               <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
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

  if (liveData.weather.loading) return <div className="p-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">Initializing Meteorological Models & ML Engine...</div>;

  return (
    <div className="space-y-6">
      <div className={`${modernCard} p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6`}>
         <div>
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-slate-900 dark:text-white">
              <BrainCircuit className="w-5 h-5 text-indigo-500" />
              Machine Learning Forecasting Engine
            </h2>
            <p className="text-slate-500 text-sm max-w-3xl">
              Uses Open-Meteo API for 7-Day predictive modeling. The embedded model pairs generation efficiency with battery hysteresis logic to seamlessly automate your solar relays.
            </p>
         </div>
         {liveData.relays.mode === 'auto' ? (
           <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800/50 text-sm font-bold shrink-0">
             <CheckCircle2 className="w-4 h-4" /> AI Auto-Pilot Enabled
           </div>
         ) : (
           <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#1A1A24] text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-[#2A2A35] text-sm font-bold shrink-0">
             <AlertCircle className="w-4 h-4" /> AI Auto-Pilot Disabled
           </div>
         )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {liveData.weather.forecast.map((day, idx) => (
          <div key={idx} className={`${modernCard} p-4 flex flex-col items-center text-center ${idx === 0 ? 'ring-2 ring-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' : ''}`}>
            {idx === 0 && <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">Today</span>}
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">{day.date}</div>
            <day.icon className={`w-8 h-8 mb-3 ${day.color}`} />
            
            <div className="flex gap-2 text-sm font-bold mb-1">
               <span className="text-slate-900 dark:text-slate-100">{day.maxTemp}°</span>
               <span className="text-slate-400">{day.minTemp}°</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-3">
              <span className="flex items-center gap-0.5"><Cloud className="w-3 h-3"/> {day.cloudCover}%</span>
              <span className="flex items-center gap-0.5"><Droplets className="w-3 h-3 text-blue-500"/> {day.rainProb}%</span>
            </div>

            <div className="w-full pt-3 border-t border-slate-100 dark:border-[#2A2A35]">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">Predicted Eff.</div>
              <div className={`text-lg font-black ${day.efficiencyPct > 70 ? 'text-emerald-500' : day.efficiencyPct > 40 ? 'text-orange-500' : 'text-rose-500'}`}>{day.efficiencyPct}%</div>
            </div>
          </div>
        ))}
      </div>
      
      <div className={`${modernCard} p-6`}>
        <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4 border-b border-slate-100 dark:border-[#2A2A35] pb-2">Hysteresis & Interlock Logic Summary</h3>
        <div className="text-sm text-slate-500 leading-relaxed space-y-4">
          <p>
            <strong>1. Hardware Safety Interlock:</strong> Relay 2 (Battery Load) and Relay 3 (Grid Load) are mutually exclusive. It is physically impossible to activate both simultaneously via software, preventing cross-conduction and protecting the inverters.
          </p>
          <p>
            <strong>2. Battery Hysteresis Rule:</strong> 
            <br/> • If SOC drops below <strong>40%</strong>, the system overrides all AI efficiency algorithms. It forces Relay 3 ON (Grid Import) and Relay 2 OFF (Disables Battery Load) to protect battery health.
            <br/> • If SOC hits <strong>85%</strong>, it analyzes the ML Weather array to determine if it should begin aggressive surplus exports to the BESCOM grid or hold the charge due to impending cloud cover.
          </p>
        </div>
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

    // Strict Hardware Interlocks implemented from legacy code
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
      <div className={`${modernCard} p-5 flex flex-col md:flex-row justify-between items-center gap-4`}>
        <div className="flex items-center gap-3">
           <Cpu className="w-6 h-6 text-slate-400" />
           <div>
             <h2 className="text-base font-bold text-slate-900 dark:text-white">Relay Modules</h2>
             <p className="text-xs font-medium text-slate-500">Direct TCP interface to ESP32 solid-state relays.</p>
           </div>
        </div>
        
        <div className="flex items-center gap-4">
          {user.role === 'admin' ? (
            <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-md border border-emerald-100 dark:border-emerald-800/50">
              <Shield className="w-3.5 h-3.5" /> Admin Access
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-[#1A1A24] px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#2A2A35]">
              <Info className="w-3.5 h-3.5" /> Read-Only
            </div>
          )}

          <div className="flex bg-slate-100 dark:bg-[#1A1A24] p-1 rounded-lg border border-slate-200 dark:border-[#2A2A35]">
            <button onClick={toggleMode} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${liveData.relays.mode === 'auto' ? 'bg-white dark:bg-[#2A2A35] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              AUTO (AI)
            </button>
            <button onClick={toggleMode} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${liveData.relays.mode === 'manual' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              MANUAL
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RelayControlCard 
          id="r1" 
          title="Relay 1 (Solar Diversion)" 
          desc="Controls Solar PV destination. OFF (Normally Closed): Solar directed to Grid. ON (Normally Open): Solar directed to Battery." 
          state={liveData.relays.r1} 
          isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} 
          onToggle={() => handleRelayToggle('r1')} 
          warning
        />
        <RelayControlCard 
          id="r2" 
          title="Relay 2 (Battery Load)" 
          desc="Controls inverter output. OFF (Normally Closed): House disconnected from battery. ON (Normally Open): House powered by Battery." 
          state={liveData.relays.r2} 
          isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} 
          onToggle={() => handleRelayToggle('r2')} 
        />
        <RelayControlCard 
          id="r3" 
          title="Relay 3 (Grid Load)" 
          desc="Controls Grid Power flow to house. OFF (Normally Closed): Disconnected. ON (Normally Open): House powered directly by Grid." 
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
  const [filter, setFilter] = useState('1d');

  // Aggregation Logic for Data Logs
  const getGroupedHistory = (hist, filterType) => {
    let cutoff = Date.now();
    let bucketSizeMs = 60000; // default 1 min

    if (filterType === '1h') { cutoff -= 3600000; bucketSizeMs = 60000; }
    else if (filterType === '6h') { cutoff -= 6 * 3600000; bucketSizeMs = 5 * 60000; }
    else if (filterType === '12h') { cutoff -= 12 * 3600000; bucketSizeMs = 10 * 60000; }
    else if (filterType === '1d') { cutoff -= 24 * 3600000; bucketSizeMs = 10 * 60000; }
    else if (filterType === '7d') { cutoff -= 7 * 24 * 3600000; bucketSizeMs = 30 * 60000; }
    else if (filterType === '1mo') { cutoff -= 30 * 24 * 3600000; bucketSizeMs = 120 * 60000; }

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
          timestamp: d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
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
    <div className={`${modernCard} overflow-hidden flex flex-col h-[calc(100vh-12rem)]`}>
      <div className="p-4 border-b border-slate-200 dark:border-[#2A2A35] flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-[#1A1A24]/50">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Node Telemetry Logs</h2>
          <p className="text-xs font-medium text-slate-500">Historical snapshot timeline synced with device telemetry.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white dark:bg-[#1A1A24] border border-slate-200 dark:border-[#3A3A45] text-slate-700 dark:text-slate-300 text-xs px-3 py-1.5 rounded-lg outline-none cursor-pointer"
          >
            <option value="1h">Last 1 Hour (Minute avg)</option>
            <option value="6h">Last 6 Hours (5-Min avg)</option>
            <option value="12h">Last 12 Hours (10-Min avg)</option>
            <option value="1d">Last 24 Hours (10-Min avg)</option>
            <option value="7d">Last 7 Days (30-Min avg)</option>
            <option value="1mo">Last 30 Days (2-Hour avg)</option>
          </select>

          <button onClick={handleExportCSV} className={`${modernButton} bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-transparent shadow-sm text-xs py-1.5`}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-[#12121A] border-b border-slate-200 dark:border-[#2A2A35] sticky top-0 z-10 text-slate-500 font-bold text-xs uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3">Received Timestamp</th>
              <th className="px-5 py-3">PV Input (V/A/W)</th>
              <th className="px-5 py-3">Battery SoC</th>
              <th className="px-5 py-3">Load</th>
              <th className="px-5 py-3">Grid Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1A1A24]">
            {displayHistory.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-[#1A1A24] transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.timestamp}</td>
                <td className="px-5 py-3 font-medium text-slate-700 dark:text-slate-300">{row.solarV}V / {row.solarI}A / {row.solarP}W</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-[#2A2A35] rounded-full overflow-hidden">
                      <div className={`h-full ${row.batteryPct > 50 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${row.batteryPct}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{row.batteryPct}%</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300 font-bold">{row.loadP} W</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${row.gridStatus === 'Exporting' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'}`}>
                    {row.gridStatus}
                  </span>
                </td>
              </tr>
            ))}
            {displayHistory.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">No historical data found for the selected time range.</td>
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
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${modernCard} p-6 flex flex-col justify-center`}>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><ArrowRightLeft className="w-3 h-3 text-orange-500"/> Grid Import</div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{liveData.billing.imported.toFixed(1)} <span className="text-sm font-medium text-slate-400">kWh</span></div>
          <div className="text-xs font-semibold text-orange-500 border-t border-slate-100 dark:border-[#2A2A35] pt-2 mt-2">Cost: ₹{(liveData.billing.imported * TARIFF.BUY).toFixed(2)}</div>
        </div>
        <div className={`${modernCard} p-6 flex flex-col justify-center`}>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-2"><Sun className="w-3 h-3 text-emerald-500"/> Solar Export</div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{liveData.billing.exported.toFixed(1)} <span className="text-sm font-medium text-slate-400">kWh</span></div>
          <div className="text-xs font-semibold text-emerald-500 border-t border-slate-100 dark:border-[#2A2A35] pt-2 mt-2">Revenue: ₹{(liveData.billing.exported * TARIFF.SELL).toFixed(2)}</div>
        </div>
        <div className={`${modernCard} p-6 flex flex-col justify-center ${netTotal > 0 ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'bg-emerald-50/50 dark:bg-emerald-900/10'}`}>
          <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Net Balance Estimate</div>
          <div className={`text-4xl font-black tracking-tight mb-1 ${netTotal > 0 ? 'text-orange-600 dark:text-orange-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
            ₹{Math.abs(netTotal).toFixed(2)}
          </div>
          <div className="text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-[#2A2A35] pt-2 mt-2">{netTotal > 0 ? 'Due to Utility' : 'Credit from Utility'}</div>
        </div>
      </div>
      
      <div className={`${modernCard} p-6 mt-4`}>
         <h3 className="font-bold text-sm mb-4 text-slate-900 dark:text-white border-b border-slate-100 dark:border-[#2A2A35] pb-2">Tariff Structure</h3>
         <div className="flex gap-8 text-sm">
           <div><span className="text-slate-500">Buy Rate:</span> <span className="font-semibold text-slate-900 dark:text-white">₹{TARIFF.BUY}/kWh</span></div>
           <div><span className="text-slate-500">Sell Rate:</span> <span className="font-semibold text-slate-900 dark:text-white">₹{TARIFF.SELL}/kWh</span></div>
         </div>
      </div>
    </div>
  );
};

const UsersPage = () => {
  const { clients, api, liveData } = useContext(DataContext);

  return (
    <div className={`${modernCard} overflow-hidden`}>
      <div className="p-4 border-b border-slate-200 dark:border-[#2A2A35] flex justify-between items-center bg-slate-50/50 dark:bg-[#1A1A24]/50">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Client Directory</h2>
          <p className="text-xs font-medium text-slate-500">Registered clients in the ecosystem</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 dark:bg-[#12121A] text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200 dark:border-[#2A2A35]">
            <tr>
              <th className="px-5 py-3">Client Name</th>
              <th className="px-5 py-3">Contact Info</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Data Feed Type</th>
              <th className="px-5 py-3 text-right">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1A1A24]">
            {clients.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-5 py-8 text-center text-slate-500">No active clients registered.</td>
              </tr>
            ) : clients.map(c => (
              <tr key={c.uid} className="hover:bg-slate-50 dark:hover:bg-[#1A1A24] transition-colors">
                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                <td className="px-5 py-3">
                  <div className="text-slate-600 dark:text-slate-300">{c.email}</div>
                  <div className="text-[10px] text-slate-400">{c.mobile || 'No Mobile'}</div>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{c.location || 'N/A'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${c.dataType === 'real' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-[#2A2A35] text-slate-600 dark:text-slate-300'}`}>
                    {c.dataType === 'real' ? 'Hardware' : 'Simulated'}
                  </span>
                  {c.dataType === 'real' && <div className="text-[10px] text-slate-400 mt-1 font-mono">{c.espId}</div>}
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => { if(window.confirm('Delete this client profile from the database?')) api.deleteUser(c.uid); }} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
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
    emerald: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20',
    blue: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20',
    red: 'text-red-500 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20',
    slate: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
    orange: 'text-orange-500 bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20',
  };
  
  return (
    <div className={`${modernCard} p-4 sm:p-5 flex flex-col`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-lg border ${colorMap[color]}`}>
          {React.cloneElement(icon, { className: "w-5 h-5" })}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{title}</div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{value}</div>
        <div className="text-xs font-medium text-slate-400">{sub}</div>
      </div>
    </div>
  );
};

const RelayControlCard = ({ title, desc, state, isAuto, onToggle, warning }) => (
  <div className={`${modernCard} p-5 flex flex-col justify-between ${state ? 'ring-1 ring-emerald-500/50' : ''}`}>
    <div>
      <div className="flex justify-between items-center mb-2 border-b border-slate-100 dark:border-[#2A2A35] pb-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          {title} 
          {warning && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Safety interlocks apply" />}
        </h4>
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${state ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-[#1A1A24] text-slate-500 border border-slate-200 dark:border-[#2A2A35]'}`}>
          {state ? 'ON' : 'OFF'}
        </div>
      </div>
      <p className="text-xs font-medium text-slate-500 mb-6 min-h-[36px] mt-3 leading-relaxed">{desc}</p>
    </div>
    
    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50 dark:border-[#1A1A24]">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{state ? 'Circuit Engaged (NO)' : 'Circuit Bypassed (NC)'}</span>
      <button 
        onClick={onToggle} 
        disabled={isAuto} 
        className={`p-1 rounded-lg transition-all ${isAuto ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-[#2A2A35] cursor-pointer'} ${state ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
      >
        {state ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
      </button>
    </div>
  </div>
);
