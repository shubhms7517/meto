import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onNetChange } from '../lib/netStatus';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { connectSocket } from '../services/socket';
import { getWallet, recoverPurchases } from '../services/wallet';
import { resetBillingAccount } from '../services/billing';
import LowBalanceSheet, { type RechargeRequest } from '../components/LowBalanceSheet';
import LevelUpModal from '../components/LevelUpModal';
import { navigationRef } from '../navigation/ref';

type WalletCtx = {
  balance: number | null;
  callRate: number; // Match ka rate (VIP ko kam)
  isVip: boolean;
  amHost: boolean; // main approved host hoon — user wale (gift / match / wallet) button chhupao
  hostRate: number; // host ka apna rate (wo user ko call kare to user itna dega)
  rateFor: (hostRate: number | null | undefined) => number; // host ke rate pe mujhe kitna padega (VIP chhoot)
  refresh: () => Promise<void>;
  setBalance: (n: number) => void;
  openRecharge: (req: RechargeRequest) => void; // "Gems kam" sheet
};

const Ctx = createContext<WalletCtx | null>(null);

// Gems balance poori app me (Discover chip, Me card, Wallet). Server badle to socket se turant update.
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [callRate, setCallRate] = useState(1000);
  const [isVip, setIsVip] = useState(false);
  const [vipPct, setVipPct] = useState(10);
  const [amHost, setAmHost] = useState(false);
  const [hostRate, setHostRate] = useState(1000);
  const [sheet, setSheet] = useState<RechargeRequest | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; reward: number } | null>(null);
  const openRecharge = useCallback((req: RechargeRequest) => setSheet(req), []);

  const refresh = useCallback(async () => {
    try {
      const w = await getWallet();
      setBalance(w.balance);
      setCallRate(w.callRate);
      setIsVip(w.isVip);
      if (w.vipCallDiscountPct != null) setVipPct(w.vipCallDiscountPct);
      setAmHost(!!w.isHost);
      if (w.hostRate) setHostRate(w.hostRate);
    } catch {}
  }, []);

  useEffect(() => {
    let off: (() => void) | null = null;
    const unsub = onAuthStateChanged(getAuth(), user => {
      off?.();
      off = null;
      if (!user) {
        setBalance(null);
        resetBillingAccount();
        return;
      }
      refresh();
      recoverPurchases(); // payment ke beech app band hui thi to bache gems / VIP
      const s = connectSocket();
      const onBal = (d: { balance: number }) => setBalance(d.balance);
      s.on('wallet:balance', onBal);
      s.on('level:up', setLevelUp);
      s.on('connect', refresh);
      off = () => {
        s.off('wallet:balance', onBal);
        s.off('level:up', setLevelUp);
        s.off('connect', refresh);
      };
    });
    // Server wapas aaya → balance + host/user dobara (offline me shuru hui app sahi interface pe aaye)
    const net = onNetChange(on => on && getAuth().currentUser && refresh());
    // App background se wapas aaye → taaza balance (beech me koi event chhoot gaya ho to)
    const app = AppState.addEventListener('change', st => {
      if (st === 'active' && getAuth().currentUser) refresh();
    });
    return () => {
      unsub();
      off?.();
      net();
      app.remove();
    };
  }, [refresh]);

  const rateFor = useCallback(
    (hostRate: number | null | undefined) => (hostRate ? (isVip ? Math.round((hostRate * (100 - vipPct)) / 100) : hostRate) : callRate),
    [isVip, vipPct, callRate],
  );

  return (
    <Ctx.Provider value={{ balance, callRate, isVip, amHost, hostRate, rateFor, refresh, setBalance, openRecharge }}>
      {children}
      {levelUp && <LevelUpModal level={levelUp.level} reward={levelUp.reward} onClose={() => setLevelUp(null)} />}
      {sheet && (
        <LowBalanceSheet
          {...sheet}
          balance={balance}
          onClose={() => setSheet(null)}
          onBalance={setBalance}
          onMorePacks={() => {
            setSheet(null);
            if (navigationRef.isReady()) navigationRef.navigate('Wallet');
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet must be inside WalletProvider');
  return v;
}
