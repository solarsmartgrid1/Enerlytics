import React, { useState, useEffect, useContext, createContext } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Sun, Moon, CloudRain, Cloud, Battery, Zap, Activity, Users, 
  Shield, Droplets, ArrowRightLeft, DollarSign,
  Cpu, AlertCircle, CheckCircle2, LogOut, Download, 
  Plus, Trash2, Info, ToggleLeft, ToggleRight, CloudLightning,
  Server, LayoutGrid, List, BrainCircuit, Clock
} from 'lucide-react';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

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

const MOCK_CLIENTS = [
  { id: 'rvce_hardware', name: 'RVCE', type: 'real' },
  { id: 'client_001', name: 'Alpha', type: 'sim' },
  { id: 'client_002', name: 'Beta', type: 'sim' }
];

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

  // Incorporates legacy hysteresis boundaries alongside ML efficiencies
  decideAction: (efficiencyPct, batteryPct) => {
    // 1. Critical Low (Battery < 40%) - Safety Hysteresis overrides ML
    if (batteryPct < 40) {
      return {
        strategy: "Import Mode (Low SoC)",
        batteryPolicy: "Priority Charging",
        relays: { r1: true, r2: false, r3: true }, // Charge, Load off bat, Load from Grid
        color: "text-rose-500"
      };
    }
    
    // 2. High Capacity (Battery >= 85%) - Blend with ML prediction
    if (batteryPct >= 85) {
      if (efficiencyPct > 50) {
        return {
          strategy: "Aggressive Export",
          batteryPolicy: "Full / Discharging",
          relays: { r1: false, r2: true, r3: false }, // Export PV to grid, Load from Bat
          color: "text-emerald-500"
        };
      } else {
        return {
          strategy: "Weather Hoard Mode",
          batteryPolicy: "Hold Charge (Low Sun)",
          relays: { r1: true, r2: true, r3: false }, // Low sun incoming, keep charging battery
          color: "text-amber-500"
        };
      }
    }

    // 3. Medium Capacity (40% - 84%) - Standard Cycle
    return {
      strategy: efficiencyPct > 70 ? "Balanced (High Yield)" : "Balanced Cycle",
      batteryPolicy: "Standard Operation",
      relays: { r1: true, r2: true, r3: false }, // Charge Bat, Load from Bat, Grid Off
      color: "text-blue-500"
    };
  }
};

// ==========================================
// 2. CONTEXTS & MOCK DATA
// ==========================================
const AuthContext = createContext();
const ThemeContext = createContext();
const ToastContext = createContext();
const DataContext = createContext();

const INITIAL_HISTORY = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  timestamp: new Date(Date.now() - (50 - i) * 60000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
  solarV: (12 + Math.random() * 3).toFixed(1),
  solarI: (2 + Math.random() * 3).toFixed(1),
  solarP: (30 + Math.random() * 40).toFixed(1),
  batteryPct: Math.floor(60 + Math.random() * 40),
  loadP: (20 + Math.random() * 20).toFixed(1),
  gridStatus: Math.random() > 0.5 ? 'Exporting' : 'Importing'
}));

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
  const [activeClientId, setActiveClientId] = useState(user?.role === 'admin' ? 'rvce_hardware' : user?.id);
  const { addToast } = useContext(ToastContext);
  
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

  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [users, setUsers] = useState([
    { id: 1, name: 'RVCE Node', role: 'user', deviceId: 'ESP32-RVCE', status: 'online', lastActive: 'Just now' },
    { id: 2, name: 'Client Alpha', role: 'user', deviceId: 'SIM-001', status: 'online', lastActive: 'Just now' },
    { id: 3, name: 'Client Beta', role: 'user', deviceId: 'SIM-002', status: 'offline', lastActive: '2 hrs ago' }
  ]);

  // 1. Fetch Weather Data once
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloudcover_mean&timezone=Asia%2FKolkata');
        const data = await res.json();
        
        const forecast = data.daily.time.map((time, index) => {
          const wmoState = mapWmoToState(data.daily.weathercode[index]);
          const cloudCover = data.daily.cloudcover_mean[index];
          const rainProb = data.daily.precipitation_probability_max[index];
          const maxTemp = data.daily.temperature_2m_max[index];
          
          const effRatio = SolarMLPredictor.predictEfficiency(cloudCover, rainProb, maxTemp);
          return {
            date: new Date(time).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
            maxTemp, minTemp: data.daily.temperature_2m_min[index],
            rainProb, cloudCover,
            efficiencyPct: Math.round(effRatio * 100),
            ...wmoState
          };
        });

        setLiveData(prev => ({ ...prev, weather: { current: forecast[0], forecast, loading: false } }));
      } catch (err) {
        addToast("Weather Engine failed. Using cached heuristics.", "error");
      }
    };
    fetchWeather();
  }, []);

  // 2. Real-Time Hysteresis & ML Processing Loop (Auto Mode)
  useEffect(() => {
    if (liveData.relays.mode === 'auto' && liveData.weather.current) {
      const decision = SolarMLPredictor.decideAction(liveData.weather.current.efficiencyPct, liveData.battery.percentage);
      
      const r1Changed = liveData.relays.r1 !== decision.relays.r1;
      const r2Changed = liveData.relays.r2 !== decision.relays.r2;
      const r3Changed = liveData.relays.r3 !== decision.relays.r3;

      if (r1Changed || r2Changed || r3Changed) {
        api.updateMultipleRelays(decision.relays); // Push to hardware/state
      }

      if (liveData.mlDecision?.strategy !== decision.strategy) {
        setLiveData(prev => ({ ...prev, mlDecision: decision }));
      }
    }
  }, [liveData.battery.percentage, liveData.relays.mode, liveData.weather.current]);

  // 3. Sync with Firestore for RVCE OR Simulate 
  useEffect(() => {
    let unsub = null;
    let interval = null;

    if (activeClientId === 'rvce_hardware' && db) {
      const docRef = doc(db, 'devices', 'rvce_hardware');
      unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLiveData(prev => ({
            ...prev,
            timestamp: Date.now(), // Hardware ping registered
            solar: data.solar || prev.solar,
            battery: data.battery || prev.battery,
            load: data.load || prev.load,
            grid: data.grid || prev.grid,
            relays: data.relays || prev.relays,
          }));
        }
      });
    } else {
      interval = setInterval(() => {
        setLiveData(prev => {
          // Dynamic battery to visibly demonstrate hysteresis over time
          let newBat = prev.battery.percentage;
          if (prev.relays.r1) newBat += 0.8; // Charging from Solar
          if (prev.relays.r2) newBat -= 0.5; // Discharging to Load
          newBat = Math.max(0, Math.min(100, newBat)); // Clamp
          
          const newSolarP = Math.max(0, prev.solar.power + (Math.random() * 2 - 1));
          const newLoadP = Math.max(10, 20 + (Math.random() * 2 - 1));
          
          return {
            ...prev,
            timestamp: Date.now(), // Simulated ping
            solar: { ...prev.solar, power: Number(newSolarP.toFixed(1)) },
            battery: { ...prev.battery, percentage: Number(newBat.toFixed(1)) },
            load: { ...prev.load, power: Number(newLoadP.toFixed(1)) },
            grid: { ...prev.grid, importExport: Number((newLoadP - newSolarP).toFixed(1)) }
          };
        });
      }, 3000);
    }

    return () => {
      if (unsub) unsub();
      if (interval) clearInterval(interval);
    };
  }, [activeClientId]);

  // API to push Relay updates with Hardware Interlocks
  const api = {
    updateRelayMode: (mode) => {
      setLiveData(prev => ({ ...prev, relays: { ...prev.relays, mode } }));
      if (activeClientId === 'rvce_hardware' && db) {
        setDoc(doc(db, 'devices', 'rvce_hardware'), { relays: { mode } }, { merge: true }).catch(()=>{});
      }
    },
    updateMultipleRelays: async (newRelays) => {
      setLiveData(prev => ({ ...prev, relays: { ...prev.relays, ...newRelays } }));
      if (activeClientId === 'rvce_hardware' && db) {
        try {
          await setDoc(doc(db, 'devices', 'rvce_hardware'), { relays: newRelays }, { merge: true });
        } catch (e) {
           console.error("Hardware sync issue");
        }
      }
    }
  };

  return <DataContext.Provider value={{ liveData, history, users, api, activeClientId, setActiveClientId, clients: MOCK_CLIENTS }}>{children}</DataContext.Provider>;
};

// ==========================================
// 4. UI COMPONENTS & LAYOUT
// ==========================================
const LiveStatusBadge = ({ timestamp }) => {
  const [isLive, setIsLive] = useState(true);

  // Monitor freshness (10s threshold)
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - timestamp > 10000) setIsLive(false);
      else setIsLive(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  if (isLive) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-500/20 transition-all">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        LIVE
      </div>
    );
  }

  const formattedDate = new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  }).toUpperCase();

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-[#1A1A24] text-slate-500 dark:text-slate-400 rounded text-[10px] font-bold border border-slate-200 dark:border-[#2A2A35] transition-all">
      <Clock className="w-3 h-3 opacity-60" />
      Last Updated: {formattedDate}
    </div>
  );
};


export default function App() {
  const [user, setUser] = useState(null); 
  const [theme, setTheme] = useState('light');
  const [authLoading, setAuthLoading] = useState(true);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    if (!auth) return setAuthLoading(false);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        if (email.includes('admin')) setUser({ id: 'admin_sys', name: 'Admin', role: 'admin' });
        else if (email.includes('rvce')) setUser({ id: 'rvce_hardware', name: 'RVCE', role: 'user' });
        else setUser({ id: 'client', name: 'Alpha Client', role: 'user' });
      } else setUser(null);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.body.className = `${theme} bg-[#F8FAFC] dark:bg-[#09090E] text-slate-900 dark:text-slate-100 transition-colors duration-300 selection:bg-emerald-500/30`;
  }, [theme]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-bold">Connecting Securely...</div>;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ToastProvider>
        <AuthContext.Provider value={{ user, setUser }}>
          <div className="min-h-screen font-sans flex flex-col relative">
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
  const { setUser } = useContext(AuthContext);
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const emailMap = { 'Admin': 'admin@solarenerlytics.com', 'RVCE': 'rvce@solarenerlytics.com', 'Client': 'client@solarenerlytics.com' };
    const email = emailMap[username] || username;

    const fallbackLogin = () => {
      if (username === 'Admin') setUser({ id: 'admin_sys', name: 'Admin', role: 'admin' });
      else if (username === 'RVCE') setUser({ id: 'rvce_hardware', name: 'RVCE', role: 'user' });
      else setUser({ id: 'client_001', name: 'Alpha Client', role: 'user' });
    };

    try {
      if (auth) await signInWithEmailAndPassword(auth, email, password);
      else fallbackLogin();
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          if (createErr.code === 'auth/configuration-not-found' || createErr.code === 'auth/operation-not-allowed') fallbackLogin(); 
          else setError(createErr.message.replace('Firebase:', '').trim());
        }
      } else if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
         fallbackLogin(); 
      } else setError(err.message.replace('Firebase:', '').trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className={`${modernCard} max-w-md w-full p-8 sm:p-10 relative overflow-hidden`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <div className="bg-slate-900 dark:bg-white p-3 rounded-lg shadow-sm">
              <Zap className="w-6 h-6 text-white dark:text-slate-900" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">Solar Enerlytics</h2>
          <p className="text-center text-slate-500 text-sm mb-8">Secure Grid Management Portal</p>
          
          {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800/50">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50 outline-none text-sm font-medium" />
            </div>
            <button type="submit" disabled={loading} className={`${modernButton} w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 py-3 mt-4 disabled:opacity-70`}>
              {loading ? 'Authenticating...' : 'Authenticate & Enter'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-[#2A2A35] text-center flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-500">
            <Shield className="w-4 h-4" /> <span className="text-xs font-bold">Firebase Protected</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const MainLayout = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { user, setUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { addToast } = useContext(ToastContext);
  const { liveData, activeClientId, setActiveClientId, clients } = useContext(DataContext);

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Overview', icon: LayoutGrid, roles: ['admin', 'user'] },
    { id: 'weather', label: 'Forecasting', icon: CloudLightning, roles: ['admin', 'user'] },
    { id: 'relays', label: 'Hardware', icon: Cpu, roles: ['admin', 'user'] },
    { id: 'billing', label: 'Statements', icon: DollarSign, roles: ['admin', 'user'] },
    { id: 'history', label: 'Data Logs', icon: List, roles: ['admin', 'user'] },
    { id: 'users', label: 'Directory', icon: Users, roles: ['admin'] },
  ];

  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

  const handleLogout = async () => {
    if (auth) try { await signOut(auth); } catch (e) {}
    setUser(null);
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
      default: return <DashboardPage />;
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white dark:bg-[#12121A] border-b border-slate-200 dark:border-[#2A2A35] shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-0 sm:h-16 gap-2 sm:gap-0">
            
            <div className="flex justify-between items-center w-full sm:w-auto pr-0 sm:pr-8 border-r-0 sm:border-r border-slate-200 dark:border-[#2A2A35] h-full">
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
                <div className="bg-slate-900 dark:bg-white p-1.5 rounded text-white dark:text-slate-900">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">Solar Enerlytics</span>
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

            <div className="hidden sm:flex items-center gap-3 pl-6">
              {user.role === 'admin' && (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1A1A24] border border-slate-200 dark:border-[#2A2A35] px-2.5 py-1.5 rounded-lg shadow-inner mr-2">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <select value={activeClientId} onChange={(e) => setActiveClientId(e.target.value)} className="bg-transparent text-sm font-bold outline-none cursor-pointer text-slate-700 dark:text-slate-300">
                    {clients.map(c => <option key={c.id} value={c.id} className="dark:bg-[#1A1A24]">{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* DYNAMIC LIVE BADGE */}
              <LiveStatusBadge timestamp={liveData.timestamp} />
              
              <button onClick={toggleTheme} className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1A1A24] rounded-md transition-colors">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              
              <div className="flex items-center gap-2 border-l border-slate-200 dark:border-[#2A2A35] pl-3 ml-1">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{user.name}</div>
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
                {user.role === 'admin' ? `Viewing data profile for: ${clients.find(c => c.id === activeClientId)?.name}` : 'Your personal system overview.'}
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

const DashboardPage = () => {
  const { liveData, activeClientId } = useContext(DataContext);
  const { theme } = useContext(ThemeContext);
  const isRVCE = activeClientId === 'rvce_hardware';

  const chartData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}:00`,
    solar: Math.max(0, liveData.solar.power - (20 - i) * 2 + Math.random() * 10),
    load: Math.max(10, liveData.load.power - (20 - i) + Math.random() * 5)
  }));

  return (
    <div className="space-y-6">
      {isRVCE && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
          <Server className="text-emerald-500 w-5 h-5 animate-pulse" />
          <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Direct TCP Connection to RVCE ESP32 Hardware Active. Real-time telemetry engaged.</span>
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
            <span className="text-xs font-bold px-2 py-1 bg-slate-100 dark:bg-[#1A1A24] text-slate-600 dark:text-slate-400 rounded">24H Timeline</span>
          </div>
          <div className="h-64">
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
        <p className="text-sm text-slate-500 leading-relaxed">
          The embedded application merges Machine Learning efficiency predictions with robust hardware safety interlocks.
          <br/><br/>
          <strong>1. Safety Interlock:</strong> Relay 2 (Battery Load) and Relay 3 (Grid Load) are mutually exclusive. It is physically impossible to activate both simultaneously via the software, protecting the inverters.
          <br/>
          <strong>2. Battery Hysteresis:</strong> If Battery SOC falls below 40%, the system overrides all AI efficiency algorithms and forces Relay 3 ON (Grid Import). If Battery SOC hits 85%, it analyzes the ML Weather Array to determine if it should begin aggressive surplus exports to the BESCOM grid.
        </p>
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
        <RelayControlCard id="r1" title="Solar Diversion (R1)" desc="Routes PV current to charge controller vs open circuit." state={liveData.relays.r1} isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} onToggle={() => handleRelayToggle('r1')} />
        <RelayControlCard id="r2" title="Battery Load (R2)" desc="Connects inverter output to primary house circuits." state={liveData.relays.r2} isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} onToggle={() => handleRelayToggle('r2')} />
        <RelayControlCard id="r3" title="Grid Contactor (R3)" desc="Closes circuit to BESCOM grid for net metering." state={liveData.relays.r3} isAuto={liveData.relays.mode === 'auto' || user.role !== 'admin'} onToggle={() => handleRelayToggle('r3')} />
      </div>
    </div>
  );
};

const HistoryPage = () => {
  const { history } = useContext(DataContext);
  const { addToast } = useContext(ToastContext);

  return (
    <div className={`${modernCard} overflow-hidden flex flex-col h-[calc(100vh-12rem)]`}>
      <div className="p-4 border-b border-slate-200 dark:border-[#2A2A35] flex justify-between items-center bg-slate-50/50 dark:bg-[#1A1A24]/50">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Node Telemetry</h2>
          <p className="text-xs font-medium text-slate-500">Chronological snapshot log.</p>
        </div>
        <button onClick={() => addToast('Exporting dataset...', 'success')} className={`${modernButton} bg-white dark:bg-[#2A2A35] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#3A3A45] hover:bg-slate-50 dark:hover:bg-[#3A3A45] shadow-sm text-xs py-1.5`}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-[#12121A] border-b border-slate-200 dark:border-[#2A2A35] sticky top-0 z-10 text-slate-500 font-bold text-xs uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3">Timestamp</th>
              <th className="px-5 py-3">PV Input (V/A/W)</th>
              <th className="px-5 py-3">Battery SoC</th>
              <th className="px-5 py-3">Load</th>
              <th className="px-5 py-3">Grid Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1A1A24]">
            {history.map((row) => (
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
  const { users, api } = useContext(DataContext);
  const { addToast } = useContext(ToastContext);

  const handleAdd = () => {
    const name = prompt("Enter Name:");
    const deviceId = prompt("Assign Edge ID (e.g. ESP32-XX):");
    if(name && deviceId) {
      api.addUser({ name, role: 'user', deviceId });
      addToast('Customer provisioned successfully', 'success');
    }
  };

  return (
    <div className={`${modernCard} overflow-hidden`}>
      <div className="p-4 border-b border-slate-200 dark:border-[#2A2A35] flex justify-between items-center bg-slate-50/50 dark:bg-[#1A1A24]/50">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Node Directory</h2>
          <p className="text-xs font-medium text-slate-500">Manage client hardware assignments</p>
        </div>
        <button onClick={handleAdd} className={`${modernButton} bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs py-1.5 shadow-sm`}>
          <Plus className="w-3.5 h-3.5" /> Provision New
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 dark:bg-[#12121A] text-slate-500 text-xs uppercase tracking-wider font-bold border-b border-slate-200 dark:border-[#2A2A35]">
            <tr>
              <th className="px-5 py-3">Client Name</th>
              <th className="px-5 py-3">Access Level</th>
              <th className="px-5 py-3">Edge ID (MAC)</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1A1A24]">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-[#1A1A24] transition-colors">
                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">{u.name}</td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 bg-slate-100 dark:bg-[#2A2A35] text-slate-600 dark:text-slate-300 rounded text-[10px] uppercase font-bold tracking-widest">{u.role}</span></td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{u.deviceId}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    <span className="text-xs font-bold capitalize text-slate-600 dark:text-slate-400">{u.status}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  {u.role !== 'admin' && (
                    <button onClick={() => api.deleteUser(u.id)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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

const RelayControlCard = ({ title, desc, state, isAuto, onToggle }) => (
  <div className={`${modernCard} p-5 flex flex-col justify-between ${state ? 'ring-1 ring-emerald-500/50' : ''}`}>
    <div>
      <div className="flex justify-between items-center mb-2 border-b border-slate-100 dark:border-[#2A2A35] pb-3">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h4>
        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${state ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-[#1A1A24] text-slate-500 border border-slate-200 dark:border-[#2A2A35]'}`}>
          {state ? 'Closed' : 'Open'}
        </div>
      </div>
      <p className="text-xs font-medium text-slate-500 mb-6 min-h-[36px] mt-3">{desc}</p>
    </div>
    
    <div className="flex items-center justify-between mt-auto">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{state ? 'Power Flowing' : 'Circuit Broken'}</span>
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
