

import React, { useState, useEffect, useMemo, createContext, useContext, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
type MarketType = 'forex' | 'crypto' | 'stocks' | 'synthetic_indices';
type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1';
type RiskTolerance = 'low' | 'medium' | 'high';
type MT5Server = 'Deriv-Server' | 'Deriv-Demo' | 'Deriv-Server-02';
type View = 'dashboard' | 'settings' | 'backtesting';

// Fix: Refactored to remove API key from settings and UI, per Gemini API guidelines.
// The API key must be sourced from `process.env.API_KEY`.
// Deriv API Key is also moved to environment variables for consistency and security.
interface Settings {
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  refreshInterval: number; // in seconds
  darkMode: boolean;
  riskTolerance: RiskTolerance;
  priorityIndicators: string;
  enableSentimentAnalysis: boolean;
  mt5Login: string;
  mt5Password: string;
  mt5Server: MT5Server;
  autoTradingEnabled: boolean;
  maxDailyLossPercentage: number;
  maxTradeRisk: number;
  tradeRiskType: 'percentage' | 'fixed';
  tradeFrequencyLimit: number; // trades per hour
}

interface Signal {
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  tp: number;
  sl: number;
  reason: string;
}

interface OpenPosition {
  id: number;
  symbol: string;
  signal: 'BUY' | 'SELL';
  openPrice: number;
  currentPrice: number;
  tp: number;
  sl: number;
  pnl: number;
}

type DerivStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
interface APIStatus {
  deepseek: 'idle' | 'fetching_sentiment' | 'analyzing' | 'error';
  deepseekMessage: string;
}

interface PriceDataPoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface BacktestResults {
    totalPnl: number;
    winRate: number;
    totalTrades: number;
    maxDrawdown: number;
    tradeLog: string[];
}


// --- ICONS ---
const ChartBarIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
);
const Cog6ToothIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m18 0h-1.5m-15 0a7.5 7.5 0 1115 0m-15 0H3m18 0h-1.5m-15 0a7.5 7.5 0 1115 0m-15 0H3m18 0h-1.5" />
    </svg>
);
const SunIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.95-4.243-1.591 1.591M5.25 12H3m4.243-4.95-1.591-1.591" /></svg>
);
const MoonIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.92-.99 6.752-2.648z" /></svg>
);
const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const XCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);
const SpinnerIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
);
const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
);
const LockClosedIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
);
const Bars3Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
);
const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);
const EyeSlashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243l-4.243-4.243" /></svg>
);
const ClockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);


// --- CONTEXT ---
interface AppContextType {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  saveSettings: () => void;
  mt5Status: 'disconnected' | 'connecting' | 'connected' | 'error';
  setMt5Status: React.Dispatch<React.SetStateAction<'disconnected' | 'connecting' | 'connected' | 'error'>>;
  derivStatus: DerivStatus;
  derivMessage: string;
}
const AppContext = createContext<AppContextType | undefined>(undefined);
const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};

// --- DERIV API (REWRITTEN FOR STABILITY AND CENTRALIZED CONNECTION) ---
const derivAPI = (() => {
    let websocket: WebSocket | null = null;
    let onTickCallback: ((tick: any) => void) | null = null;
    let activeSubscriptionId: string | null = null;
    let requestCounter = 1;
    const pendingRequests = new Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }>();
    let onStateChangeCallback: ((status: DerivStatus, message: string) => void) | null = null;
    
    let reconnectAttempts = 0;
    let reconnectTimeoutId: any = null;
    let isAuthenticated = false; 
    let intentionalDisconnect = false;

    const sendMessage = (message: object): Promise<any> => {
        if (websocket?.readyState !== WebSocket.OPEN) {
            return Promise.reject({ error: { message: 'WebSocket is not open.' } });
        }
        const req_id = requestCounter++;
        const promise = new Promise((resolve, reject) => {
            pendingRequests.set(req_id, { resolve, reject });
            setTimeout(() => {
                if (pendingRequests.has(req_id)) {
                    pendingRequests.delete(req_id);
                    reject({ error: { message: 'Request timed out.' } });
                }
            }, 10000);
        });
        websocket.send(JSON.stringify({ ...message, req_id }));
        return promise;
    };

    const disconnect = () => {
        intentionalDisconnect = true;
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
        reconnectAttempts = 0;
        activeSubscriptionId = null;
        onTickCallback = null;
        isAuthenticated = false;
        
        if (websocket) {
            websocket.onopen = null;
            websocket.onmessage = null;
            websocket.onclose = null;
            websocket.onerror = null;
            if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
                websocket.close();
            }
            websocket = null;
        }

        pendingRequests.forEach(p => p.reject({error: {message: 'Connection closing.'}}));
        pendingRequests.clear();
        requestCounter = 1;
        onStateChangeCallback?.('disconnected', 'Disconnected.');
    };
    
    const connect = (apiKey: string, onStateChange: (status: DerivStatus, message: string) => void) => {
        if (websocket) {
            disconnect();
        }
        intentionalDisconnect = false;
        onStateChangeCallback = onStateChange;

        onStateChangeCallback?.('connecting', 'Connecting to Deriv...');
        websocket = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

        websocket.onopen = async () => {
            try {
                onStateChangeCallback?.('connecting', 'Authenticating...');
                const response = await sendMessage({ authorize: apiKey });
                if (response.error) {
                     throw new Error(`Authorization failed: ${response.error.message}`);
                }
                if (!response.authorize?.scopes?.includes('read')) {
                    throw new Error("Authorization failed: Your API Key is missing the required 'Read' permissions.");
                }
                
                isAuthenticated = true;
                reconnectAttempts = 0;
                onStateChangeCallback?.('connected', 'Connection successful.');

            } catch (err: any) {
                isAuthenticated = false;
                const errorMessage = err?.error?.message || err.message || 'Authorization failed.';
                onStateChangeCallback?.('error', errorMessage);
                if (websocket) {
                    disconnect();
                }
            }
        };

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.req_id && pendingRequests.has(data.req_id)) {
                    const promise = pendingRequests.get(data.req_id);
                    if (data.error) promise?.reject(data);
                    else promise?.resolve(data);
                    pendingRequests.delete(data.req_id);
                } else if (data.msg_type === 'tick' && onTickCallback) {
                    onTickCallback(data.tick);
                } else if (data.msg_type === 'ping') {
                    sendMessage({ pong: 1 }).catch(() => {});
                }
            } catch(e) {
                // Ignore non-json messages
            }
        };

        websocket.onclose = () => {
            if (intentionalDisconnect) {
                return;
            }
            isAuthenticated = false;
            onStateChangeCallback?.('reconnecting', 'Connection lost. Retrying...');
            reconnectAttempts++;
            const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
            reconnectTimeoutId = setTimeout(() => connect(apiKey, onStateChange), delay);
        };

        websocket.onerror = () => {
            if (!intentionalDisconnect) {
                onStateChangeCallback?.('error', 'A WebSocket connection error occurred.');
            }
        };
    };

    return {
        connect,
        disconnect,
        validateMT5Login: async (login: string, server: string): Promise<{valid: boolean, error?: string}> => {
            if (!isAuthenticated) return { valid: false, error: 'Deriv API is not connected or authenticated.' };
            try {
                const response = await sendMessage({ trading_platform_accounts: 1, platform: 'mt5' });
                if (response.error) {
                    return { valid: false, error: `Validation failed: ${response.error.message}` };
                }
                const mt5Accounts = response.trading_platform_accounts?.filter((acc: any) => acc.platform === 'mt5') || [];
                const serverType = server.toLowerCase().includes('demo') ? 'demo' : 'real';
                const account = mt5Accounts.find((acc: any) => acc.account_id === login && acc.account_type === serverType);

                if (account) return { valid: true };
                
                return { valid: false, error: `MT5 Login '${login}' for ${serverType} server not found on this Deriv account.` };
            } catch (err: any) {
                return { valid: false, error: err?.error?.message || 'An unexpected error occurred during validation.'};
            }
        },
        fetchAvailableSymbols: async (marketType: MarketType): Promise<string[]> => {
            if (!isAuthenticated) throw new Error("Deriv API is not connected or authenticated.");
            const response = await sendMessage({ active_symbols: "brief", product_type: "basic" });
            if (response.error) throw new Error(response.error.message);

            const marketMap: { [key in MarketType]: string } = { synthetic_indices: 'synthetic_index', forex: 'forex', crypto: 'cryptocurrency', stocks: 'stock' };
            const targetMarket = marketMap[marketType];
            return response.active_symbols
                .filter((s: any) => s.market === targetMarket)
                .map((s: any) => s.symbol);
        },
        fetchMarketData: async (symbol: string, timeframe: Timeframe, options: {start?: number, end?: number} = {}): Promise<PriceDataPoint[]> => {
            const timeframeSeconds: { [key in Timeframe]: number } = { 'M1': 60, 'M5': 300, 'M15': 900, 'H1': 3600, 'H4': 14400, 'D1': 86400 };
            const request: any = { 
                ticks_history: symbol, 
                style: "candles", 
                granularity: timeframeSeconds[timeframe] 
            };

            if (options.start && options.end) {
                request.start = options.start;
                request.end = options.end;
            } else {
                request.end = "latest";
                request.count = 100;
            }

            const response = await sendMessage(request);
            if (response.error) throw new Error(response.error.message);
            return response.candles.map((c: any) => ({ time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close }));
        },
        subscribeToTicks: async (symbol: string, callback: (tick: any) => void) => {
            onTickCallback = callback;
            const response = await sendMessage({ ticks: symbol, subscribe: 1 });
            activeSubscriptionId = response.subscription.id;
        },
        unsubscribeFromTicks: () => {
          if (activeSubscriptionId && websocket?.readyState === WebSocket.OPEN) {
              sendMessage({ forget: activeSubscriptionId }).catch(() => {});
          }
          activeSubscriptionId = null;
          onTickCallback = null;
        }
    };
})();

// --- MOCK SENTIMENT API ---
const fetchMarketSentiment = async (symbol: string): Promise<{ sentiment: 'Bullish' | 'Bearish' | 'Neutral'; headlines: string[] }> => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const sentiments: Array<'Bullish' | 'Bearish' | 'Neutral'> = ['Bullish', 'Bearish', 'Neutral'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    const mockHeadlines = [
        `BREAKING: ${symbol} shows unexpected volatility after recent announcements.`,
        `Analysts predict a ${randomSentiment.toLowerCase()} trend for ${symbol} this week.`,
        `Social media buzz around ${symbol} is currently mixed.`,
    ];
    
    return {
        sentiment: randomSentiment,
        headlines: mockHeadlines,
    };
};

// --- CHART COMPONENT ---
const PriceChart = ({ data, currentPrice }: { data: PriceDataPoint[], currentPrice: number | null }) => {
    const chartData = useMemo(() => {
        if (!currentPrice || data.length === 0) return data;
        const lastCandle = {...data[data.length-1]};
        lastCandle.close = currentPrice;
        lastCandle.high = Math.max(lastCandle.high, currentPrice);
        lastCandle.low = Math.min(lastCandle.low, currentPrice);
        return [...data.slice(0, data.length-1), lastCandle];
    }, [data, currentPrice]);

    if (!chartData || chartData.length < 2) {
        return <div className="flex items-center justify-center h-full"><p className="text-slate-400 dark:text-slate-500">Awaiting market data...</p></div>;
    }

    const width = 800;
    const height = 400;
    const margin = { top: 20, right: 50, bottom: 30, left: 50 };
    const candleWidth = (width - margin.left - margin.right) / 100;

    const visibleData = chartData.slice(-100);
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    const getX = (index: number) => margin.left + index * candleWidth + candleWidth / 2;
    const getY = (price: number) => height - margin.bottom - ((price - minPrice) / (maxPrice - minPrice || 1)) * (height - margin.top - margin.bottom);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                {[...Array(5)].map((_, i) => {
                    const price = minPrice + (i / 4) * (maxPrice - minPrice);
                    const y = getY(price);
                    return(
                        <g key={i}>
                            <text x={width - margin.right + 4} y={y + 4} className="text-xs fill-current text-slate-400">{price.toFixed(5)}</text>
                            <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} strokeDasharray="2,2" className="stroke-current text-slate-200 dark:text-slate-700" />
                        </g>
                    )
                })}
                {visibleData.map((d, i) => {
                    const x = getX(i);
                    const isUp = d.close >= d.open;
                    return (
                        <g key={d.time}>
                            <line x1={x} y1={getY(d.high)} x2={x} y2={getY(d.low)} className={`stroke-current ${isUp ? 'text-emerald-500' : 'text-red-500'}`} strokeWidth="1.5" />
                            <rect x={x - candleWidth/2 + 1} y={getY(Math.max(d.open, d.close))} width={Math.max(1, candleWidth-2)} height={Math.max(1, Math.abs(getY(d.open) - getY(d.close)))} className={`fill-current ${isUp ? 'text-emerald-500' : 'text-red-500'}`} />
                        </g>
                    )
                })}
            </svg>
        </div>
    );
};

// --- UTILITY COMPONENTS ---
const ConfirmationDialog = ({ title, children, onConfirm, onCancel }: { title: string, children?: React.ReactNode, onConfirm: () => void, onCancel: () => void }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center animate-fade-in p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
            <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">{children}</div>
            <div className="mt-6 flex justify-end space-x-3">
                <button onClick={onCancel} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">Cancel</button>
                <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Confirm & Enable</button>
            </div>
        </div>
    </div>
);

// Fix: Made children prop optional to resolve TypeScript errors where it was not being detected.
const AccordionItem = ({ title, children, isOpen, onToggle }: { title: string, children?: React.ReactNode, isOpen: boolean, onToggle: () => void }) => (
    <div className="border-b border-slate-200 dark:border-slate-700">
        <button onClick={onToggle} className="flex justify-between items-center w-full py-4 text-left font-semibold text-lg text-slate-800 dark:text-slate-100">
            <span>{title}</span>
            <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="pb-4 animate-fade-in space-y-4">{children}</div>}
    </div>
);

const MT5StatusIndicator = ({ status }: { status: 'disconnected' | 'connecting' | 'connected' | 'error' }) => {
    const statusConfig = {
        disconnected: { color: 'bg-slate-400', text: 'Disconnected' },
        connecting: { color: 'bg-amber-500 animate-pulse', text: 'Connecting...' },
        connected: { color: 'bg-emerald-500', text: 'Validated' },
        error: { color: 'bg-red-500', text: 'Error' },
    };
    const { color, text } = statusConfig[status];

    return (
        <div className="flex items-center space-x-2">
            <span className={`h-2.5 w-2.5 rounded-full ${color}`}></span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{text}</span>
        </div>
    );
};

// --- SETTINGS VIEW ---
const SettingsView = () => {
    const { settings, setSettings, mt5Status, setMt5Status, saveSettings, derivStatus, derivMessage } = useAppContext();
    const [localSettings, setLocalSettings] = useState(settings);
    const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
    const [isFetchingSymbols, setIsFetchingSymbols] = useState(false);
    const [mt5Message, setMt5Message] = useState('Connect to your MT5 account to enable auto-trading.');
    const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'>('idle');
    const [isConfirmingAutoTrade, setIsConfirmingAutoTrade] = useState(false);
    const [openAccordion, setOpenAccordion] = useState<string | null>('api');
    const [symbolError, setSymbolError] = useState<string | null>(null);

    useEffect(() => {
        if (derivStatus === 'error') {
            setOpenAccordion('api');
        }
    }, [derivStatus]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const target = e.target as HTMLInputElement;

        let processedValue: any;
        if (type === 'checkbox') processedValue = target.checked;
        else if (type === 'number') processedValue = parseFloat(value) || 0;
        else if (name === 'mt5Login') processedValue = value.trim();
        else processedValue = value;
        
        setLocalSettings(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleAutoTradingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setIsConfirmingAutoTrade(true);
        else setLocalSettings(prev => ({...prev, autoTradingEnabled: false}));
    }

    useEffect(() => {
        if (derivStatus !== 'connected') {
            setAvailableSymbols([]);
            return;
        }

        let isMounted = true;
        const fetch = async () => {
            setIsFetchingSymbols(true);
            setSymbolError(null);
            try {
                const symbols = await derivAPI.fetchAvailableSymbols(localSettings.marketType);
                if (isMounted) {
                    setAvailableSymbols(symbols);
                    if (symbols.length > 0 && !symbols.includes(localSettings.symbol)) {
                        setLocalSettings(prev => ({ ...prev, symbol: symbols[0] }));
                    } else if (symbols.length === 0) {
                        setSymbolError(`No symbols found for market: ${localSettings.marketType}`);
                    }
                }
            } catch (e: any) {
                console.error("Failed to fetch symbols:", e);
                if (isMounted) setSymbolError(e.message || "Failed to fetch symbols.");
            } finally {
                if (isMounted) setIsFetchingSymbols(false);
            }
        };
        fetch();
        return () => { isMounted = false };
    }, [localSettings.marketType, derivStatus]);
    
    const handleConnectMT5 = async () => {
        if (derivStatus !== 'connected') {
            setMt5Status('error');
            setMt5Message('Deriv API is not connected. Please save a valid key first.');
            return;
        }
        setMt5Status('connecting'); setMt5Message('Validating MT5 account...');
        const { valid, error } = await derivAPI.validateMT5Login(localSettings.mt5Login, localSettings.mt5Server);
        if (valid) {
            setMt5Status('connected'); setMt5Message(`Successfully validated account ${localSettings.mt5Login}.`);
        } else {
            setMt5Status('error'); setMt5Message(error || 'Failed to validate.');
        }
    };

    const handleSave = () => {
        setSaveState('saving');
        setSettings(localSettings);
        saveSettings();
        setTimeout(() => {
            setSaveState('saved');
            setTimeout(() => setSaveState('idle'), 2000);
        }, 500);
    };

    const getMT5StatusColor = () => {
        switch(mt5Status) {
            case 'connected': return 'text-emerald-500';
            case 'error': return 'text-red-500';
            case 'connecting': return 'text-amber-500';
            default: return 'text-slate-500 dark:text-slate-400';
        }
    };
    
    const renderInput = (name: string, label: string, type: string = 'text', options: { [key:string]: any} = {}) => (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
            <input type={type} id={name} name={name} value={(localSettings as any)[name] || ''} onChange={handleInputChange} {...options} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm" />
        </div>
    );
    
    const renderSelect = (name: string, label: string, options: string[]) => (
        <div>
            <label htmlFor={name} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
            <select id={name} name={name} value={(localSettings as any)[name]} onChange={handleInputChange} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm">
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
            {isConfirmingAutoTrade && (
                <ConfirmationDialog title="Enable Auto-Trading?" onConfirm={() => { setLocalSettings(prev => ({...prev, autoTradingEnabled: true})); setIsConfirmingAutoTrade(false); }} onCancel={() => setIsConfirmingAutoTrade(false)}>
                    <p>Enabling auto-trading allows the AI to execute trades on your behalf based on its analysis. Please ensure you have reviewed your MT5 connection and understand the risks involved. You are responsible for all trades made by the system.</p>
                </ConfirmationDialog>
            )}
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Settings</h1>

             <AccordionItem title="API Credentials" isOpen={openAccordion === 'api'} onToggle={() => setOpenAccordion(openAccordion === 'api' ? null : 'api')}>
                <div>
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Deriv API for Market Data</h3>
                     <p className="text-sm text-slate-500 mt-1">
                        The Deriv API key is configured securely via an environment variable (`process.env.DERIV_API_KEY`) and does not need to be set here.
                    </p>
                    <div className="mt-2 flex items-center space-x-2 text-sm min-h-[20px]">
                        {derivStatus === 'connecting' && <><SpinnerIcon className="w-4 h-4 text-amber-500" /><span className="text-amber-500">Validating...</span></>}
                        {derivStatus === 'connected' && <><CheckCircleIcon className="w-5 h-5 text-emerald-500" /><span className="text-emerald-500">Connected &amp; Valid</span></>}
                        {derivStatus === 'error' && <><XCircleIcon className="w-5 h-5 text-red-500" /><span className="text-red-500">{derivMessage}</span></>}
                        {derivStatus === 'reconnecting' && <><SpinnerIcon className="w-4 h-4 text-amber-500" /><span className="text-amber-500">Reconnecting...</span></>}
                        {derivStatus === 'disconnected' && <><XCircleIcon className="w-5 h-5 text-slate-500" /><span className="text-slate-500">Disconnected</span></>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Required for market data. Must have 'Read' permissions.</p>
                </div>
                <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Gemini API for AI Analysis</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        AI analysis is powered by the Gemini API. The API key is configured securely via an environment variable (`process.env.API_KEY`) and does not need to be set here.
                    </p>
                </div>
            </AccordionItem>
            
            <AccordionItem title="Market & Analysis" isOpen={openAccordion === 'market'} onToggle={() => setOpenAccordion(openAccordion === 'market' ? null : 'market')}>
                {renderSelect('marketType', 'Market Type', ['synthetic_indices', 'forex', 'crypto', 'stocks'])}
                <div>
                    <label htmlFor="symbol" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Symbol</label>
                    <div className="flex items-center space-x-2">
                        <select id="symbol" name="symbol" value={localSettings.symbol} onChange={handleInputChange} disabled={availableSymbols.length === 0 || isFetchingSymbols || derivStatus !== 'connected'} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm disabled:opacity-50">
                            {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {isFetchingSymbols && <SpinnerIcon className="w-5 h-5 text-sky-500" />}
                    </div>
                     {derivStatus !== 'connected' && <p className="text-xs text-slate-500 mt-1">A valid Deriv API connection is required to fetch symbols.</p>}
                     {symbolError && <p className="text-xs text-red-500 mt-1">{symbolError}</p>}
                </div>
                {renderSelect('timeframe', 'Timeframe', ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'])}
                {renderInput('priorityIndicators', 'Priority Technical Indicators', 'text', { placeholder: 'e.g., RSI, MACD, EMA' })}
                <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input type="checkbox" name="enableSentimentAnalysis" checked={localSettings.enableSentimentAnalysis} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Sentiment Analysis</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1">Enriches AI analysis with simulated market news and social media sentiment.</p>
                 </div>
            </AccordionItem>

            <AccordionItem title="MT5 & Auto-Trading" isOpen={openAccordion === 'mt5'} onToggle={() => setOpenAccordion(openAccordion === 'mt5' ? null : 'mt5')}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderInput('mt5Login', 'MT5 Login ID')}
                    {renderInput('mt5Password', 'MT5 Password', 'password')}
                    {renderSelect('mt5Server', 'MT5 Server', ['Deriv-Demo', 'Deriv-Server', 'Deriv-Server-02'])}
                 </div>
                 <div className="p-3 my-2 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <p className="text-xs text-sky-800 dark:text-sky-200">
                        <b>Important:</b> The MT5 Login ID must belong to the same Deriv account that your API Key was created for. This process validates the account's existence, not the password.
                    </p>
                 </div>
                 <div className="flex flex-wrap items-center gap-4">
                    <button onClick={handleConnectMT5} disabled={mt5Status === 'connecting' || derivStatus !== 'connected'} className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {mt5Status === 'connecting' ? 'Validating...' : 'Validate Account'}
                    </button>
                    <MT5StatusIndicator status={mt5Status} />
                 </div>
                 <p className={`mt-2 text-sm ${getMT5StatusColor()}`}>{mt5Message}</p>

                 <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <input type="checkbox" name="autoTradingEnabled" checked={localSettings.autoTradingEnabled} onChange={handleAutoTradingChange} className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Auto-Trading</span>
                    </label>
                 </div>
                 {localSettings.autoTradingEnabled && (
                    <div className="mt-4 space-y-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-md animate-fade-in">
                        <h4 className="font-semibold">Risk Management</h4>
                        {renderInput('maxDailyLossPercentage', 'Max Daily Loss (%)', 'number', { min: 0, max: 100, step: 1 })}
                        <div className="flex items-end space-x-2">
                           {renderInput('maxTradeRisk', 'Max Risk Per Trade', 'number', { min: 0, step: 0.1 })}
                           {renderSelect('tradeRiskType', '', ['percentage', 'fixed'])}
                        </div>
                        {renderInput('tradeFrequencyLimit', 'Trade Frequency Limit (trades/hour)', 'number', { min: 0, step: 1 })}
                    </div>
                 )}
            </AccordionItem>
            
            <div className="pt-5">
                <div className="flex justify-end">
                    <button onClick={handleSave} className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors flex items-center disabled:opacity-50" disabled={saveState === 'saving' || saveState === 'saved'}>
                        {saveState === 'saving' && <><SpinnerIcon className="w-5 h-5 mr-2" /> Saving...</>}
                        {saveState === 'saved' && <>Saved!</>}
                        {saveState === 'idle' && <>Save Settings</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- DASHBOARD VIEW ---
const DashboardView = ({ handleAnalyze, apiStatus, signal, marketData, currentPrice, tradeLog, openPositions, setView }: { handleAnalyze: () => void, apiStatus: APIStatus, signal: Signal | null, marketData: PriceDataPoint[], currentPrice: number | null, tradeLog: string[], openPositions: OpenPosition[], setView: (v: View) => void }) => {
    const { settings, derivStatus, derivMessage } = useAppContext();

    if (derivStatus !== 'connected') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
                {derivStatus === 'connecting' || derivStatus === 'reconnecting' ? (
                    <>
                        <SpinnerIcon className="w-16 h-16 text-sky-500 mb-4" />
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{derivMessage}</h2>
                    </>
                ) : (
                    <>
                         <XCircleIcon className="w-16 h-16 text-red-500 mb-4" />
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Connection Error</h2>
                        <p className="mt-2 text-slate-600 dark:text-slate-400 max-w-md">{derivMessage}</p>
                        <button onClick={() => setView('settings')} className="mt-6 px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg shadow-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all">
                            Check Settings
                        </button>
                    </>
                )}
            </div>
        )
    }

    const getSignalColor = (s: 'BUY' | 'SELL' | 'NEUTRAL') => s === 'BUY' ? 'text-emerald-500' : s === 'SELL' ? 'text-red-500' : 'text-slate-500';
    
    const getAiStatusText = () => {
        switch(apiStatus.deepseek) {
            case 'idle': return 'Ready';
            case 'fetching_sentiment': return 'Fetching Sentiment...';
            case 'analyzing': return 'Analyzing...';
            case 'error': return 'Error';
            default: return 'Idle';
        }
    }

    const getAnalysisButtonText = () => {
        switch(apiStatus.deepseek) {
            case 'fetching_sentiment': return <><SpinnerIcon className="w-5 h-5 mr-2" />Fetching...</>;
            case 'analyzing': return <><SpinnerIcon className="w-5 h-5 mr-2" />Analyzing...</>;
            default: return 'Analyze Market';
        }
    }

    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Deriv API Status</h3>
                <p className="text-lg font-semibold text-emerald-500 flex items-center"><CheckCircleIcon className="w-5 h-5 mr-2" /> Connected</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">AI Status</h3>
                <p className={`text-lg font-semibold ${apiStatus.deepseek === 'error' ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>{getAiStatusText()}</p>
            </div>
             <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Current Market</h3>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-200 truncate">{settings.symbol}</p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 xl:col-span-4 bg-white dark:bg-slate-800 rounded-lg shadow p-2 sm:p-4">
                <div className="h-96">
                    <PriceChart data={marketData} currentPrice={currentPrice} />
                </div>
            </div>
            <div className="lg:col-span-2 xl:col-span-1 space-y-6">
                 <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
                     <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">AI Analysis</h2>
                     {/* Fix: Removed dependency on deepseekApiKey from settings, assuming API key is always available from environment. */}
                     <button onClick={handleAnalyze} disabled={apiStatus.deepseek !== 'idle'} className="w-full px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg shadow-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                        {getAnalysisButtonText()}
                     </button>
                     <div className="mt-4">
                        {apiStatus.deepseek === 'error' && <p className="text-red-500 text-sm">{apiStatus.deepseekMessage}</p>}
                        {apiStatus.deepseek === 'idle' && !signal && <p className="text-slate-500 text-sm text-center py-8">Click "Analyze Market" to get a signal.</p>}
                        {apiStatus.deepseek === 'idle' && signal && (
                            <div className="space-y-3 animate-fade-in">
                                <p className={`text-4xl font-bold text-center ${getSignalColor(signal.signal)}`}>{signal.signal}</p>
                                <p className="text-center text-slate-500 dark:text-slate-400">Confidence: {signal.confidence}%</p>
                                <div className="text-sm space-y-1 pt-2">
                                    <div><span className="font-semibold text-slate-600 dark:text-slate-300">Take Profit:</span> {signal.tp}</div>
                                    <div><span className="font-semibold text-slate-600 dark:text-slate-300">Stop Loss:</span> {signal.sl}</div>
                                    <p className="text-slate-600 dark:text-slate-400 italic pt-1">"{signal.reason}"</p>
                                </div>
                            </div>
                        )}
                     </div>
                 </div>
                 <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
                     <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Trade Terminal</h2>
                     <div className="space-y-2">
                        <h3 className="font-semibold text-sm">Open Positions</h3>
                        {openPositions.length === 0 ? <p className="text-xs text-slate-500">No open positions.</p> : (
                             <div className="text-xs space-y-1">
                                {openPositions.map(p => (
                                    <div key={p.id} className="grid grid-cols-3 items-center">
                                        <span className={`${getSignalColor(p.signal)} font-bold col-span-1`}>{p.signal}</span>
                                        <span className="text-slate-600 dark:text-slate-300 col-span-1 text-center">@ {p.openPrice}</span>
                                        <span className={`col-span-1 text-right font-mono ${p.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{p.pnl.toFixed(5)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                     </div>
                     <div className="mt-4 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold text-sm">Logs</h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 h-24 overflow-y-auto font-mono mt-1 space-y-1">
                            {tradeLog.map((log, i) => <p key={i} className="whitespace-pre-wrap">{log}</p>)}
                        </div>
                     </div>
                 </div>
            </div>
        </div>
      </div>
    );
};

// --- BACKTESTING VIEW ---
const BacktestingView = ({ handleRunBacktest, backtestStatus, backtestResults, backtestError, backtestProgress }: { handleRunBacktest: (options: any) => void, backtestStatus: 'idle' | 'fetching' | 'running' | 'complete' | 'error', backtestResults: BacktestResults | null, backtestError: string | null, backtestProgress: number }) => {
    const { settings, derivStatus } = useAppContext();
    const [backtestSettings, setBacktestSettings] = useState({
        marketType: settings.marketType,
        symbol: settings.symbol,
        timeframe: settings.timeframe,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
    });
    const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
    const [isFetchingSymbols, setIsFetchingSymbols] = useState(false);

    useEffect(() => {
        if (derivStatus !== 'connected') {
            setAvailableSymbols([]);
            return;
        }
        let isMounted = true;
        const fetch = async () => {
            setIsFetchingSymbols(true);
            try {
                const symbols = await derivAPI.fetchAvailableSymbols(backtestSettings.marketType);
                if (isMounted) {
                    setAvailableSymbols(symbols);
                    if (symbols.length > 0 && !symbols.includes(backtestSettings.symbol)) {
                         setBacktestSettings(prev => ({ ...prev, symbol: symbols[0] }));
                    }
                }
            } catch (e) { console.error(e) } 
            finally { if (isMounted) setIsFetchingSymbols(false); }
        };
        fetch();
        return () => { isMounted = false };
    }, [backtestSettings.marketType, derivStatus]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setBacktestSettings(prev => ({ ...prev, [name]: value }));
    };

    const runTest = () => {
        handleRunBacktest(backtestSettings);
    }
    
    const renderMetricCard = (label: string, value: string, color: string = 'text-slate-800 dark:text-slate-100') => (
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</h4>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
    );

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
             <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Strategy Backtesting</h1>
             
             <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md space-y-4">
                <h2 className="text-xl font-semibold">Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Market</label>
                        <select name="marketType" value={backtestSettings.marketType} onChange={handleInputChange} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm">
                            {['synthetic_indices', 'forex', 'crypto', 'stocks'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Symbol</label>
                        <select name="symbol" value={backtestSettings.symbol} onChange={handleInputChange} disabled={isFetchingSymbols || availableSymbols.length === 0} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm disabled:opacity-50">
                            {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Timeframe</label>
                        <select name="timeframe" value={backtestSettings.timeframe} onChange={handleInputChange} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm">
                            {['M1', 'M5', 'M15', 'H1', 'H4', 'D1'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start Date</label>
                        <input type="date" name="startDate" value={backtestSettings.startDate} onChange={handleInputChange} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">End Date</label>
                        <input type="date" name="endDate" value={backtestSettings.endDate} onChange={handleInputChange} className="mt-1 block w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 focus:ring-offset-sky-300 dark:focus:ring-offset-sky-500 sm:text-sm" />
                    </div>
                </div>
                 <button onClick={runTest} disabled={derivStatus !== 'connected' || backtestStatus === 'fetching' || backtestStatus === 'running'} className="w-full px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg shadow-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                    {backtestStatus === 'fetching' ? <><SpinnerIcon className="w-5 h-5 mr-2"/> Fetching Data...</> : backtestStatus === 'running' ? <><SpinnerIcon className="w-5 h-5 mr-2"/> Running Simulation...</> : 'Run Backtest'}
                 </button>
                 {derivStatus !== 'connected' && <p className="text-center text-sm text-amber-600 dark:text-amber-400">Please connect to the Deriv API in Settings to run a backtest.</p>}
             </div>
             
             {backtestStatus === 'running' && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                    <div className="bg-sky-600 h-2.5 rounded-full" style={{ width: `${backtestProgress}%`, transition: 'width 0.5s ease-in-out' }}></div>
                </div>
             )}

             {backtestStatus === 'error' && (
                <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{backtestError}</span>
                </div>
             )}

             {backtestStatus === 'complete' && backtestResults && (
                <div className="space-y-6 animate-fade-in">
                    <h2 className="text-xl font-semibold">Backtest Results</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {renderMetricCard('Total P/L', `${backtestResults.totalPnl.toFixed(2)}`, backtestResults.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500')}
                        {renderMetricCard('Win Rate', `${backtestResults.winRate.toFixed(2)}%`)}
                        {renderMetricCard('Total Trades', `${backtestResults.totalTrades}`)}
                        {renderMetricCard('Max Drawdown', `${backtestResults.maxDrawdown.toFixed(2)}%`, 'text-red-500')}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-2">Trade Log</h3>
                         <div className="text-xs text-slate-500 dark:text-slate-400 h-64 overflow-y-auto font-mono mt-1 space-y-1 p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
                            {backtestResults.tradeLog.map((log, i) => <p key={i} className="whitespace-pre-wrap">{log}</p>)}
                        </div>
                    </div>
                </div>
             )}
        </div>
    );
}

// --- MAIN APP COMPONENT ---
export default function App() {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('deepseekSignalSettings');
        const savedSettings = saved ? JSON.parse(saved) : {};
        // Fix: Removed derivApiKey and deepseekApiKey from initial settings state.
        return {
            marketType: 'synthetic_indices',
            symbol: 'volidx_10_1s', timeframe: 'M1', refreshInterval: 5, darkMode: false,
            riskTolerance: 'medium', priorityIndicators: 'RSI, MACD', enableSentimentAnalysis: false,
            mt5Login: '', mt5Password: '', mt5Server: 'Deriv-Demo', autoTradingEnabled: false,
            maxDailyLossPercentage: 2, maxTradeRisk: 1, tradeRiskType: 'percentage', tradeFrequencyLimit: 10,
            ...savedSettings,
        };
    });
    const [view, setView] = useState<View>('dashboard');
    const [mt5Status, setMt5Status] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [derivStatus, setDerivStatus] = useState<DerivStatus>('disconnected');
    const [derivMessage, setDerivMessage] = useState('Connecting...');
    const [apiStatus, setApiStatus] = useState<APIStatus>({ deepseek: 'idle', deepseekMessage: '' });
    const [marketData, setMarketData] = useState<PriceDataPoint[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [signal, setSignal] = useState<Signal | null>(null);
    const [tradeLog, setTradeLog] = useState<string[]>([]);
    const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [backtestStatus, setBacktestStatus] = useState<'idle' | 'fetching' | 'running' | 'complete' | 'error'>('idle');
    const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
    const [backtestError, setBacktestError] = useState<string | null>(null);
    const [backtestProgress, setBacktestProgress] = useState(0);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', settings.darkMode);
    }, [settings.darkMode]);

    const saveSettings = () => {
        localStorage.setItem('deepseekSignalSettings', JSON.stringify(settings));
    };

    useEffect(() => {
        const derivApiKey = process.env.DERIV_API_KEY;
        if (derivApiKey) {
            derivAPI.connect(derivApiKey, (status, message) => {
                setDerivStatus(status);
                setDerivMessage(message);
            });
        } else {
            setDerivStatus('error');
            setDerivMessage("Deriv API Key is not configured. Please set `process.env.DERIV_API_KEY`.");
            derivAPI.disconnect();
        }
        return () => { derivAPI.disconnect(); };
    }, []);

    useEffect(() => {
        if (derivStatus !== 'connected' || !settings.symbol) {
            setMarketData([]);
            setCurrentPrice(null);
            return;
        };

        let isMounted = true;
        const fetchData = async () => {
            try {
                const data = await derivAPI.fetchMarketData(settings.symbol, settings.timeframe);
                if(isMounted) {
                    setMarketData(data);
                    derivAPI.unsubscribeFromTicks();
                    derivAPI.subscribeToTicks(settings.symbol, (tick) => {
                        if (isMounted) setCurrentPrice(tick.quote);
                    });
                }
            } catch (e: any) {
                console.error("Failed to fetch market data:", e);
                if (isMounted) {
                    setDerivStatus('error');
                    setDerivMessage(e.message || 'Failed to load market data for the selected symbol.');
                }
            }
        };
        
        fetchData();

        return () => { 
            isMounted = false; 
            derivAPI.unsubscribeFromTicks(); 
        };
    }, [derivStatus, settings.symbol, settings.timeframe]);

    useEffect(() => {
        if (!currentPrice) return;
        setOpenPositions(prev => prev.map(p => {
            const pnl = p.signal === 'BUY' ? (currentPrice - p.openPrice) : (p.openPrice - currentPrice);
            return {...p, currentPrice, pnl };
        }));
    }, [currentPrice]);


    const handleAnalyze = async () => {
        if (marketData.length === 0) {
             setApiStatus({deepseek: 'error', deepseekMessage: 'Market data is not available for analysis.'});
            return;
        }

        let sentimentData = null;
        if (settings.enableSentimentAnalysis) {
            setApiStatus({ deepseek: 'fetching_sentiment', deepseekMessage: 'Fetching market sentiment...' });
            try {
                sentimentData = await fetchMarketSentiment(settings.symbol);
            } catch (error: any) {
                setApiStatus({ deepseek: 'error', deepseekMessage: 'Failed to fetch sentiment: ' + error.message });
                return;
            }
        }

        setApiStatus({ deepseek: 'analyzing', deepseekMessage: 'Analyzing market...' });

        try {
            // Fix: Per Gemini API guidelines, initialize with API key from environment variables.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const candleDataString = marketData.slice(-20).map(c => `O: ${c.open}, H: ${c.high}, L: ${c.low}, C: ${c.close}`).join('; ');
            
            const sentimentPromptSection = sentimentData
            ? `
            Recent Market Sentiment Analysis:
            Overall Sentiment: ${sentimentData.sentiment}
            Recent Headlines:
            - ${sentimentData.headlines.join('\n- ')}
            `
            : '';

            const prompt = `
                Analyze the following recent candle data for ${settings.symbol} on the ${settings.timeframe} timeframe.
                Technical Data: ${candleDataString}
                Current Price: ${currentPrice}
                Indicators to prioritize: ${settings.priorityIndicators}.
                User risk tolerance is ${settings.riskTolerance}.
                ${sentimentPromptSection}
                Based on ALL available data (technical and sentiment), provide a trading signal (BUY, SELL, or NEUTRAL).
                Calculate a confident Take Profit (TP) and Stop Loss (SL) level.
                Provide a brief reason for your decision based on the combined analysis.
                Respond in JSON format: {"signal": "BUY"|"SELL"|"NEUTRAL", "confidence": number, "tp": number, "sl": number, "reason": "string"}
            `;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            const text = response.text;
            const parsedSignal: Signal = JSON.parse(text.replace(/```json|```/g, '').trim());
            setSignal(parsedSignal);
            setApiStatus({ deepseek: 'idle', deepseekMessage: 'Analysis complete.' });
        } catch (error: any) {
            console.error("AI Analysis Error:", error);
            setApiStatus({ deepseek: 'error', deepseekMessage: error.message || 'Failed to get analysis from AI.' });
        }
    };

    const handleRunBacktest = async (options: { symbol: string, timeframe: Timeframe, startDate: string, endDate: string }) => {
        setBacktestStatus('fetching');
        setBacktestResults(null);
        setBacktestError(null);
        setBacktestProgress(0);

        try {
            const start = Math.floor(new Date(options.startDate).getTime() / 1000);
            const end = Math.floor(new Date(options.endDate).getTime() / 1000);
            const data = await derivAPI.fetchMarketData(options.symbol, options.timeframe, { start, end });
            
            if (data.length < 21) {
                throw new Error("Not enough historical data for the selected range. Please choose a wider date range.");
            }

            setBacktestStatus('running');
            
            // Fix: Per Gemini API guidelines, initialize with API key from environment variables.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            let balance = 10000;
            const balanceHistory = [10000];
            let peakBalance = 10000;
            let maxDrawdown = 0;
            const closedTrades: any[] = [];
            let openPosition: any = null;
            const log: string[] = [`Starting backtest with balance: $10,000`];
            
            for (let i = 20; i < data.length; i++) {
                const currentCandle = data[i];
                const contextData = data.slice(i - 20, i);

                // Check for TP/SL hit
                if(openPosition) {
                    let pnl = 0;
                    let closed = false;
                    if(openPosition.direction === 'BUY') {
                        if (currentCandle.high >= openPosition.tp) { pnl = openPosition.tp - openPosition.price; closed = true; }
                        else if (currentCandle.low <= openPosition.sl) { pnl = openPosition.sl - openPosition.price; closed = true; }
                    } else { // SELL
                        if (currentCandle.low <= openPosition.tp) { pnl = openPosition.price - openPosition.tp; closed = true; }
                        else if (currentCandle.high >= openPosition.sl) { pnl = openPosition.price - openPosition.sl; closed = true; }
                    }

                    if(closed) {
                        balance += pnl * 100; // Simplified P/L
                        balanceHistory.push(balance);
                        if(balance > peakBalance) peakBalance = balance;
                        const drawdown = ((peakBalance - balance) / peakBalance) * 100;
                        if(drawdown > maxDrawdown) maxDrawdown = drawdown;

                        closedTrades.push({ ...openPosition, pnl: pnl * 100, result: pnl >= 0 ? 'WIN' : 'LOSS' });
                        log.push(`Closed ${openPosition.direction} at ${pnl >= 0 ? openPosition.tp : openPosition.sl}. P/L: $${(pnl*100).toFixed(2)}. Balance: $${balance.toFixed(2)}`);
                        openPosition = null;
                    }
                }
                
                // Only make a decision if there is no open position
                if(!openPosition) {
                    const candleDataString = contextData.map(c => `O:${c.open},H:${c.high},L:${c.low},C:${c.close}`).join('; ');
                    const prompt = `Analyze: ${candleDataString} for ${options.symbol}. Risk is ${settings.riskTolerance}. Respond in JSON: {"signal": "BUY"|"SELL"|"NEUTRAL", "confidence": number, "tp": number, "sl": number, "reason": "string"}`;
                    const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
                    const text = response.text;
                    const parsedSignal: Signal = JSON.parse(text.replace(/```json|```/g, '').trim());

                    if (parsedSignal.signal !== 'NEUTRAL' && parsedSignal.confidence > 50) {
                        openPosition = { direction: parsedSignal.signal, price: currentCandle.close, tp: parsedSignal.tp, sl: parsedSignal.sl };
                        log.push(`Opened ${openPosition.direction} @ ${openPosition.price} | TP: ${openPosition.tp}, SL: ${openPosition.sl}`);
                    }
                }
                setBacktestProgress(Math.round((i / data.length) * 100));
            }

            const wins = closedTrades.filter(t => t.result === 'WIN').length;
            const winRate = (wins / closedTrades.length) * 100 || 0;
            const totalPnl = balance - 10000;

            setBacktestResults({
                totalPnl,
                winRate,
                totalTrades: closedTrades.length,
                maxDrawdown,
                tradeLog: log
            });
            setBacktestStatus('complete');

        } catch (e: any) {
            console.error("Backtest Error:", e);
            setBacktestError(e.message || 'An unexpected error occurred during the backtest.');
            setBacktestStatus('error');
        }
    };
    
    const appContextValue = { settings, setSettings, mt5Status, setMt5Status, saveSettings, derivStatus, derivMessage };

    const renderCurrentView = () => {
        switch (view) {
            case 'settings':
                return <SettingsView />;
            case 'backtesting':
                return <BacktestingView handleRunBacktest={handleRunBacktest} backtestStatus={backtestStatus} backtestResults={backtestResults} backtestError={backtestError} backtestProgress={backtestProgress} />;
            case 'dashboard':
            default:
                return (
                    <DashboardView 
                        handleAnalyze={handleAnalyze} 
                        apiStatus={apiStatus} 
                        signal={signal} 
                        marketData={marketData} 
                        currentPrice={currentPrice} 
                        tradeLog={tradeLog} 
                        openPositions={openPositions} 
                        setView={setView} 
                    />
                );
        }
    }

    return (
        <AppContext.Provider value={appContextValue}>
            <div className={`flex h-screen font-sans bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200`}>
                {/* Sidebar for larger screens */}
                <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex-col hidden lg:flex">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                        <h1 className="text-xl font-bold text-sky-600 dark:text-sky-400">DeepSeek Signal</h1>
                    </div>
                    <nav className="flex-1 p-4 space-y-2">
                        <button onClick={() => setView('dashboard')} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'dashboard' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <ChartBarIcon className="w-6 h-6" />
                            <span>Dashboard</span>
                        </button>
                         <button onClick={() => setView('backtesting')} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'backtesting' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <ClockIcon className="w-6 h-6" />
                            <span>Backtesting</span>
                        </button>
                        <button onClick={() => setView('settings')} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'settings' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <Cog6ToothIcon className="w-6 h-6" />
                            <span>Settings</span>
                        </button>
                    </nav>
                </aside>

                 {/* Mobile Sidebar */}
                <div className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'bg-black/60' : 'bg-transparent pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>
                <aside className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                        <h1 className="text-xl font-bold text-sky-600 dark:text-sky-400">DeepSeek Signal</h1>
                    </div>
                    <nav className="flex-1 p-4 space-y-2">
                        <button onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'dashboard' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <ChartBarIcon className="w-6 h-6" />
                            <span>Dashboard</span>
                        </button>
                        <button onClick={() => { setView('backtesting'); setIsSidebarOpen(false); }} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'backtesting' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <ClockIcon className="w-6 h-6" />
                            <span>Backtesting</span>
                        </button>
                        <button onClick={() => { setView('settings'); setIsSidebarOpen(false); }} className={`flex items-center space-x-3 p-2 rounded-lg w-full text-left transition-colors ${view === 'settings' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            <Cog6ToothIcon className="w-6 h-6" />
                            <span>Settings</span>
                        </button>
                    </nav>
                </aside>

                <div className="flex-1 flex flex-col">
                    <header className="flex items-center justify-between lg:justify-end p-4 bg-white dark:bg-slate-800/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                        <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Bars3Icon className="w-6 h-6" />
                        </button>
                        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 lg:hidden">{view.charAt(0).toUpperCase() + view.slice(1)}</h1>
                        <button onClick={() => setSettings(s => ({ ...s, darkMode: !s.darkMode }))} className="flex items-center space-x-2 p-2 rounded-full text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                           {settings.darkMode ? <SunIcon className="w-6 h-6 text-amber-400" /> : <MoonIcon className="w-6 h-6 text-slate-500" />}
                        </button>
                    </header>
                    <main className="flex-1 overflow-y-auto">
                        {renderCurrentView()}
                    </main>
                </div>
            </div>
        </AppContext.Provider>
    );
}