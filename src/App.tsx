import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "@/src/lib/motion-stub";
import { Bell, Plus, LayoutDashboard, List, LogOut, Search, Filter, Camera, X, ChevronDown, ChevronLeft, ChevronRight, Settings, Trash2, Menu, Edit2, AlertCircle, Download, Paperclip, User as UserIcon, Check, Sun, Moon, Calendar, Wallet, Repeat } from "lucide-react";
import { cn, formatCurrency } from "@/src/lib/utils";
import { User, Expense, Bill } from "@/src/types";
import { supabase } from "@/src/lib/supabase";
import * as db from "@/src/lib/db";
import type { Category } from "@/src/lib/db";
import { queueExpense, flushQueue, saveSnapshot, loadSnapshot, getQueuedAsExpenses, saveCachedProfile, loadCachedProfile } from "@/src/lib/offline";

const INITIAL_CATEGORIES: Category[] = [
  { name: "Alimentação", color: "#f87171", initials: "AL" },
  { name: "Transporte", color: "#60a5fa", initials: "TR" },
  { name: "Escritório", color: "#c084fc", initials: "ES" },
  { name: "Assinaturas", color: "#4ade80", initials: "AS" },
  { name: "Outros", color: "#94a3b8", initials: "OU" },
];

// --- Shared Glass Components ---

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

const GlassCard = ({ children, className, delay = 0 }: GlassCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, delay }}
    className={cn("glass-card", className)}
  >
    {children}
  </motion.div>
);

// Trava o scroll do body enquanto um modal está aberto.
// position:fixed é a única técnica confiável no iOS Safari — overflow:hidden não basta.
const useLockBodyScroll = (locked: boolean) => {
  useEffect(() => {
    if (!locked) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.overflow = 'hidden';
    return () => {
      style.position = '';
      style.top = '';
      style.left = '';
      style.right = '';
      style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
};

// --- Category Settings Modal ---

const CategorySettingsModal = ({
  isOpen,
  onClose,
  categories,
  onAdd,
  onDelete,
  onEdit,
  onColorChange,
}: {
  isOpen: boolean,
  onClose: () => void,
  categories: Category[],
  onAdd: (name: string) => void,
  onDelete: (name: string) => void,
  onEdit: (oldName: string, newName: string) => void,
  onColorChange: (name: string, color: string) => void,
}) => {
  const [newCatName, setNewCatName] = useState("");
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [tempEditName, setTempEditName] = useState("");
  const [catToDelete, setCatToDelete] = useState<string | null>(null);

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newCatName.trim()) return;
    onAdd(newCatName);
    setNewCatName("");
  };

  const handleStartEdit = (catName: string) => {
    setEditingCatName(catName);
    setTempEditName(catName);
  };

  const handleSaveEdit = () => {
    if (editingCatName && tempEditName.trim() && editingCatName !== tempEditName.trim()) {
      onEdit(editingCatName, tempEditName.trim());
    }
    setEditingCatName(null);
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-md z-[200]"
      />
      <div
        className="fixed inset-4 m-auto max-w-sm h-fit max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain scrollbar-none surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10"
      >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black tracking-tight">Categorias</h2>
              <button 
                onClick={() => {
                  setEditingCatName(null);
                  onClose();
                }} 
                className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="space-y-3 mb-8 max-h-[350px] overflow-y-auto pr-2 scrollbar-none">
              {categories.map((cat, idx) => (
                <div key={idx} className="group relative">
                  <div className={cn(
                    "flex items-center justify-between p-4 glass rounded-[24px] border border-transparent transition-all",
                    editingCatName === cat.name && "border-blue-500/30 bg-blue-500/5 shadow-lg shadow-blue-500/10"
                  )}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <label
                        className="relative w-4 h-4 rounded-full shrink-0 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                        style={{ backgroundColor: cat.color, color: cat.color, boxShadow: `0 0 10px ${cat.color}, 0 0 2px ${cat.color}` }}
                        title="Escolher cor"
                      >
                        <input
                          type="color"
                          value={cat.color}
                          onChange={(e) => onColorChange(cat.name, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </label>
                      
                      {editingCatName === cat.name ? (
                        <input 
                          autoFocus
                          value={tempEditName}
                          onChange={(e) => setTempEditName(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          className="bg-transparent outline-none font-bold text-base text-white w-full"
                        />
                      ) : (
                        <span className="text-sm font-bold truncate">{cat.name}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleStartEdit(cat.name)}
                        className="p-2 text-white/20 hover:text-blue-400 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setCatToDelete(cat.name)}
                        className="p-2 text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Nova Categoria</p>
              <div className="flex gap-2">
                <input 
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="Nome da categoria..."
                  className="flex-1 h-14 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 transition-colors text-base font-bold placeholder:text-white/5"
                />
                <button 
                  onClick={handleAdd}
                  className="w-14 h-14 btn-gradient rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          <ConfirmationModal 
            isOpen={!!catToDelete}
            onClose={() => setCatToDelete(null)}
            onConfirm={() => {
              onDelete(catToDelete!);
              setCatToDelete(null);
            }}
            title="Excluir Categoria?"
            message={`Tem certeza que deseja remover a categoria "${catToDelete}"? Todos os gastos vinculados a ela permanecerão, mas a categoria será removida do painel.`}
          />
    </>
  );
};

// --- Bill Form Modal (nova/editar conta) ---

const BillFormModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  bill,
  categories,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; value: number; dueDay: number; category: string; isRecurring: boolean }) => Promise<void>;
  onDelete?: () => void;
  bill: Bill | null;
  categories: Category[];
}) => {
  const [name, setName] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [dueDay, setDueDay] = useState<number>(1);
  const [category, setCategory] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useLockBodyScroll(isOpen);

  React.useEffect(() => {
    if (!isOpen) return;
    if (bill) {
      setName(bill.name);
      setValueStr(bill.value.toFixed(2).replace('.', ','));
      setDueDay(bill.dueDay);
      setCategory(bill.category);
      setIsRecurring(bill.isRecurring);
    } else {
      setName('');
      setValueStr('');
      setDueDay(new Date().getDate());
      setCategory(categories[0]?.name ?? '');
      setIsRecurring(false);
    }
    setCatDropdownOpen(false);
    setDayDropdownOpen(false);
  }, [isOpen, bill, categories]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const value = Number(valueStr.replace(/\./g, '').replace(',', '.'));
    if (!name.trim() || !category || isNaN(value) || value <= 0) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), value, dueDay, category, isRecurring });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-slate-950/50 backdrop-blur-md z-[200]" />
      <div className="fixed inset-4 m-auto max-w-sm h-fit max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain scrollbar-none surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black tracking-tight">{bill ? 'Editar Conta' : 'Nova Conta'}</h2>
          <button onClick={onClose} className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Aluguel, Netflix..."
              className="w-full h-14 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 text-base font-bold placeholder:text-white/10"
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Valor</label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 font-bold">R$</span>
              <input
                inputMode="decimal"
                value={valueStr}
                onChange={e => setValueStr(e.target.value.replace(/[^0-9,.]/g, ''))}
                placeholder="0,00"
                className="w-full h-14 glass rounded-2xl pl-12 pr-5 outline-none focus:border-blue-500/50 text-base font-bold placeholder:text-white/10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 relative">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Dia venc.</label>
              <button
                type="button"
                onClick={() => { setDayDropdownOpen(o => !o); setCatDropdownOpen(false); }}
                className={cn(
                  "w-full h-14 glass rounded-2xl px-5 text-left flex items-center justify-between text-base font-bold border",
                  dayDropdownOpen ? "border-blue-500/40 bg-white/10" : "border-transparent"
                )}
              >
                <span>{dueDay}</span>
                <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", dayDropdownOpen && "rotate-180")} />
              </button>
              {dayDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[210]" onClick={() => setDayDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 mt-2 surface-dropdown backdrop-blur-lg border border-white/10 rounded-2xl p-1 shadow-2xl z-[215] max-h-52 overflow-y-auto scrollbar-none">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setDueDay(d); setDayDropdownOpen(false); }}
                        className={cn(
                          "w-full py-2.5 text-center text-sm font-bold rounded-xl transition-all",
                          d === dueDay ? "bg-blue-500/20 text-blue-400" : "text-white/60 hover:bg-white/5"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 relative">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Categoria</label>
              <button
                type="button"
                onClick={() => { setCatDropdownOpen(o => !o); setDayDropdownOpen(false); }}
                className={cn(
                  "w-full h-14 glass rounded-2xl px-4 text-left flex items-center justify-between text-sm font-bold border",
                  catDropdownOpen ? "border-blue-500/40 bg-white/10" : "border-transparent"
                )}
              >
                <span className="truncate">{category || '—'}</span>
                <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform shrink-0", catDropdownOpen && "rotate-180")} />
              </button>
              {catDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[210]" onClick={() => setCatDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 mt-2 surface-dropdown backdrop-blur-lg border border-white/10 rounded-2xl p-1 shadow-2xl z-[215] max-h-52 overflow-y-auto scrollbar-none">
                    {categories.map(c => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => { setCategory(c.name); setCatDropdownOpen(false); }}
                        className={cn(
                          "w-full py-2.5 px-3 text-left text-sm font-bold rounded-xl transition-all flex items-center gap-2",
                          c.name === category ? "bg-blue-500/20 text-blue-400" : "text-white/70 hover:bg-white/5"
                        )}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsRecurring(v => !v)}
            className="w-full glass rounded-2xl p-4 flex items-center justify-between"
          >
            <div className="text-left flex items-center gap-3">
              <Repeat className={cn("w-5 h-5", isRecurring ? "text-blue-400" : "text-white/30")} />
              <div>
                <p className="text-sm font-bold text-white">Conta Recorrente</p>
                <p className="text-[10px] text-white/40">Reaparece todo mês</p>
              </div>
            </div>
            <div className={cn("w-12 h-7 rounded-full p-1 flex items-center", isRecurring ? "bg-blue-500" : "bg-white/10")}>
              <div className={cn("w-5 h-5 rounded-full bg-white shadow transition-transform", isRecurring ? "translate-x-5" : "translate-x-0")} />
            </div>
          </button>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !category || !valueStr}
            className="w-full h-14 btn-gradient rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all text-white disabled:opacity-40 disabled:active:scale-100"
          >
            {saving ? 'Salvando...' : bill ? 'Salvar Alterações' : 'Adicionar Conta'}
          </button>
          {bill && onDelete && (
            <button
              onClick={onDelete}
              className="w-full h-12 glass rounded-2xl font-bold text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-colors"
            >
              Excluir Conta
            </button>
          )}
        </div>
      </div>
    </>
  );
};

// --- Pay Bill Modal (pergunta se anexa comprovante) ---

const PayBillModal = ({
  bill,
  isPaid,
  onClose,
  onPay,
  onUnpay,
}: {
  bill: Bill | null;
  isPaid: boolean;
  onClose: () => void;
  onPay: (bill: Bill, file: File | null) => Promise<void>;
  onUnpay: (bill: Bill) => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useLockBodyScroll(!!bill);

  if (!bill) return null;

  const doPay = async (file: File | null) => {
    setBusy(true);
    try {
      await onPay(bill, file);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const doUnpay = async () => {
    setBusy(true);
    try {
      await onUnpay(bill);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div onClick={busy ? undefined : onClose} className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200]" />
      <div className="fixed inset-4 m-auto max-w-sm h-fit surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10">
        {isPaid ? (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-amber-400" />
              </div>
              <h2 className="text-xl font-black tracking-tight text-white">Desfazer pagamento?</h2>
              <p className="text-[12px] text-white/40 mt-2 leading-relaxed">
                Vai remover o lançamento de <span className="font-bold text-white">{formatCurrency(bill.value)}</span> criado em Lançamentos.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={doUnpay}
                disabled={busy}
                className="w-full h-14 bg-amber-500/20 border border-amber-500/30 rounded-2xl font-bold text-sm text-amber-400 active:scale-95 transition-all disabled:opacity-40"
              >
                {busy ? 'Removendo...' : 'Sim, desfazer'}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full h-12 glass rounded-2xl font-bold text-xs text-white/60"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-emerald-400 stroke-[3]" />
              </div>
              <h2 className="text-xl font-black tracking-tight text-white">{bill.name}</h2>
              <p className="text-2xl font-light text-white mt-1">{formatCurrency(bill.value)}</p>
              <p className="text-[12px] text-white/40 mt-3 leading-relaxed">Deseja anexar o comprovante?</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={e => {
                const f = e.target.files?.[0] ?? null;
                if (f) doPay(f);
              }}
            />
            <div className="space-y-3">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full h-14 btn-gradient rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all text-white disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {busy ? 'Enviando...' : 'Sim, anexar comprovante'}
              </button>
              <button
                onClick={() => doPay(null)}
                disabled={busy}
                className="w-full h-14 glass rounded-2xl font-bold text-sm text-white/80 active:scale-95 transition-all disabled:opacity-40"
              >
                Não, pagar sem anexo
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full h-12 text-white/40 hover:text-white/60 font-bold text-xs transition-colors"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

// --- Notification Settings Modal ---

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  time: string;
  onTimeChange: (time: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  message: string;
  onMessageChange: (message: string) => void;
}

const NotificationSettingsModal = ({
  isOpen,
  onClose,
  enabled,
  onToggle,
  time,
  onTimeChange,
  title,
  onTitleChange,
  message,
  onMessageChange
}: NotificationSettingsModalProps) => {
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");
  const [activeDropdown, setActiveDropdown] = useState<'hour' | 'minute' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  React.useEffect(() => {
    if (isSupported) {
      setPermissionState(Notification.permission);
    }
  }, [isOpen, isSupported]);

  // Close dropdown on click outside helper
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    if (activeDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeDropdown]);

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  // Envia notificação via Service Worker (funciona no mobile) com fallback para desktop
  const sendNotificationViaSW = async (notifTitle: string, body: string) => {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(notifTitle, {
          body,
          icon: '/icon-192.png',
          badge: '/badge.svg',
        });
        return;
      } catch (e) {
        console.warn('SW showNotification falhou, tentando fallback:', e);
      }
    }
    // Fallback apenas para desktop onde new Notification() funciona
    try {
      new Notification(notifTitle, { body, icon: '/icon-192.png' });
    } catch (e) {
      console.error('Não foi possível exibir notificação:', e);
    }
  };

  const handleRequestPermission = async () => {
    if (!isSupported) return;
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission === 'granted') {
        await sendNotificationViaSW(
          title || "Gastos Queymeli e Thiago",
          "Lembretes diários ativados com sucesso! 🔔"
        );
      }
    } catch (err) {
      console.error("Error requesting notification permission:", err);
    }
  };

  const handleToggleChange = (newVal: boolean) => {
    onToggle(newVal);
    if (newVal) {
      if (isSupported && Notification.permission !== 'granted') {
        handleRequestPermission();
      }
    }
  };

  const handleSendTestNotification = async () => {
    if (!isSupported) {
      alert("As notificações nativas não são suportadas neste navegador.");
      return;
    }
    const previewTitle = title.trim() || "Gastos Queymeli e Thiago";
    const previewBody = message.trim() || "Seu lembrete de teste está funcionando! 🤝";
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      setPermissionState(perm);
      if (perm === 'granted') {
        await sendNotificationViaSW(previewTitle, previewBody);
      }
    } else {
      await sendNotificationViaSW(previewTitle, previewBody);
    }
  };

  const currentHour = time.split(':')[0] || '20';
  const currentMinute = time.split(':')[1] || '00';

  const handleHourSelect = (h: string) => {
    onTimeChange(`${h}:${currentMinute}`);
  };

  const handleMinuteSelect = (m: string) => {
    onTimeChange(`${currentHour}:${m}`);
  };

  const hoursArray = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesArray = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  return (
    <>
      {isOpen && (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-md z-[200]"
          />
          <div
            className="fixed inset-4 m-auto max-w-sm h-fit max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain scrollbar-none surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black tracking-tight text-white">Lembretes</h2>
              <button 
                onClick={onClose} 
                className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="glass p-4 rounded-2xl flex items-start gap-3">
                <Bell className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Lembrete Inteligente</p>
                  <p className="text-[11px] text-white/40 leading-relaxed text-left">
                    Ajuda você a lembrar de anotar seus gastos. Se você já tiver cadastrado qualquer despesa hoje, nós não te incomodamos!
                  </p>
                </div>
              </div>

              {/* Custom title & message */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 text-left">Título do Aviso</p>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  maxLength={50}
                  placeholder="Ex: Gastos Queymeli e Thiago"
                  className="w-full h-12 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 transition-colors text-base font-bold placeholder:text-white/10"
                />
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 text-left">Mensagem do Aviso</p>
                <textarea
                  value={message}
                  onChange={(e) => onMessageChange(e.target.value)}
                  maxLength={150}
                  rows={3}
                  placeholder="Ex: Você lembrou de anotar seus gastos hoje?"
                  className="w-full glass rounded-2xl px-5 py-3 outline-none focus:border-blue-500/50 transition-colors text-base font-medium placeholder:text-white/10 resize-none"
                />
                <p className="text-[9px] text-white/20 text-right pr-1">{message.length}/150</p>
              </div>

              <div className="flex items-center justify-between p-4 glass rounded-2xl">
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Ativar Avisos</p>
                  <p className="text-[10px] text-white/40">Notificações diárias</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleChange(!enabled)}
                  className={cn(
                    "w-12 h-7 rounded-full p-1 relative flex items-center shadow-inner",
                    enabled ? "bg-blue-500" : "bg-white/10"
                  )}
                >
                  <div
                    className={cn("w-5 h-5 rounded-full bg-white shadow", enabled ? "translate-x-5" : "translate-x-0")}
                  />
                </button>
              </div>

              {enabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 text-left">Horário de Aviso</p>
                    <div ref={dropdownRef} className="flex items-center gap-3 relative">
                      
                      {/* Hour selector */}
                      <div className="flex-1 relative">
                        <button
                          type="button"
                          onClick={() => setActiveDropdown(activeDropdown === 'hour' ? null : 'hour')}
                          className={cn(
                            "w-full bg-white/5 border rounded-2xl p-3 flex flex-col items-center hover:bg-white/10 transition-all text-left",
                            activeDropdown === 'hour' ? "border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-white/10" : "border-white/5"
                          )}
                        >
                          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Hora</span>
                          <span className="text-lg font-black text-white">{currentHour}</span>
                        </button>

                        {activeDropdown === 'hour' && (
                            <div
                              className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto surface-dropdown backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl z-[250] py-1 scrollbar-none"
                            >
                              {hoursArray.map(h => (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => {
                                    handleHourSelect(h);
                                    setActiveDropdown(null);
                                  }}
                                  className={cn(
                                    "w-full py-2.5 text-center text-sm font-bold transition-all hover:bg-white/5",
                                    currentHour === h ? "text-blue-400 bg-blue-500/10 font-black" : "text-white/60"
                                  )}
                                >
                                  {h}
                                </button>
                              ))}
                            </div>
                        )}
                      </div>

                      <span className="text-2xl font-black text-white/20 select-none">:</span>

                      {/* Minute selector */}
                      <div className="flex-1 relative">
                        <button
                          type="button"
                          onClick={() => setActiveDropdown(activeDropdown === 'minute' ? null : 'minute')}
                          className={cn(
                            "w-full bg-white/5 border rounded-2xl p-3 flex flex-col items-center hover:bg-white/10 transition-all text-left",
                            activeDropdown === 'minute' ? "border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-white/10" : "border-white/5"
                          )}
                        >
                          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Minuto</span>
                          <span className="text-lg font-black text-white">{currentMinute}</span>
                        </button>

                        {activeDropdown === 'minute' && (
                            <div
                              className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto surface-dropdown backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl z-[250] py-1 scrollbar-none"
                            >
                              {minutesArray.map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => {
                                    handleMinuteSelect(m);
                                    setActiveDropdown(null);
                                  }}
                                  className={cn(
                                    "w-full py-2.5 text-center text-sm font-bold transition-all hover:bg-white/5",
                                    currentMinute === m ? "text-blue-400 bg-blue-500/10 font-black" : "text-white/60"
                                  )}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {isSupported && (
                    <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Navegador</p>
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                          permissionState === "granted" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                          permissionState === "denied" && "bg-red-500/10 text-red-400 border border-red-500/20",
                          permissionState === "default" && "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        )}>
                          {permissionState === "granted" ? "Permitido" : permissionState === "denied" ? "Bloqueado" : "Pendente"}
                        </span>
                      </div>

                      {permissionState === "default" && (
                        <button
                          type="button"
                          onClick={handleRequestPermission}
                          className="w-full h-11 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold transition-all active:scale-95"
                        >
                          Autorizar no Dispositivo
                        </button>
                      )}

                      {permissionState === "denied" && (
                        <p className="text-[10px] text-red-400/70 text-center leading-normal pt-1">
                          As notificações foram bloqueadas. Por favor, ative nas configurações de privacidade do seu navegador se quiser receber lembretes.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleSendTestNotification}
                        className="w-full h-11 glass hover:bg-white/5 text-white/70 rounded-xl text-xs font-bold transition-all active:scale-95"
                      >
                        Enviar teste de notificação
                      </button>
                    </div>
                  )}

                  {!isSupported && (
                    <div className="p-4 bg-red-500/5 border border-red-500/10 text-red-400 rounded-2xl text-[11px] text-center leading-normal">
                      Notificações Push não são suportadas pelo seu navegador atual ou aba de visualização privada.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <button
                onClick={onClose}
                className="w-full h-14 btn-gradient rounded-2xl font-bold text-sm shadow-xl active:scale-95 transition-all text-white"
              >
                Concluir Configuração
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// --- Export Modal ---

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  categories: Category[];
  users: User[];
}

const ExportModal = ({ isOpen, onClose, expenses, categories, users }: ExportModalProps) => {
  const [exportPeriod, setExportPeriod] = useState<"all" | "7days" | "30days" | "month">("all");
  const [selectedExportMonth, setSelectedExportMonth] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    expenses.forEach(e => {
      const d = new Date(e.createdAt);
      if (!isNaN(d.getTime())) {
        const monthLabel = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        monthsSet.add(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1));
      }
    });
    return Array.from(monthsSet);
  }, [expenses]);

  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedExportMonth) {
      setSelectedExportMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedExportMonth]);

  const filteredExportExpenses = useMemo(() => {
    let filtered = [...expenses];
    const now = new Date();

    if (exportPeriod === "7days") {
      const limit = new Date();
      limit.setDate(now.getDate() - 7);
      filtered = filtered.filter(e => new Date(e.createdAt) >= limit);
    } else if (exportPeriod === "30days") {
      const limit = new Date();
      limit.setDate(now.getDate() - 30);
      filtered = filtered.filter(e => new Date(e.createdAt) >= limit);
    } else if (exportPeriod === "month" && selectedExportMonth) {
      filtered = filtered.filter(e => {
        const d = new Date(e.createdAt);
        if (isNaN(d.getTime())) return false;
        const monthLabel = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const capMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        return capMonthLabel === selectedExportMonth;
      });
    }
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [expenses, exportPeriod, selectedExportMonth]);

  const exportStats = useMemo(() => {
    return categories.map(cat => {
      const total = filteredExportExpenses
        .filter(e => e.category === cat.name)
        .reduce((sum, e) => sum + e.value, 0);
      return { name: cat.name, total, color: cat.color };
    }).filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  }, [filteredExportExpenses, categories]);

  const exportTotalAmount = useMemo(() => exportStats.reduce((sum, s) => sum + s.total, 0), [exportStats]);

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  const handleDownloadReport = () => {
    const reportTitle = `Relatório de Custos - ${
      exportPeriod === "all" ? "Geral" :
      exportPeriod === "7days" ? "Últimos 7 Dias" :
      exportPeriod === "30days" ? "Últimos 30 Dias" :
      selectedExportMonth
    }`;

    const statsHTML = exportStats.map(s => {
      const pct = exportTotalAmount > 0 ? (s.total / exportTotalAmount) * 100 : 0;
      return `
        <div class="stat-row">
          <div class="stat-info">
            <div class="stat-label">
              <span class="dot" style="background-color: ${s.color}; border: 1px solid rgba(255,255,255,0.15)"></span>
              <span class="name">${s.name}</span>
            </div>
            <div class="values">
              <span class="val">${formatCurrency(s.total)}</span>
              <span class="pct">(${pct.toFixed(1)}%)</span>
            </div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar" style="width: ${pct}%; background-color: ${s.color}; box-shadow: 0 0 10px ${s.color}33"></div>
          </div>
        </div>
      `;
    }).join('');

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const tableRowsHTML = filteredExportExpenses.map(e => {
      const d = new Date(e.createdAt);
      const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
      const catObj = categories.find(c => c.name === e.category) || { color: '#94a3b8' };
      const owner = users.find(u => u.id === e.userId);
      const ownerName = owner?.name ?? '—';
      const ownerColor = owner?.color ?? '#94a3b8';
      const ownerInitials = owner?.initials ?? '?';

      return `
        <tr>
          <td>
            <div class="table-expense-name">${escapeHtml(e.name)}</div>
            ${e.note ? `<div class="table-note">"${escapeHtml(e.note)}"</div>` : ''}
          </td>
          <td>
            <div class="table-tag" style="background-color: ${catObj.color}15; color: ${catObj.color}; border: 1px solid ${catObj.color}30">
              <span class="tag-dot" style="background-color: ${catObj.color}"></span>
              ${escapeHtml(e.category)}
            </div>
          </td>
          <td>
            <div class="owner-cell">
              <span class="owner-avatar" style="background-color: ${ownerColor}">${escapeHtml(ownerInitials)}</span>
              <span class="owner-name">${escapeHtml(ownerName)}</span>
            </div>
          </td>
          <td><span class="table-date">${formattedDate}</span></td>
          <td class="table-value">${formatCurrency(e.value)}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #3b82f6;
      --bg: #090b11;
      --card-bg: rgba(26, 29, 41, 0.6);
      --border: rgba(255, 255, 255, 0.08);
      --text: #ffffff;
      --text-soft: rgba(255, 255, 255, 0.6);
    }
    
    /* Helper classes for styling table cells dynamically */
    .table-user-name {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
    }
    .table-date {
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      white-space: nowrap;
    }
    .table-value {
      text-align: right;
      font-weight: 800;
      font-size: 12px;
      color: #ffffff;
      white-space: nowrap;
    }
    
    /* Ensure background colors and gradients are preserved when exporting and printing */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    @media print {
      html, body {
        background-color: #ffffff !important;
        color: #0f172a !important;
        background-image: none !important;
      }
      .actions-container {
        display: none !important;
      }
      header {
        border-bottom: 2px solid #e2e8f0 !important;
      }
      .title-area h1 {
        color: #0f172a !important;
      }
      .title-area p {
        color: #475569 !important;
      }
      .metadata h3 {
        color: #475569 !important;
      }
      .card {
        background-color: #f8fafc !important;
        border: 1px solid #e2e8f0 !important;
        box-shadow: none !important;
      }
      .card-title {
        color: #475569 !important;
      }
      .card-val {
        color: #0f172a !important;
      }
      .card-val span {
        color: #475569 !important;
        opacity: 0.8 !important;
      }
      .stat-label .name {
        color: #0f172a !important;
      }
      .values .val {
        color: #0f172a !important;
      }
      .values .pct {
        color: #475569 !important;
      }
      .progress-bar-bg {
        background-color: #e2e8f0 !important;
      }
      th {
        color: #475569 !important;
        border-bottom: 2px solid #e2e8f0 !important;
        background-color: #f1f5f9 !important;
      }
      td {
        border-bottom: 1px solid #e2e8f0 !important;
      }
      .table-expense-name {
        color: #0f172a !important;
      }
      .table-user-name {
        color: #334155 !important;
      }
      .table-date {
        color: #475569 !important;
      }
      .table-value {
        color: #0f172a !important;
      }
      .table-note {
        color: #475569 !important;
      }
      .stat-info .dot {
        border: 1px solid rgba(0,0,0,0.1) !important;
      }
      .owner-name {
        color: #0f172a !important;
      }
      .owner-avatar {
        border: 1px solid rgba(0,0,0,0.1) !important;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding: 24px 16px;
      line-height: 1.4;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .logo svg { width: 100%; height: 100%; display: block; }

    .title-area h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }

    .title-area p {
      font-size: 11px;
      color: var(--text-soft);
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .metadata {
      text-align: right;
    }

    .metadata h3 {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-soft);
    }

    .metadata p {
      font-size: 11px;
      color: #10b981;
      font-weight: 900;
      letter-spacing: 1px;
    }

    .actions-container {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 24px;
    }

    .btn {
      padding: 12px 24px;
      border-radius: 14px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: #fff;
      box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
    }

    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 24px rgba(59, 130, 246, 0.4);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text);
      border-color: var(--border);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .grid-totals {
      display: grid;
      grid-template-cols: 1fr 1fr;
      gap: 12px;
      margin-bottom: 18px;
    }

    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px 16px;
      backdrop-filter: blur(20px);
    }

    .card-title {
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-soft);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .card-title .circle {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }

    .card-val {
      font-size: 22px;
      font-weight: 300;
      letter-spacing: -0.5px;
    }

    .card-val span {
      font-size: 13px;
      opacity: 0.3;
    }

    .chart-card {
      margin-bottom: 18px;
    }

    .chart-header {
      margin-bottom: 12px;
    }

    .stat-row {
      margin-bottom: 10px;
    }

    .stat-row:last-child {
      margin-bottom: 0;
    }

    .stat-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .stat-info .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .stat-label {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stat-label .name {
      font-size: 14px;
      font-weight: 700;
    }

    .values {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }

    .values .val {
      font-size: 14px;
      font-weight: 800;
    }

    .values .pct {
      font-size: 11px;
      color: var(--text-soft);
      font-weight: 600;
    }

    .progress-bar-bg {
      height: 6px;
      background-color: rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      overflow: hidden;
      position: relative;
    }

    .progress-bar {
      height: 100%;
      border-radius: 10px;
    }

    .table-card {
      padding: 0;
      overflow: hidden;
    }

    .table-header-box {
      padding: 24px 24px 8px 24px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    /* Larguras fixas: economiza papel e força quebra de linha */
    th:nth-child(1), td:nth-child(1) { width: 36%; }
    th:nth-child(2), td:nth-child(2) { width: 18%; }
    th:nth-child(3), td:nth-child(3) { width: 18%; }
    th:nth-child(4), td:nth-child(4) { width: 12%; }
    th:nth-child(5), td:nth-child(5) { width: 16%; }

    .owner-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .owner-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 900;
      color: #ffffff;
      flex-shrink: 0;
      letter-spacing: 0;
    }

    .owner-name {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.85);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    th {
      text-align: left;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-soft);
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .table-expense-name {
      font-weight: 700;
      color: #ffffff;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.35;
    }

    .table-note {
      font-size: 10px;
      color: var(--text-soft);
      font-style: italic;
      margin-top: 3px;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.4;
    }

    .table-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      max-width: 100%;
      word-break: break-word;
    }

    .tag-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }

    .user-initials {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 900;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="actions-container">
      <button class="btn btn-secondary" onclick="window.close()">Fechar</button>
      <button class="btn btn-primary" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Imprimir / PDF
      </button>
    </div>

    <header>
      <div class="logo-container">
        <div class="logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="#E8A833"/><circle cx="256" cy="256" r="222" fill="#FED04A"/><g fill="none" stroke="#7B4A1D" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"><path d="M 256 100 V 412"/><path d="M 330 168 C 320 148, 292 132, 256 132 C 216 132, 188 154, 188 186 C 188 218, 220 232, 256 240 C 292 248, 324 262, 324 296 C 324 328, 296 348, 256 348 C 220 348, 192 332, 182 312"/></g></svg></div>
        <div class="title-area">
          <h1>Gastos Queymeli e Thiago</h1>
          <p>Fechamento e Consumo Mensal</p>
        </div>
      </div>
      <div class="metadata">
        <h3>Período do Relatório</h3>
        <p>${exportPeriod === "all" ? "Histórico Completo" : exportPeriod === "7days" ? "Últimos 7 dias" : exportPeriod === "30days" ? "Últimos 30 dias" : selectedExportMonth}</p>
      </div>
    </header>

    <div class="grid-totals">
      <div class="card">
        <div class="card-title">
          <span class="circle" style="background-color: #3b82f6;"></span>
          Total Consumido
        </div>
        <div class="card-val">
          ${formatCurrency(exportTotalAmount).split(',')[0]}<span>,${formatCurrency(exportTotalAmount).split(',')[1] || '00'}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">
          <span class="circle" style="background-color: #10b981;"></span>
          Lançamentos Efetuados
        </div>
        <div class="card-val">
          ${filteredExportExpenses.length}<span> ordens</span>
        </div>
      </div>
    </div>

    <!-- Divisão por Categoria (Gráfico) -->
    <div class="card chart-card">
      <div class="chart-header">
        <div class="card-title" style="margin-bottom:0;">
          <span class="circle animate-pulse" style="background-color: #3b82f6;"></span>
          Divisão por Categoria
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${exportTotalAmount === 0 ? '<div style="text-align:center; padding: 20px; color:var(--text-soft)">Sem gastos para este período</div>' : statsHTML}
      </div>
    </div>

    <!-- Lista Transacional de Detalhes -->
    <div class="card table-card">
      <div class="table-header-box">
        <div class="card-title">
          <span class="circle" style="background-color: #a855f7;"></span>
          Detalhamento dos Lançamentos
        </div>
      </div>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            <tr>
              <th>Custo / Descrição</th>
              <th>Categoria</th>
              <th>Responsável</th>
              <th>Data</th>
              <th style="text-align: right;">Total (R$)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredExportExpenses.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color:var(--text-soft)">Nenhum lançamento encontrado neste período.</td></tr>' : tableRowsHTML}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_custos_${exportPeriod === "month" ? selectedExportMonth.replace(/\s+/g, '_').toLowerCase() : exportPeriod}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-md z-[200]"
          />
          <div
            className="fixed inset-4 m-auto max-w-md h-fit max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain scrollbar-none surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <Download className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Exportar Relatório</h2>
              </div>
              <button 
                onClick={onClose} 
                className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Period selection */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Selecione o Período</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "all", label: "Tudo" },
                    { id: "7days", label: "Últimos 7 dias" },
                    { id: "30days", label: "Últimos 30 dias" },
                    { id: "month", label: "Por Mês" },
                  ].map(option => (
                    <button
                      key={option.id}
                      onClick={() => setExportPeriod(option.id as any)}
                      className={cn(
                        "h-12 rounded-xl text-xs font-bold transition-all border border-transparent",
                        exportPeriod === option.id 
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30 font-black shadow-lg shadow-blue-500/50"
                          : "glass text-white/50 hover:text-white"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Month Selector Dropdown if "month" is active */}
              {exportPeriod === "month" && availableMonths.length > 0 && (
                  <div className="space-y-3 overflow-visible">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Escolha o Mês</p>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={cn(
                          "w-full h-14 glass rounded-2xl px-5 text-sm font-bold text-white flex items-center justify-between outline-none cursor-pointer border border-transparent transition-all",
                          isDropdownOpen ? "border-blue-500/50 bg-white/10" : "hover:bg-white/5"
                        )}
                      >
                        <span>{selectedExportMonth || "Selecione o mês"}</span>
                        <ChevronDown className={cn("w-5 h-5 text-white/40 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
                      </button>

                      {isDropdownOpen && (
                        <div 
                          className="fixed inset-0 z-[210]" 
                          onClick={() => setIsDropdownOpen(false)} 
                        />
                      )}

                      {isDropdownOpen && (
                          <div
                            className="absolute left-0 right-0 mt-2 surface-dropdown backdrop-blur-lg border border-white/10 rounded-2xl p-2 shadow-2xl z-[215] max-h-48 overflow-y-auto scrollbar-none select-none"
                          >
                            {availableMonths.map(month => (
                              <button
                                key={month}
                                type="button"
                                onClick={() => {
                                  setSelectedExportMonth(month);
                                  setIsDropdownOpen(false);
                                }}
                                className={cn(
                                  "w-full h-10 px-4 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between",
                                  selectedExportMonth === month
                                    ? "bg-blue-500/20 text-blue-400"
                                    : "text-white/60 hover:bg-white/5 hover:text-white"
                                )}
                              >
                                <span>{month}</span>
                                {selectedExportMonth === month && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Live instant summary preview */}
              <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Resumo da Seleção</p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-2xl font-light tracking-tighter">
                      {formatCurrency(exportTotalAmount).split(',')[0]}
                      <span className="text-base opacity-30">,{formatCurrency(exportTotalAmount).split(',')[1] || '00'}</span>
                    </p>
                    <p className="text-[10px] font-bold text-white/30 mt-1 uppercase tracking-wider">Total Consumido</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tracking-tight text-emerald-400">
                      {filteredExportExpenses.length}
                    </p>
                    <p className="text-[10px] font-bold text-white/30 mt-1 uppercase tracking-wider">Lançamentos</p>
                  </div>
                </div>

                {exportTotalAmount > 0 ? (
                  <div className="pt-4 border-t border-white/5 space-y-2">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Maiores Categorias</p>
                    <div className="flex gap-1.5 h-1.5 rounded-full overflow-hidden w-full">
                      {exportStats.slice(0, 3).map((stat, idx) => {
                        const pct = exportTotalAmount > 0 ? (stat.total / exportTotalAmount) * 100 : 0;
                        return (
                          <div 
                            key={idx} 
                            style={{ width: `${pct}%`, backgroundColor: stat.color }} 
                            className="h-full rounded-full transition-all"
                            title={`${stat.name}: ${formatCurrency(stat.total)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs text-white/20 font-bold">
                    Nenhum gasto encontrado para este período
                  </div>
                )}
              </div>

              {/* Print and Export CTA */}
              <div className="pt-2 flex flex-col gap-3">
                <button
                  onClick={handleDownloadReport}
                  disabled={filteredExportExpenses.length === 0}
                  className="w-full h-16 btn-gradient text-white font-black rounded-2xl shadow-lg shadow-blue-500/30 active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Download className="w-4 h-4" />
                  Gerar e Baixar Relatório
                </button>
                <p className="text-[10px] text-center text-white/30 font-medium leading-relaxed">
                  Gera um documento HTML interativo pronto para ser salvo como PDF ou impresso, contendo a divisão por categorias com gráficos SVG e tabela de auditoria completa.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// --- Confirmation Modal ---

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void,
  title: string,
  message: string
}) => {
  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300]"
      />
      <div
        className="fixed inset-4 m-auto max-w-sm h-fit glass rounded-[48px] p-10 z-[301] border border-red-500/20 shadow-2xl text-center"
      >
            <div className="w-20 h-20 bg-red-500/10 rounded-[32%] flex items-center justify-center mx-auto mb-6 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-3">{title}</h2>
            <p className="text-white/40 text-sm leading-relaxed mb-8">{message}</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={onConfirm}
                className="w-full h-16 bg-red-500 text-white font-black rounded-2xl shadow-lg shadow-red-500/30 active:scale-95 transition-all uppercase tracking-widest text-[10px]"
              >
                Confirmar Exclusão
              </button>
              <button 
                onClick={onClose}
                className="w-full h-16 glass text-white/40 font-black rounded-2xl hover:bg-white/5 transition-all uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </button>
            </div>
      </div>
    </>
  );
};

// --- Profile Modal ---

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  email: string;
  onSaved: (updated: User) => void;
}

const ProfileModal = ({ isOpen, onClose, user, email, onSaved }: ProfileModalProps) => {
  const [name, setName] = useState(user.name);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(user.photoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(user.name);
      setPhotoUrl(user.photoUrl);
      setError(null);
    }
  }, [isOpen, user]);

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  const initials = (name.trim() || 'US')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await db.uploadAvatar(file, user.id);
      setPhotoUrl(url);
    } catch (err) {
      console.error(err);
      setError('Erro ao enviar foto. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(undefined);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Informe seu nome.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await db.upsertUserProfile(user.id, {
        name: name.trim(),
        initials,
        photoUrl: photoUrl ?? null,
      });
      onSaved({ ...user, name: name.trim(), initials, photoUrl });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {isOpen && (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-md z-[200]"
          />
          <div
            className="fixed inset-4 m-auto max-w-sm h-fit max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain scrollbar-none surface-modal backdrop-blur-xl rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 z-[201] border border-white/10"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black tracking-tight">Meu Perfil</h2>
              <button
                onClick={onClose}
                className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="relative w-28 h-28 rounded-full border-2 border-white/10 overflow-hidden flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: photoUrl ? 'transparent' : user.color }}
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Foto do perfil"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-3xl font-black text-white tracking-tight">{initials}</span>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 px-4 glass rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {photoUrl ? 'Trocar Foto' : 'Adicionar Foto'}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={handleRemovePhoto}
                      className="h-10 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-bold text-red-400 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
              </div>

              {/* Nome */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Seu Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como aparece nos lançamentos"
                  className="w-full h-14 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 transition-colors text-base font-bold placeholder:text-white/10"
                />
              </div>

              {/* Email (bloqueado) */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1 flex items-center gap-2">
                  <span>Email de Acesso</span>
                  <span className="text-[8px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-white/40">BLOQUEADO</span>
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full h-14 bg-white/[0.02] border border-white/5 rounded-2xl px-5 outline-none text-base font-medium text-white/40 cursor-not-allowed"
                />
                <p className="text-[10px] text-white/30 leading-relaxed px-1">
                  Para alterar o e-mail, peça ao administrador do sistema.
                </p>
              </div>

              {error && (
                <p className="text-red-400 text-xs font-bold px-1">{error}</p>
              )}

              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="w-full h-14 btn-gradient text-white font-black rounded-2xl text-sm shadow-lg active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// --- Login Screen ---

const LoginScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      // onAuthStateChange no App detecta SIGNED_IN e chama setCurrentUser
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      if (msg.includes('Invalid login')) setError('Email ou senha incorretos.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <GlassCard className="w-full max-w-md p-10 text-center rounded-[40px]" delay={0.2}>
        <img src="/icon.svg" alt="" className="w-20 h-20 mx-auto mb-8 shadow-lg select-none rounded-full" />

        <h1 className="text-3xl font-bold mb-1 tracking-tighter">Gastos Queymeli e Thiago</h1>
        <p className="text-white/30 mb-10 text-xs font-bold uppercase tracking-[0.2em]">sistema de gestão financeira</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Email de Acesso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@dominio.com"
              className="w-full h-14 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/10"
            />
          </div>
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Chave de Segurança</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-14 glass rounded-2xl px-5 outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/10"
            />
          </div>
          {error && (
            <p className="text-red-400 text-xs font-bold text-left px-1">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 btn-gradient text-white font-bold rounded-2xl mt-4 text-lg disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Aguarde...' : 'Acessar Painel'}
          </button>
        </form>
      </GlassCard>
    </div>
  );
};

// --- Expense Modal (Bottom Sheet) ---

const ExpenseModal = ({ isOpen, onClose, user, expense, onSave, categories }: {
  isOpen: boolean,
  onClose: () => void,
  user: User,
  expense?: Expense | null,
  onSave: (expense: Omit<Expense, 'id' | 'userId' | 'createdAt'> & { id?: string, photoBlob?: File | null }) => void,
  categories: Category[]
}) => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(expense?.name || "");
  const [value, setValue] = useState(expense?.value.toString() || "");
  const [note, setNote] = useState(expense?.note || "");
  const [category, setCategory] = useState(expense?.category || categories[0]?.name || "");
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate || todayISO);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState(expense?.attachmentUrl || "");

  const [uploadingFile, setUploadingFile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Teclado virtual: sobe o sheet acima do teclado e limita a altura ao espaço
  // visível (iOS não redimensiona o viewport — só o visualViewport acompanha)
  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (sheetRef.current) {
        sheetRef.current.style.bottom = `${keyboardInset}px`;
        sheetRef.current.style.maxHeight = `${vv.height * 0.92}px`;
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  // Mantém o campo em edição visível acima do teclado
  const keepFieldVisible = (e: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => {
      e.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 250); // espera o teclado abrir/viewport assentar
  };

  // Sync state if expense changes (e.g. when opening to edit)
  // IMPORTANTE: não incluir `categories` nas deps — causa reset dos campos ao tirar foto no mobile
  React.useEffect(() => {
    if (expense) {
      setName(expense.name);
      setValue(expense.value.toString());
      setNote(expense.note || "");
      setCategory(expense.category);
      setAttachmentUrl(expense.attachmentUrl || "");
      setExpenseDate(expense.expenseDate || todayISO);
      setFormError(null);
      setPendingPhoto(null);
    } else if (isOpen) {
      setName("");
      setValue("");
      setNote("");
      setCategory(categories[0]?.name || "");
      setAttachmentUrl("");
      setExpenseDate(todayISO);
      setFormError(null);
      setPendingPhoto(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense, isOpen]);

  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Offline: guarda o arquivo localmente — sobe junto com a sincronização
    if (!navigator.onLine) {
      setPendingPhoto(file);
      setAttachmentUrl(URL.createObjectURL(file));
      return;
    }

    setUploadingFile(true);
    try {
      const url = await db.uploadReceipt(file, user.id);
      setAttachmentUrl(url);
      setPendingPhoto(null);
    } catch {
      // Falha de rede no meio do upload: trata como offline
      setPendingPhoto(file);
      setAttachmentUrl(URL.createObjectURL(file));
    } finally {
      setUploadingFile(false);
    }
  };

  const selectedCategory = categories.find(c => c.name === category) || categories[0] || { name: 'Outros', color: '#94a3b8' };

  const handleSave = () => {
    if (!name.trim() || !value) {
      setFormError(
        !name.trim() && !value ? 'Preencha a descrição e o valor.'
        : !name.trim() ? 'Preencha a descrição do gasto.'
        : 'Preencha o valor do gasto.'
      );
      return;
    }
    if (uploadingFile) return;
    onSave({
      id: expense?.id,
      name,
      value: parseFloat(value),
      note,
      category,
      // blob: URL é só preview local — a URL real vem após sincronizar a foto
      attachmentUrl: attachmentUrl.startsWith('blob:') ? '' : attachmentUrl,
      expenseDate,
      photoBlob: pendingPhoto,
    });
    onClose();
  };

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
      />
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 glass rounded-t-[48px] p-10 z-[101] max-h-[92vh] overflow-y-auto overscroll-contain border-t border-white/10"
      >
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-10" />
            
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black tracking-tight">{expense ? "Editar Gasto" : "Novo Gasto"}</h2>
              <button onClick={onClose} className="p-3 glass rounded-2xl hover:bg-white/5 transition-colors">
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Descrição</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onFocus={keepFieldVisible}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Descreva o nome do gasto..."
                  className={cn(
                    "w-full h-16 glass rounded-2xl px-6 text-xl outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/5 font-bold",
                    formError && !name.trim() && "border-red-500/50"
                  )}
                />
              </div>

              <div className="space-y-3 relative">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Categoria de Custo</label>
                
                <button
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="w-full h-16 glass rounded-2xl px-6 flex items-center justify-between hover:bg-white/5 transition-all text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full shadow-[0_0_8px_currentcolor]" style={{ backgroundColor: selectedCategory.color, color: selectedCategory.color }} />
                    <span className="font-bold">{selectedCategory.name}</span>
                  </div>
                  <ChevronDown className={cn("w-5 h-5 text-white/20 transition-transform duration-300", isCategoryDropdownOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isCategoryDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 p-3 surface-dropdown border border-white/20 rounded-[28px] z-[120] backdrop-blur-3xl"
                    >
                      <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                        {categories.map(cat => (
                          <button
                            key={cat.name}
                            type="button"
                            onClick={() => {
                              setCategory(cat.name);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full h-12 rounded-xl flex items-center px-4 gap-4 transition-all duration-200",
                              category === cat.name 
                                ? "bg-white/10 text-white shadow-lg" 
                                : "text-white/60 hover:text-white hover:bg-white/5"
                            )}
                          >
                            <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentcolor]" style={{ backgroundColor: cat.color, color: cat.color }} />
                            <span className="text-sm font-bold">{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Valor Unitário</label>
                <div className="relative">
                   <span className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 font-bold text-xl">R$</span>
                   <input
                    type="number"
                    value={value}
                    onFocus={keepFieldVisible}
                    onChange={(e) => {
                      setValue(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="0,00"
                    className={cn(
                      "w-full h-16 glass rounded-2xl pl-16 pr-6 text-3xl font-black outline-none focus:border-blue-500/50 transition-colors placeholder:text-white/5",
                      formError && !value && "border-red-500/50"
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Data do Gasto</label>
                <input
                  type="date"
                  value={expenseDate}
                  max={todayISO}
                  onFocus={keepFieldVisible}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full h-16 glass rounded-2xl px-6 text-base font-bold outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Observações Adicionais</label>
                <textarea
                  value={note}
                  onFocus={keepFieldVisible}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Detalhes que ajudam no fechamento..."
                  className="w-full h-32 glass rounded-3xl p-6 outline-none focus:border-blue-500/50 transition-colors resize-none placeholder:text-white/5 font-medium text-base"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Comprovante Fiscal</label>
                {attachmentUrl ? (
                  <div className="w-full p-4 glass rounded-[24px] flex items-center justify-between border border-white/10 relative overflow-hidden bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-black/40 flex-shrink-0 flex items-center justify-center">
                        <img 
                          src={attachmentUrl} 
                          alt="Pré-visualização" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-white leading-none">Comprovante Anexado</p>
                        <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider mt-1.5 leading-none">Pronto para salvar</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => { setAttachmentUrl(""); setPendingPhoto(null); }}
                      className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 rounded-2xl active:scale-95 transition-all text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      disabled={uploadingFile}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-16 glass rounded-2xl text-white/40 hover:text-white hover:border-white/20 transition-all border-dashed flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest cursor-pointer group disabled:opacity-50"
                    >
                      <Paperclip className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-blue-400 transition-all" />
                      <span>{uploadingFile ? 'Enviando...' : 'Anexar Arquivo'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={uploadingFile}
                      onClick={() => cameraInputRef.current?.click()}
                      className="h-16 glass rounded-2xl text-white/40 hover:text-white hover:border-white/20 transition-all border-dashed flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest cursor-pointer group disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-emerald-400 transition-all" />
                      <span>{uploadingFile ? 'Enviando...' : 'Tirar Foto'}</span>
                    </button>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={cameraInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={uploadingFile}
                className="w-full h-20 btn-gradient text-white font-black rounded-3xl text-xl shadow-blue-500/40 mt-4 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {uploadingFile ? "Enviando comprovante..." : expense ? "Salvar Alterações" : "Confirmar Lançamento"}
              </button>
            </div>
      </div>
    </>
  );
};

// --- Expense Detail Modal ---

const ExpenseDetailModal = ({ isOpen, onClose, expense, onEdit, onDelete, categories, users }: {
  isOpen: boolean,
  onClose: () => void,
  expense: Expense | null,
  onEdit: (expense: Expense) => void,
  onDelete: (expense: Expense) => void,
  categories: Category[],
  users: User[]
}) => {
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setIsImageViewerOpen(false);
    }
  }, [isOpen]);

  useLockBodyScroll(isOpen && !!expense);

  if (!expense) return null;
  const owner = users.find(u => u.id === expense.userId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200]"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="fixed inset-4 m-auto max-w-sm h-fit surface-modal backdrop-blur-lg rounded-[40px] p-8 sm:p-10 z-[201] flex flex-col items-center text-center border border-white/10"
          >
            <button 
              onClick={onClose} 
              className="absolute top-6 right-6 p-2.5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-95 transition-all"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>

            <h2 className="text-3xl sm:text-4xl font-light tracking-tight mb-1 text-white mt-4">
              {formatCurrency(expense.value).split(',')[0]}
              <span className="text-lg opacity-40">,{formatCurrency(expense.value).split(',')[1]}</span>
            </h2>
            <h3 className="text-lg font-bold mb-8 text-white/90 leading-snug px-2">{expense.name}</h3>

            <div className="w-full space-y-3.5 text-left mb-8 overflow-y-auto max-h-[28vh] pr-1 scrollbar-none">
              <div className="p-4 bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors rounded-2xl flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">CATEGORIA</p>
                  <p className="font-bold text-sm text-white">{expense.category}</p>
                </div>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categories.find(c => c.name === expense.category)?.color || '#fff' }} />
              </div>

              <div className="p-4 bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors rounded-2xl">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">RESPONSÁVEL</p>
                <p className="font-bold text-sm text-white">{owner?.name}</p>
              </div>

              <div className="p-4 bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors rounded-2xl">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">DATA DO REGISTRO</p>
                <p className="font-bold text-sm text-white tracking-tight">
                  {new Date(expense.createdAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
                </p>
              </div>

              {expense.note && (
                <div className="p-4 bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-colors rounded-2xl">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-0.5">OBSERVAÇÕES</p>
                  <p className="text-white/70 italic text-xs leading-relaxed break-words whitespace-pre-wrap [word-break:break-word]">"{expense.note}"</p>
                </div>
              )}
            </div>

            {expense.attachmentUrl ? (
              <div className="w-full mb-6">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 text-left mb-2 ml-1">Anexo Comprovante</p>
                <div 
                  onClick={() => setIsImageViewerOpen(true)}
                  className="w-full h-16 rounded-2xl border border-white/10 overflow-hidden bg-black/40 group relative flex items-center justify-between px-4 cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={expense.attachmentUrl} 
                      alt="Comprovante" 
                      className="w-10 h-10 object-cover rounded-lg border border-white/10 group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Ver Comprovante</span>
                  </div>
                  <Search className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                </div>
              </div>
            ) : (
              <div className="w-full h-14 bg-white/[0.01] hover:bg-white/[0.02] border border-dashed border-white/5 rounded-2xl flex items-center gap-4 px-5 text-white/20 mb-6 font-medium">
                 <Camera className="w-5 h-5 opacity-30" />
                 <span className="text-[9px] font-bold uppercase tracking-widest">Sem Anexo Digital</span>
              </div>
            )}

            <div className="w-full grid grid-cols-2 gap-3.5">
              <button 
                onClick={() => onEdit(expense)}
                className="h-14 bg-gradient-to-r from-blue-500 to-indigo-600 hover:brightness-110 active:scale-95 transition-all text-white font-bold rounded-2xl shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-pointer"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button 
                onClick={() => onDelete(expense)}
                className="h-14 bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25 hover:text-red-300 font-bold rounded-2xl active:scale-[0.97] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </div>
          </motion.div>

          {/* Lightbox / Full screen photo viewer */}
          <AnimatePresence>
            {isImageViewerOpen && expense.attachmentUrl && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsImageViewerOpen(false)}
                  className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4"
                >
                  <button 
                    onClick={() => setIsImageViewerOpen(false)}
                    className="absolute top-6 right-6 p-3 bg-white/10 rounded-full hover:bg-white/20 text-white transition-all active:scale-95 z-[320] cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>

                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="max-w-xl max-h-[80vh] overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-slate-900 relative z-[310] flex items-center justify-center"
                  >
                    <img 
                      src={expense.attachmentUrl} 
                      alt="Comprovante de pagamento" 
                      className="max-w-full max-h-[80vh] object-contain rounded-3xl"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

// --- Expense Row (memoizado para evitar re-render em mudanças de estado não relacionadas) ---

interface ExpenseRowProps {
  expense: Expense;
  categoryColor: string | undefined;
  ownerName: string | undefined;
  idx: number;
  pageSize: number;
  onSelect: (e: Expense) => void;
}

const ExpenseRow = memo(({ expense, categoryColor, ownerName, idx, pageSize, onSelect }: ExpenseRowProps) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.25, delay: (idx % pageSize) * 0.04 }}
    onClick={() => onSelect(expense)}
    className="interactive-glass rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 flex items-center justify-between cursor-pointer group gap-4"
  >
    <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
      <div
        className="w-2.5 h-2.5 rounded-full shadow-[0_0_12px_currentcolor] shrink-0"
        style={{ backgroundColor: categoryColor, color: categoryColor }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h4 className="font-bold text-sm leading-tight truncate group-hover:text-blue-400 transition-colors">{expense.name}</h4>
          <div className="flex items-center gap-2.5 shrink-0">
            {expense.pending && (
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Pendente
              </span>
            )}
            {expense.attachmentUrl && <Paperclip className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
            <p className="font-bold text-sm tracking-tight">{formatCurrency(expense.value)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[9px] sm:text-[10px] text-white/20 font-black uppercase tracking-widest">
            {new Date(expense.expenseDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </p>
          <span className="w-0.5 h-0.5 rounded-full bg-white/5" />
          <p className="text-[9px] sm:text-[10px] text-white/20 font-black uppercase tracking-widest">{expense.category}</p>
          {ownerName && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-white/5" />
              <p className="text-[9px] sm:text-[10px] text-white/20 font-black uppercase tracking-widest truncate">
                por {ownerName}
              </p>
            </>
          )}
        </div>
        {expense.note && (
          <p className="text-xs text-white/50 mt-1 leading-relaxed break-words whitespace-pre-wrap [word-break:break-word]">{expense.note}</p>
        )}
      </div>
    </div>
  </motion.div>
));

// --- Dashboard Screen ---

const ptBRMonths = [
  { value: "0", label: "Janeiro" },
  { value: "1", label: "Fevereiro" },
  { value: "2", label: "Março" },
  { value: "3", label: "Abril" },
  { value: "4", label: "Maio" },
  { value: "5", label: "Junho" },
  { value: "6", label: "Julho" },
  { value: "7", label: "Agosto" },
  { value: "8", label: "Setembro" },
  { value: "9", label: "Outubro" },
  { value: "10", label: "Novembro" },
  { value: "11", label: "Dezembro" }
];

const DashboardScreen = ({ user, onLogout, onProfileUpdate, theme, onToggleTheme }: { user: User, onLogout: () => void, onProfileUpdate: (u: User) => void, theme: 'dark' | 'light', onToggleTheme: () => void }) => {
  // Snapshot-first: hidrata com os dados do último acesso (abertura instantânea,
  // inclusive offline); a rede atualiza por baixo quando responder
  const bootSnap = useMemo(() => loadSnapshot(), []);
  const [expenses, setExpenses] = useState<Expense[]>(bootSnap?.expenses ?? []);
  const [categories, setCategories] = useState<Category[]>(bootSnap?.categories ?? []);
  const [users, setUsers] = useState<User[]>(bootSnap?.users?.length ? bootSnap.users : [user]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [dataLoading, setDataLoading] = useState(!bootSnap);
  const [dataError, setDataError] = useState<string | null>(null);

  // Mescla os pendentes da fila offline nos dados hidratados
  useEffect(() => {
    getQueuedAsExpenses().then(q => {
      if (q.length) {
        setExpenses(prev => [...q.filter(x => !prev.some(p => p.id === x.id)), ...prev]);
      }
    }).catch(() => {});
  }, []);

  const loadData = () => {
    if (!bootSnap) setDataLoading(true); // spinner só na primeira vez, sem cache
    setDataError(null);
    Promise.all([db.getExpenses(), db.getCategories(), db.getUsers(), db.getAppSettings(), getQueuedAsExpenses(), db.getBills()])
      .then(([exps, cats, usrs, settings, queued, bls]) => {
        setExpenses([...queued, ...exps]);
        setCategories(cats);
        setUsers(usrs.length ? usrs : [user]);
        setBills(bls);
        setNotificationTitle(settings.notificationTitle);
        setNotificationMessage(settings.notificationMessage);
        saveSnapshot(exps, cats, usrs.length ? usrs : [user]);
      })
      .catch((err) => {
        console.error(err);
        // Sem rede: mantém o que já está na tela (snapshot); erro só sem nenhum dado
        if (bootSnap) return;
        const snap = loadSnapshot();
        if (snap) {
          setExpenses(snap.expenses);
          setCategories(snap.categories);
          setUsers(snap.users.length ? snap.users : [user]);
          return;
        }
        setDataError('Não foi possível carregar os dados. Verifique sua conexão.');
      })
      .finally(() => setDataLoading(false));
  };

  useEffect(() => { loadData(); }, [user.id]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('notifications_enabled') === 'true';
  });
  const [notificationTime, setNotificationTime] = useState(() => {
    return localStorage.getItem('notification_time') || '20:00';
  });
  // Título/mensagem das notificações agora vêm do Supabase (compartilhado pelo time)
  const [notificationTitle, setNotificationTitle] = useState('Gastos Queymeli e Thiago');
  const [notificationMessage, setNotificationMessage] = useState('Você lembrou de anotar os seus gastos hoje?');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNotificationsToggle = (enabledVal: boolean) => {
    setNotificationsEnabled(enabledVal);
    localStorage.setItem('notifications_enabled', enabledVal ? 'true' : 'false');
  };

  const handleNotificationsTimeChange = (timeVal: string) => {
    setNotificationTime(timeVal);
    localStorage.setItem('notification_time', timeVal);
  };

  // Debounced save para Supabase — evita uma requisição por tecla digitada
  const scheduleSettingsSave = (updates: Partial<db.AppSettings>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      db.updateAppSettings(updates, user.id).catch(err => console.error('Falha ao salvar config:', err));
    }, 600);
  };

  const handleNotificationTitleChange = (val: string) => {
    setNotificationTitle(val);
    scheduleSettingsSave({ notificationTitle: val });
  };

  const handleNotificationMessageChange = (val: string) => {
    setNotificationMessage(val);
    scheduleSettingsSave({ notificationMessage: val });
  };

  // Salva / atualiza subscription de push no Supabase (servidor envia notificação no horário certo)
  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    const title = notificationTitle.trim() || 'Gastos Queymeli e Thiago';
    const message = notificationMessage.trim() || 'Você lembrou de anotar os seus gastos hoje?';

    navigator.serviceWorker.ready.then(async (reg) => {
      try {
        // Converte a chave pública VAPID de base64url para Uint8Array
        const vapidKey = db.VAPID_PUBLIC_KEY;
        const padding = '='.repeat((4 - vapidKey.length % 4) % 4);
        const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawKey = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

        // Subscreve (ou reutiliza subscrição existente)
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: rawKey,
          });
        }

        if (notificationsEnabled) {
          await db.upsertPushSubscription(user.id, sub, {
            time: notificationTime,
            title,
            message,
            enabled: true,
          });
        } else {
          await db.disablePushSubscription(user.id);
        }
      } catch (err) {
        console.error('Erro ao registrar push subscription:', err);
      }
    });
  }, [notificationsEnabled, notificationTime, notificationTitle, notificationMessage, user.id]);

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [view, setView] = useState<'overview' | 'list' | 'month' | 'bills'>('overview');
  const [monthDrillMonth, setMonthDrillMonth] = useState<{ year: number; month: number; label: string } | null>(null);
  const [monthDrillCategory, setMonthDrillCategory] = useState<string | null>(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [billToPay, setBillToPay] = useState<Bill | null>(null);

  // Conexão: banner offline + sincronização da fila quando a rede volta
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    flushQueue(user.id)
      .then((synced) => {
        if (synced > 0) {
          // Troca os itens offline pelos registros reais do servidor
          Promise.all([db.getExpenses(), getQueuedAsExpenses()])
            .then(([fresh, queued]) => setExpenses([...queued, ...fresh]))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [isOnline, user.id]);

  // Esconde header ao rolar para baixo, só volta quando chega no topo
  const [headerVisible, setHeaderVisible] = useState(true);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 10) setHeaderVisible(true);
      else setHeaderVisible(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Atualiza lançamentos silenciosamente ao entrar na aba (sem spinner),
  // mesclando os pendentes da fila offline
  useEffect(() => {
    if (view === 'list') {
      Promise.all([db.getExpenses(), getQueuedAsExpenses()])
        .then(([fresh, queued]) => setExpenses([...queued, ...fresh]))
        .catch(() => {});
    }
  }, [view]);

  const handleEdit = (expense: Expense) => {
    if (!navigator.onLine || expense.pending || expense.id.startsWith('offline-')) {
      alert('Edição disponível quando a conexão voltar.');
      return;
    }
    setExpenseToEdit(expense);
    setSelectedExpense(null);
    setIsModalOpen(true);
  };

  const handleDelete = (expense: Expense) => {
    if (!navigator.onLine || expense.pending || expense.id.startsWith('offline-')) {
      alert('Exclusão disponível quando a conexão voltar.');
      return;
    }
    setExpenseToDelete(expense);
  };

  const handleSaveExpense = useCallback(async (newExpenseData: Omit<Expense, 'id' | 'userId' | 'createdAt'> & { id?: string, photoBlob?: File | null }) => {
    const { photoBlob, ...expenseData } = newExpenseData;

    if (expenseData.id) {
      const { id, ...updates } = expenseData;
      await db.updateExpense(id!, updates);
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      return;
    }

    const enqueue = async () => {
      const { attachmentUrl: _drop, ...rest } = expenseData;
      const tempId = await queueExpense({ ...rest, userId: user.id }, photoBlob ?? null);
      const local: Expense = {
        ...rest,
        id: tempId,
        userId: user.id,
        createdAt: new Date().toISOString(),
        attachmentUrl: undefined,
        pending: true,
      };
      setExpenses(prev => [local, ...prev]);
    };

    if (!navigator.onLine || photoBlob) {
      // Offline (ou foto pendente de upload) → entra na fila de sincronização
      await enqueue();
      return;
    }

    try {
      const created = await db.createExpense({ ...expenseData, userId: user.id });
      setExpenses(prev => [created, ...prev]);
    } catch {
      // Falha de rede no salvar → não perde o lançamento, vai para a fila
      await enqueue();
    }
  }, [user.id]);

  const handleAddCategory = useCallback(async (name: string) => {
    if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())) return;
    const colors = ["#f87171", "#60a5fa", "#c084fc", "#4ade80", "#fbbf24", "#f472b6", "#2dd4bf", "#fb923c"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newCat = { name, color: randomColor, initials: name.substring(0, 2).toUpperCase() };
    const created = await db.createCategory(newCat, user.id);
    setCategories(prev => [...prev, created]);
  }, [categories, user.id]);

  const handleEditCategory = useCallback(async (oldName: string, newName: string) => {
    if (categories.find(c => c.name.toLowerCase() === newName.toLowerCase())) return;
    const cat = categories.find(c => c.name === oldName);
    if (!cat?.id) return;
    const updatedInitials = newName.substring(0, 2).toUpperCase();
    await db.updateCategory(cat.id, { name: newName, initials: updatedInitials });
    await db.updateExpensesCategoryName(oldName, newName);
    setCategories(prev => prev.map(c => c.name === oldName ? { ...c, name: newName, initials: updatedInitials } : c));
    setExpenses(prev => prev.map(e => e.category === oldName ? { ...e, category: newName } : e));
  }, [categories]);

  const handleDeleteCategory = useCallback(async (name: string) => {
    if (categories.length <= 1) return;
    const cat = categories.find(c => c.name === name);
    if (!cat?.id) return;
    await db.deleteCategory(cat.id);
    setCategories(prev => prev.filter(c => c.name !== name));
  }, [categories]);

  const handleChangeCategoryColor = useCallback(async (name: string, color: string) => {
    const cat = categories.find(c => c.name === name);
    if (!cat?.id) return;
    // Update local state imediato pra UX fluida enquanto o color picker está sendo arrastado
    setCategories(prev => prev.map(c => c.name === name ? { ...c, color } : c));
    await db.updateCategory(cat.id, { color });
  }, [categories]);

  const confirmDelete = useCallback(async () => {
    if (expenseToDelete) {
      await db.deleteExpense(expenseToDelete.id);
      setExpenses(prev => prev.filter(e => e.id !== expenseToDelete.id));
      setExpenseToDelete(null);
      setSelectedExpense(null);
    }
  }, [expenseToDelete]);

  const handleSaveBill = useCallback(async (data: { name: string; value: number; dueDay: number; category: string; isRecurring: boolean }) => {
    if (billToEdit) {
      await db.updateBill(billToEdit.id, data);
      setBills(prev => prev.map(b => b.id === billToEdit.id ? { ...b, ...data } : b));
    } else {
      const created = await db.createBill(data, user.id);
      setBills(prev => [...prev, created]);
    }
    setBillToEdit(null);
  }, [billToEdit, user.id]);

  const confirmDeleteBill = useCallback(async () => {
    if (!billToDelete) return;
    await db.deleteBill(billToDelete.id);
    setBills(prev => prev.filter(b => b.id !== billToDelete.id));
    setBillToDelete(null);
    setBillToEdit(null);
  }, [billToDelete]);

  const handlePayBill = useCallback(async (bill: Bill, file: File | null) => {
    let attachmentUrl: string | undefined;
    if (file) {
      attachmentUrl = await db.uploadReceipt(file, user.id);
    }
    const { expense, yearMonth } = await db.payBill(bill, user.id, attachmentUrl);
    setBills(prev => prev.map(b =>
      b.id === bill.id ? { ...b, lastPaidYearMonth: yearMonth, lastPaidExpenseId: expense.id } : b
    ));
    setExpenses(prev => [expense, ...prev]);
  }, [user.id]);

  const handleUnpayBill = useCallback(async (bill: Bill) => {
    const removedExpenseId = bill.lastPaidExpenseId;
    await db.unpayBill(bill);
    setBills(prev => prev.map(b =>
      b.id === bill.id ? { ...b, lastPaidYearMonth: null, lastPaidExpenseId: null } : b
    ));
    if (removedExpenseId) {
      setExpenses(prev => prev.filter(e => e.id !== removedExpenseId));
    }
  }, []);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const currentYearMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const [selectedMonthFilter, setSelectedMonthFilter] = useState(currentYearMonth);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isMonthFilterOpen, setIsMonthFilterOpen] = useState(false);
  const [isSortOrderOpen, setIsSortOrderOpen] = useState(false);

  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Callback ref: quando o sentinela monta no DOM o estado muda e o effect dispara garantido.
  // useRef NÃO funciona aqui porque AnimatePresence atrasa a montagem e o effect
  // roda antes do elemento existir, então ref.current fica null indefinidamente.
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);

  const availableMonths = useMemo(() => {
    const seen = new Map<string, string>(); // key "YYYY-M" → label
    expenses.forEach(e => {
      try {
        const d = new Date(e.expenseDate + 'T12:00:00');
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!seen.has(key)) {
          const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
          seen.set(key, label.charAt(0).toUpperCase() + label.slice(1));
        }
      } catch (_) {}
    });
    // Ordenar do mais recente para o mais antigo
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [expenses]);

  // Categorias visíveis para este usuário (restrição por allowedCategories)
  const visibleCategories = useMemo(() => {
    if (!user.allowedCategories || user.allowedCategories.length === 0) return categories;
    return categories.filter(c => user.allowedCategories!.includes(c.name));
  }, [categories, user.allowedCategories]);

  const filteredAndSortedExpenses = useMemo(() => {
    let result = [...expenses];

    // Restrição por allowedCategories do usuário
    if (user.allowedCategories && user.allowedCategories.length > 0) {
      result = result.filter(e => user.allowedCategories!.includes(e.category));
    }

    // 1. Search Query — usa debouncedSearch (não recalcula a cada tecla)
    if (debouncedSearch.trim() !== "") {
      const q = debouncedSearch.toLowerCase().trim();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }

    // 2. Category Filter
    if (selectedCategoryFilter !== "all") {
      result = result.filter(e => e.category === selectedCategoryFilter);
    }

    // 2.5 Month Filter
    if (selectedMonthFilter !== "all") {
      result = result.filter(e => {
        const d = new Date(e.expenseDate + 'T12:00:00');
        return `${d.getFullYear()}-${d.getMonth()}` === selectedMonthFilter;
      });
    }

    // 3. Sort by values
    if (sortOrder === 'asc') {
      result.sort((a, b) => a.value - b.value);
    } else if (sortOrder === 'desc') {
      result.sort((a, b) => b.value - a.value);
    }

    return result;
  }, [expenses, debouncedSearch, selectedCategoryFilter, selectedMonthFilter, sortOrder]);

  // Soma dos resultados filtrados (exibida na barra de total da busca)
  const searchTotal = useMemo(
    () => filteredAndSortedExpenses.reduce((sum, e) => sum + e.value, 0),
    [filteredAndSortedExpenses]
  );

  // O(1) lookup maps — evita scan linear em cada render para cada linha da lista
  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const categoryColorByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.name, c.color);
    return m;
  }, [categories]);

  // Stats em uma única passada por expenses, em vez de filter+reduce por categoria
  const stats = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      totals.set(e.category, (totals.get(e.category) ?? 0) + e.value);
    }
    return categories.map(cat => ({
      name: cat.name,
      total: totals.get(cat.name) ?? 0,
      color: cat.color,
      initials: cat.initials,
    }));
  }, [expenses, categories]);

  const totalAmount = useMemo(() => stats.reduce((sum, s) => sum + s.total, 0), [stats]);

  const currentMonthTotal = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return expenses
      .filter(e => {
        const d = new Date(e.expenseDate + 'T12:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      })
      .reduce((sum, e) => sum + e.value, 0);
  }, [expenses]);

  const last7DaysTotal = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return expenses
      .filter(e => new Date(e.expenseDate + 'T12:00:00') >= sevenDaysAgo)
      .reduce((sum, e) => sum + e.value, 0);
  }, [expenses]);

  const monthlyTotals = useMemo(() => {
    const map = new Map<string, { label: string; total: number; count: number; year: number; month: number }>();
    expenses.forEach(e => {
      const d = new Date(e.expenseDate + 'T12:00:00');
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const rawLabel = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      const existing = map.get(key);
      if (existing) {
        existing.total += e.value;
        existing.count += 1;
      } else {
        map.set(key, { label, total: e.value, count: 1, year: d.getFullYear(), month: d.getMonth() });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [expenses]);

  const monthlyGrandTotal = useMemo(
    () => monthlyTotals.reduce((sum, m) => sum + m.total, 0),
    [monthlyTotals]
  );

  const drillCategories = useMemo(() => {
    if (!monthDrillMonth) return [];
    const map = new Map<string, { name: string; total: number; count: number; color: string }>();
    expenses.forEach(e => {
      const d = new Date(e.expenseDate + 'T12:00:00');
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() !== monthDrillMonth.year || d.getMonth() !== monthDrillMonth.month) return;
      const catObj = categories.find(c => c.name === e.category);
      const color = catObj?.color ?? '#94a3b8';
      const existing = map.get(e.category);
      if (existing) {
        existing.total += e.value;
        existing.count += 1;
      } else {
        map.set(e.category, { name: e.category, total: e.value, count: 1, color });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, monthDrillMonth, categories]);

  const drillExpenses = useMemo(() => {
    if (!monthDrillMonth || !monthDrillCategory) return [];
    return expenses
      .filter(e => {
        const d = new Date(e.expenseDate + 'T12:00:00');
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === monthDrillMonth.year
          && d.getMonth() === monthDrillMonth.month
          && e.category === monthDrillCategory;
      })
      .sort((a, b) => b.value - a.value);
  }, [expenses, monthDrillMonth, monthDrillCategory]);

  useEffect(() => {
    if (view !== 'month') {
      setMonthDrillMonth(null);
      setMonthDrillCategory(null);
    }
  }, [view]);

  // useScroll/useTransform removidos — parallax JS causava jank no mobile

  // Debounce da busca — evita recalcular lista a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset paginação quando filtros/busca mudam
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, selectedCategoryFilter, selectedMonthFilter, sortOrder]);

  // Effect 1 — verifica imediatamente após render se o sentinela já está visível.
  // Cobre o caso de 10 itens não preencherem a tela (sem precisar rolar).
  useEffect(() => {
    if (!sentinelEl) return;
    const rect = sentinelEl.getBoundingClientRect();
    if (rect.top < window.innerHeight + 300) {
      setVisibleCount(prev => {
        if (prev >= filteredAndSortedExpenses.length) return prev;
        return Math.min(prev + PAGE_SIZE, filteredAndSortedExpenses.length);
      });
    }
  }, [sentinelEl, visibleCount, filteredAndSortedExpenses.length]);

  // Effect 2 — scroll listener para carregar conforme o usuário rola.
  useEffect(() => {
    if (!sentinelEl) return;
    const check = () => {
      const rect = sentinelEl.getBoundingClientRect();
      if (rect.top < window.innerHeight + 300) {
        setVisibleCount(prev => {
          if (prev >= filteredAndSortedExpenses.length) return prev;
          return Math.min(prev + PAGE_SIZE, filteredAndSortedExpenses.length);
        });
      }
    };
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [sentinelEl, filteredAndSortedExpenses.length]);

  // ─── Early returns AFTER all hooks ───────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-white/30 text-xs font-bold uppercase tracking-widest">Carregando dados...</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="text-center space-y-2">
          <p className="font-bold text-white">{dataError}</p>
          <p className="text-white/40 text-sm">Tente novamente ou verifique as configurações do Supabase.</p>
        </div>
        <button
          onClick={loadData}
          className="h-12 px-8 btn-gradient rounded-2xl font-bold text-sm text-white active:scale-95 transition-all"
        >
          Tentar Novamente
        </button>
        <button onClick={onLogout} className="text-xs text-white/30 hover:text-white/60 transition-colors font-bold">
          Sair da Conta
        </button>
      </div>
    );
  }

  const handleSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    (e.currentTarget as any)._swipeX = t.clientX;
    (e.currentTarget as any)._swipeY = t.clientY;
  };

  const handleSwipeEnd = (e: React.TouchEvent) => {
    const el = e.currentTarget as any;
    const dx = e.changedTouches[0].clientX - el._swipeX;
    const dy = Math.abs(e.changedTouches[0].clientY - el._swipeY);
    if (Math.abs(dx) > 60 && dy < 80) {
      const order: Array<'overview' | 'list' | 'month' | 'bills'> = ['overview', 'list', 'month', 'bills'];
      const idx = order.indexOf(view);
      if (dx < 0 && idx < order.length - 1) setView(order[idx + 1]);
      else if (dx > 0 && idx > 0) setView(order[idx - 1]);
    }
  };

  return (
    <div
      className="pb-32 pt-0 min-h-screen"
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      {/* Header */}
      <header className={`fixed top-0 inset-x-0 glass border-b border-white/5 px-6 py-5 flex items-center justify-between z-[80] backdrop-blur-lg transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="w-10 h-10 rounded-full shadow-lg select-none" />
          <div>
            <h1 className="text-base font-bold tracking-tight">Gastos Queymeli e Thiago</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2.5 glass rounded-xl"
          >
            <Menu className="w-5 h-5 text-white/40" />
          </button>

          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-3 w-56 surface-modal backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl p-2 z-[90] overflow-hidden">
                <button
                  onClick={() => {
                    setIsProfileOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-white/10" />
                  ) : (
                    <UserIcon className="w-4 h-4" />
                  )}
                  <span>Perfil</span>
                </button>

                <button
                  onClick={() => {
                    setIsSettingsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  <Settings className="w-4 h-4" />
                  <span>Categorias</span>
                </button>

                <button
                  onClick={() => {
                    setIsExportOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Relatório</span>
                </button>

                <button
                  onClick={() => {
                    setIsNotificationsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  <Bell className="w-4 h-4" />
                  <span>Notificações</span>
                </button>

                <button
                  onClick={() => {
                    onToggleTheme();
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span>{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
                </button>

                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold text-white/60 text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sair da Conta</span>
                </button>
              </div>
          )}
        </div>
      </header>

      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-[85] mt-[72px] bg-amber-500/15 border-b border-amber-500/20 backdrop-blur-lg px-6 py-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
            Sem conexão — lançamentos serão sincronizados depois
          </p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 pt-28">
        {/* View Switcher Refined */}
        <div className={`flex p-1.5 glass rounded-2xl mb-10 sticky z-[70] backdrop-blur-lg transition-all duration-300 ${headerVisible ? 'top-[72px]' : 'top-2'}`}>
          <button 
            onClick={() => setView('overview')}
            className={cn(
              "flex-1 py-3 px-2 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 transition-all",
              view === 'overview' ? "bg-white/10 text-white shadow-xl" : "text-white/40 hover:text-white/60"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-xs sm:text-sm font-bold">Home</span>
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              "flex-1 py-3 px-2 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 transition-all",
              view === 'list' ? "bg-white/10 text-white shadow-xl" : "text-white/40 hover:text-white/60"
            )}
          >
            <List className="w-4 h-4" />
            <span className="text-xs sm:text-sm font-bold">Lista</span>
          </button>
          <button
            onClick={() => setView('month')}
            className={cn(
              "flex-1 py-3 px-2 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 transition-all",
              view === 'month' ? "bg-white/10 text-white shadow-xl" : "text-white/40 hover:text-white/60"
            )}
          >
            <Calendar className="w-4 h-4" />
            <span className="text-xs sm:text-sm font-bold">Mês</span>
          </button>
          <button
            onClick={() => setView('bills')}
            className={cn(
              "flex-1 py-3 px-2 sm:px-4 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 transition-all",
              view === 'bills' ? "bg-white/10 text-white shadow-xl" : "text-white/40 hover:text-white/60"
            )}
          >
            <Wallet className="w-4 h-4" />
            <span className="text-xs sm:text-sm font-bold">Contas</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {view === 'bills' ? (
            <motion.div
              key="bills"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="space-y-6"
            >
              {(() => {
                const currentYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                const isPaid = (b: Bill) =>
                  b.isRecurring
                    ? b.lastPaidYearMonth === currentYm
                    : b.lastPaidYearMonth !== null;
                const visible = bills.filter(b =>
                  b.isRecurring || b.lastPaidYearMonth === null || b.lastPaidYearMonth === currentYm
                );
                const unpaid = visible.filter(b => !isPaid(b)).sort((a, b) => a.dueDay - b.dueDay);
                const paid = visible.filter(b => isPaid(b)).sort((a, b) => a.dueDay - b.dueDay);
                const ordered = [...unpaid, ...paid];
                const totalMonth = visible.reduce((s, b) => s + b.value, 0);
                const totalPaid = paid.reduce((s, b) => s + b.value, 0);
                const totalRemaining = totalMonth - totalPaid;
                const pctPaid = totalMonth > 0 ? (totalPaid / totalMonth) * 100 : 0;
                return (
                  <>
                    {/* Card de totais */}
                    <GlassCard className="p-6 sm:p-8">
                      <div className="flex justify-between items-center mb-5 px-1">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Contas do Mês
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                          {visible.length} {visible.length === 1 ? 'conta' : 'contas'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-5">
                        <div className="glass rounded-2xl p-3 sm:p-4 text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Total</p>
                          <p className="text-sm sm:text-base font-light text-white tracking-tight truncate">
                            {formatCurrency(totalMonth).split(',')[0]}
                            <span className="opacity-30 text-xs">,{formatCurrency(totalMonth).split(',')[1]}</span>
                          </p>
                        </div>
                        <div className="glass rounded-2xl p-3 sm:p-4 text-center border border-emerald-500/10">
                          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400/70 mb-2">Pago</p>
                          <p className="text-sm sm:text-base font-light text-emerald-400 tracking-tight truncate">
                            {formatCurrency(totalPaid).split(',')[0]}
                            <span className="opacity-40 text-xs">,{formatCurrency(totalPaid).split(',')[1]}</span>
                          </p>
                        </div>
                        <div className="glass rounded-2xl p-3 sm:p-4 text-center border border-amber-500/10">
                          <p className="text-[8px] font-black uppercase tracking-widest text-amber-400/70 mb-2">Falta</p>
                          <p className="text-sm sm:text-base font-light text-amber-400 tracking-tight truncate">
                            {formatCurrency(totalRemaining).split(',')[0]}
                            <span className="opacity-40 text-xs">,{formatCurrency(totalRemaining).split(',')[1]}</span>
                          </p>
                        </div>
                      </div>

                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pctPaid}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-2 text-right">
                        {pctPaid.toFixed(0)}% pago
                      </p>
                    </GlassCard>

                    {/* Lista de contas */}
                    <GlassCard className="p-4 sm:p-6">
                      {ordered.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-sm font-bold text-white/30">Nenhuma conta cadastrada</p>
                          <p className="text-[11px] text-white/20 mt-1">Toque no + pra adicionar sua primeira conta</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {ordered.map(b => {
                            const paid = isPaid(b);
                            const catObj = categories.find(c => c.name === b.category);
                            const catColor = catObj?.color ?? '#94a3b8';
                            return (
                              <div
                                key={b.id}
                                className={cn(
                                  "glass rounded-2xl p-4 flex items-center gap-3 transition-all",
                                  paid && "opacity-40"
                                )}
                              >
                                <button
                                  onClick={() => setBillToPay(b)}
                                  className={cn(
                                    "w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90",
                                    paid ? "bg-emerald-500 border-emerald-500" : "border-white/20 hover:border-white/40"
                                  )}
                                  aria-label={paid ? "Marcar como não paga" : "Marcar como paga"}
                                >
                                  {paid && <Check className="w-4 h-4 text-white stroke-[3]" />}
                                </button>

                                <button
                                  onClick={() => { setBillToEdit(b); setBillModalOpen(true); }}
                                  className="flex-1 min-w-0 text-left"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className={cn(
                                      "text-sm font-bold text-white truncate",
                                      paid && "line-through"
                                    )}>{b.name}</p>
                                    {b.isRecurring && (
                                      <Repeat className="w-3 h-3 text-blue-400 shrink-0" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span
                                      className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                                      style={{ backgroundColor: `${catColor}20`, color: catColor }}
                                    >
                                      {b.category}
                                    </span>
                                    <span className="text-[10px] font-bold text-white/40">
                                      Vence dia {b.dueDay}
                                    </span>
                                  </div>
                                </button>

                                <div className="text-right shrink-0">
                                  <p className={cn(
                                    "text-base font-light tracking-tight text-white",
                                    paid && "line-through"
                                  )}>
                                    {formatCurrency(b.value).split(',')[0]}
                                    <span className="opacity-30 text-xs">,{formatCurrency(b.value).split(',')[1]}</span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button
                        onClick={() => { setBillToEdit(null); setBillModalOpen(true); }}
                        className="mt-4 w-full h-12 btn-gradient rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-all text-white flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Conta
                      </button>
                    </GlassCard>
                  </>
                );
              })()}
            </motion.div>
          ) : view === 'month' ? (
            <motion.div
              key="month"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="space-y-6"
            >
              <GlassCard className="p-6 sm:p-8">
                {/* Breadcrumb + botão voltar */}
                {(monthDrillMonth || monthDrillCategory) && (
                  <div className="flex items-center gap-3 mb-5">
                    <button
                      onClick={() => {
                        if (monthDrillCategory) setMonthDrillCategory(null);
                        else setMonthDrillMonth(null);
                      }}
                      className="p-2 glass rounded-xl hover:bg-white/5 transition-colors active:scale-95"
                      aria-label="Voltar"
                    >
                      <ChevronLeft className="w-4 h-4 text-white/60" />
                    </button>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider min-w-0">
                      <button
                        onClick={() => { setMonthDrillMonth(null); setMonthDrillCategory(null); }}
                        className="text-white/40 hover:text-white/70 transition-colors truncate"
                      >
                        Meses
                      </button>
                      {monthDrillMonth && (
                        <>
                          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                          <button
                            onClick={() => setMonthDrillCategory(null)}
                            className={cn(
                              "truncate transition-colors",
                              monthDrillCategory ? "text-white/40 hover:text-white/70" : "text-white"
                            )}
                          >
                            {monthDrillMonth.label}
                          </button>
                        </>
                      )}
                      {monthDrillCategory && (
                        <>
                          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                          <span className="text-white truncate">{monthDrillCategory}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* NÍVEL 1: Lista de meses */}
                {!monthDrillMonth && (
                  <>
                    <div className="flex justify-between items-center mb-6 px-2">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        Totais por Mês
                      </h3>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                        {monthlyTotals.length} {monthlyTotals.length === 1 ? 'mês' : 'meses'}
                      </span>
                    </div>

                    {monthlyTotals.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-sm font-bold text-white/30">Nenhum lançamento ainda</p>
                        <p className="text-[11px] text-white/20 mt-1">Adicione seu primeiro gasto pra ver os totais mensais</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {monthlyTotals.map(m => {
                          const pct = monthlyGrandTotal > 0 ? (m.total / monthlyGrandTotal) * 100 : 0;
                          return (
                            <button
                              key={`${m.year}-${m.month}`}
                              onClick={() => setMonthDrillMonth({ year: m.year, month: m.month, label: m.label })}
                              className="w-full text-left glass rounded-2xl p-4 sm:p-5 hover:bg-white/5 active:scale-[0.99] transition-all"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div className="min-w-0 flex items-center gap-2">
                                  <div>
                                    <p className="text-sm font-bold text-white truncate">{m.label}</p>
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                                      {m.count} {m.count === 1 ? 'lançamento' : 'lançamentos'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-3">
                                  <div className="text-right">
                                    <p className="text-lg sm:text-xl font-light tracking-tight text-white">
                                      {formatCurrency(m.total).split(',')[0]}
                                      <span className="text-xs opacity-30">,{formatCurrency(m.total).split(',')[1]}</span>
                                    </p>
                                    <p className="text-[10px] font-bold text-white/30 mt-0.5">{pct.toFixed(1)}%</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-white/30" />
                                </div>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full btn-gradient rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {monthlyTotals.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center px-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total geral</span>
                        <span className="text-lg font-light tracking-tight text-white">
                          {formatCurrency(monthlyGrandTotal).split(',')[0]}
                          <span className="text-xs opacity-30">,{formatCurrency(monthlyGrandTotal).split(',')[1]}</span>
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* NÍVEL 2: Categorias do mês selecionado */}
                {monthDrillMonth && !monthDrillCategory && (() => {
                  const monthTotal = drillCategories.reduce((s, c) => s + c.total, 0);
                  return (
                    <>
                      <div className="flex justify-between items-center mb-6 px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          Categorias
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                          {drillCategories.length} {drillCategories.length === 1 ? 'categoria' : 'categorias'}
                        </span>
                      </div>

                      {drillCategories.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-sm font-bold text-white/30">Nenhum gasto neste mês</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {drillCategories.map(c => {
                            const pct = monthTotal > 0 ? (c.total / monthTotal) * 100 : 0;
                            return (
                              <button
                                key={c.name}
                                onClick={() => setMonthDrillCategory(c.name)}
                                className="w-full text-left glass rounded-2xl p-4 sm:p-5 hover:bg-white/5 active:scale-[0.99] transition-all"
                              >
                                <div className="flex justify-between items-start mb-3">
                                  <div className="min-w-0 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                                    <div>
                                      <p className="text-sm font-bold text-white truncate">{c.name}</p>
                                      <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                                        {c.count} {c.count === 1 ? 'lançamento' : 'lançamentos'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    <div className="text-right">
                                      <p className="text-lg sm:text-xl font-light tracking-tight text-white">
                                        {formatCurrency(c.total).split(',')[0]}
                                        <span className="text-xs opacity-30">,{formatCurrency(c.total).split(',')[1]}</span>
                                      </p>
                                      <p className="text-[10px] font-bold text-white/30 mt-0.5">{pct.toFixed(1)}%</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-white/30" />
                                  </div>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {drillCategories.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center px-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total do mês</span>
                          <span className="text-lg font-light tracking-tight text-white">
                            {formatCurrency(monthTotal).split(',')[0]}
                            <span className="text-xs opacity-30">,{formatCurrency(monthTotal).split(',')[1]}</span>
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* NÍVEL 3: Lançamentos individuais */}
                {monthDrillMonth && monthDrillCategory && (() => {
                  const catTotal = drillExpenses.reduce((s, e) => s + e.value, 0);
                  const catColor = categories.find(c => c.name === monthDrillCategory)?.color ?? '#94a3b8';
                  return (
                    <>
                      <div className="flex justify-between items-center mb-6 px-2">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: catColor }} />
                          Lançamentos
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/20">
                          {drillExpenses.length} {drillExpenses.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>

                      {drillExpenses.length === 0 ? (
                        <div className="py-12 text-center">
                          <p className="text-sm font-bold text-white/30">Nenhum lançamento</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {drillExpenses.map(e => {
                            const d = new Date(e.expenseDate + 'T12:00:00');
                            const formattedDate = isNaN(d.getTime())
                              ? '—'
                              : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                            const owner = users.find(u => u.id === e.userId);
                            return (
                              <div key={e.id} className="glass rounded-2xl p-4 sm:p-5">
                                <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white break-words">{e.name}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{formattedDate}</span>
                                      {owner && (
                                        <>
                                          <span className="text-white/10">•</span>
                                          <span className="text-[10px] font-bold text-white/40 truncate max-w-[120px]">{owner.name}</span>
                                        </>
                                      )}
                                      {e.attachmentUrl && (
                                        <>
                                          <span className="text-white/10">•</span>
                                          <Paperclip className="w-3 h-3 text-white/30" />
                                        </>
                                      )}
                                    </div>
                                    {e.note && (
                                      <p className="text-[11px] text-white/40 italic mt-2 leading-snug break-words">"{e.note}"</p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-lg font-light tracking-tight text-white">
                                      {formatCurrency(e.value).split(',')[0]}
                                      <span className="text-xs opacity-30">,{formatCurrency(e.value).split(',')[1]}</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {drillExpenses.length > 0 && (
                        <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center px-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total da categoria</span>
                          <span className="text-lg font-light tracking-tight text-white">
                            {formatCurrency(catTotal).split(',')[0]}
                            <span className="text-xs opacity-30">,{formatCurrency(catTotal).split(',')[1]}</span>
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </GlassCard>
            </motion.div>
          ) : view === 'overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="space-y-6"
            >
              {/* Hero Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <GlassCard className="p-4 sm:p-6 pb-6 sm:pb-8 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 scale-150 rotate-12">
                     <div className="w-24 h-24 btn-gradient rounded-[32%] blur-2xl" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-white/30 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5 sm:gap-2">
                      <span className="w-1 h-1 rounded-full bg-blue-500" />
                      Este mês
                    </p>
                    <h2 className="text-xl sm:text-3xl font-light tracking-tighter truncate">
                      {formatCurrency(currentMonthTotal).split(',')[0]}
                      <span className="text-sm sm:text-lg opacity-20">,{formatCurrency(currentMonthTotal).split(',')[1]}</span>
                    </h2>
                  </div>
                </GlassCard>

                <GlassCard className="p-4 sm:p-6 pb-6 sm:pb-8 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 scale-150 -rotate-12">
                     <div className="w-24 h-24 bg-emerald-500 rounded-[32%] blur-2xl" />
                  </div>
                  <div className="relative z-10">
                    <p className="text-white/30 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5 sm:gap-2">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      Últimos 7 dias
                    </p>
                    <h2 className="text-xl sm:text-3xl font-light tracking-tighter truncate">
                      {formatCurrency(last7DaysTotal).split(',')[0]}
                      <span className="text-sm sm:text-lg opacity-20">,{formatCurrency(last7DaysTotal).split(',')[1]}</span>
                    </h2>
                  </div>
                </GlassCard>
              </div>

              {/* Chart Section */}
              <GlassCard className="p-8 h-fit">
                <div className="flex justify-between items-center mb-8 px-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Divisão por Categoria
                  </h3>
                </div>
                
                <div className="space-y-8">
                  {stats.sort((a, b) => b.total - a.total).map((s, idx) => {
                    const percentage = totalAmount > 0 ? (s.total / totalAmount) * 100 : 0;
                    if (s.total === 0) return null;
                    
                    return (
                      <motion.div
                        key={s.name}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.05 * idx, duration: 0.2 }}
                        className="space-y-3"
                      >
                        <div className="flex justify-between items-end">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentcolor]" style={{ backgroundColor: s.color, color: s.color }} />
                            <span className="text-sm font-bold text-white/90">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-bold tracking-tight">{formatCurrency(s.total)}</span>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-tighter">({percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }} 
                            animate={{ width: `${percentage}%` }} 
                            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.05 * idx }}
                            className="h-full absolute top-0 left-0" 
                            style={{ backgroundColor: s.color }} 
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </GlassCard>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="space-y-6"
            >
              {/* Search/Filter Container */}
              <div className="space-y-4 relative z-50">
                <div className="flex items-center">
                  <div className="flex-1 h-14 glass rounded-[24px] flex items-center px-6 focus-within:border-white/20 transition-colors shadow-inner">
                    <Search className="w-4 h-4 text-white/20 mr-4" />
                    <input 
                      value={searchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSearchQuery(val);
                        if (val) {
                          setIsFilterPanelOpen(false);
                          if (selectedCategoryFilter !== "all") {
                            setSelectedCategoryFilter("all");
                          }
                          if (selectedMonthFilter !== "all" && selectedMonthFilter !== currentYearMonth) {
                            setSelectedMonthFilter(currentYearMonth);
                          }
                        }
                      }}
                      placeholder="Procurar custo específico..."
                      className="bg-transparent outline-none flex-1 text-base font-medium placeholder:text-white/10"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => {
                          setSearchQuery("");
                          setIsFilterPanelOpen(false);
                        }}
                        className="text-xs font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest pl-2"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  {!searchQuery && (
                    <button 
                      onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                      className={`w-14 h-14 ml-3 glass rounded-[24px] flex items-center justify-center shrink-0 ${isFilterPanelOpen ? 'text-blue-400 bg-white/5 border border-blue-500/30' : 'text-white/40 hover:bg-white/10'}`}
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Total dos resultados da busca */}
                {debouncedSearch.trim() !== "" && filteredAndSortedExpenses.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 glass rounded-2xl">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {filteredAndSortedExpenses.length} {filteredAndSortedExpenses.length === 1 ? 'lançamento' : 'lançamentos'}
                    </span>
                    <span className="text-base font-black text-white">
                      {formatCurrency(searchTotal)}
                    </span>
                  </div>
                )}

                {/* Active Filters Bar */}
                {!searchQuery && (selectedCategoryFilter !== "all" || sortOrder !== "none" || (selectedMonthFilter !== "all" && selectedMonthFilter !== currentYearMonth)) && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex flex-wrap items-center gap-2 pt-1 pb-2 px-1 text-xs"
                  >
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-1">Filtros ativos:</span>
                    
                    {selectedCategoryFilter !== "all" && (
                      <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 text-white/70 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        <span 
                          className="w-1.5 h-1.5 rounded-full" 
                          style={{ backgroundColor: categories.find(c => c.name === selectedCategoryFilter)?.color || '#3b82f6' }} 
                        />
                        <span>{selectedCategoryFilter}</span>
                        <button type="button" onClick={() => setSelectedCategoryFilter("all")} className="hover:text-white transition-colors cursor-pointer">
                          <X className="w-3 h-3 text-white/40 hover:text-white" />
                        </button>
                      </div>
                    )}

                    {selectedMonthFilter !== "all" && selectedMonthFilter !== currentYearMonth && (
                      <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 text-white/70 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        <span>Mês: {availableMonths.find(m => m.value === selectedMonthFilter)?.label}</span>
                        <button type="button" onClick={() => setSelectedMonthFilter(currentYearMonth)} className="hover:text-white transition-colors cursor-pointer">
                          <X className="w-3 h-3 text-white/40 hover:text-white" />
                        </button>
                      </div>
                    )}

                    {sortOrder !== "none" && (
                      <div className="flex items-center gap-1 bg-white/5 border border-white/5 text-white/70 px-2.5 py-1 rounded-full text-[10px] font-bold">
                        <span>
                          {sortOrder === "asc" ? "Menor para o Maior" : "Maior para o Menor"}
                        </span>
                        <button type="button" onClick={() => setSortOrder("none")} className="hover:text-white transition-colors cursor-pointer">
                          <X className="w-3 h-3 text-white/40 hover:text-white" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryFilter("all");
                        setSelectedMonthFilter(currentYearMonth);
                        setSortOrder("none");
                      }}
                      className="ml-auto text-[10px] font-black uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer"
                    >
                      Limpar Filtros
                    </button>
                  </motion.div>
                )}

                {!searchQuery && isFilterPanelOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 surface-dropdown border border-white/5 rounded-[24px] backdrop-blur-xl"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Category Filter */}
                      {!searchQuery && (
                        <div className="space-y-1 relative">
                          <label className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30 ml-1 block select-none">Filtrar por Categoria</label>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCategoryFilterOpen(!isCategoryFilterOpen);
                                setIsMonthFilterOpen(false);
                                setIsSortOrderOpen(false);
                              }}
                              className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-xl px-4 flex items-center justify-between text-xs font-bold text-white transition-all select-none"
                            >
                              <span className="flex items-center gap-2">
                                {selectedCategoryFilter === "all" ? (
                                  <>Todas as categorias</>
                                ) : (
                                  <>
                                    <span 
                                      className="w-1.5 h-1.5 rounded-full" 
                                      style={{ backgroundColor: categories.find(c => c.name === selectedCategoryFilter)?.color || '#3b82f6' }} 
                                    />
                                    {selectedCategoryFilter}
                                  </>
                                )}
                              </span>
                              <ChevronDown className={`w-4 h-4 text-white/45 transition-transform duration-200 ${isCategoryFilterOpen ? "rotate-180 text-blue-400" : ""}`} />
                            </button>

                            {isCategoryFilterOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsCategoryFilterOpen(false)} />
                                <motion.div
                                  initial={{ opacity: 0, y: 5, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  className="absolute left-0 right-0 mt-1.5 p-1.5 surface-dropdown border border-white/10 rounded-2xl shadow-2xl z-20 max-h-56 overflow-y-auto scrollbar-none flex flex-col gap-0.5"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCategoryFilter("all");
                                      setIsCategoryFilterOpen(false);
                                    }}
                                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2 ${
                                      selectedCategoryFilter === "all"
                                        ? "bg-white/10 text-white"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                    }`}
                                  >
                                    Todas as categorias
                                  </button>
                                  {visibleCategories.map((cat) => (
                                    <button
                                      key={cat.name}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCategoryFilter(cat.name);
                                        setIsCategoryFilterOpen(false);
                                      }}
                                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2 ${
                                        selectedCategoryFilter === cat.name
                                          ? "bg-white/10 text-white"
                                          : "text-white/60 hover:bg-white/5 hover:text-white"
                                      }`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                      {cat.name}
                                    </button>
                                  ))}
                                </motion.div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Month Filter */}
                      <div className="space-y-1 relative">
                        <label className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30 ml-1 block select-none">Filtrar por Mês</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMonthFilterOpen(!isMonthFilterOpen);
                              setIsCategoryFilterOpen(false);
                              setIsSortOrderOpen(false);
                            }}
                            className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-xl px-4 flex items-center justify-between text-xs font-bold text-white transition-all select-none"
                          >
                            <span>
                              {selectedMonthFilter === "all" ? "Todos os meses" : availableMonths.find(m => m.value === selectedMonthFilter)?.label}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-white/45 transition-transform duration-200 ${isMonthFilterOpen ? "rotate-180 text-blue-400" : ""}`} />
                          </button>

                          {isMonthFilterOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setIsMonthFilterOpen(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 5, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className="absolute left-0 right-0 mt-1.5 p-1.5 surface-dropdown border border-white/10 rounded-2xl shadow-2xl z-20 max-h-56 overflow-y-auto scrollbar-none flex flex-col gap-0.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMonthFilter("all");
                                    setIsMonthFilterOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all ${
                                    selectedMonthFilter === "all"
                                      ? "bg-white/10 text-white"
                                      : "text-white/60 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  Todos os meses
                                </button>
                                {availableMonths.map((m) => (
                                  <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => {
                                      setSelectedMonthFilter(m.value);
                                      setIsMonthFilterOpen(false);
                                    }}
                                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all ${
                                      selectedMonthFilter === m.value
                                        ? "bg-white/10 text-white"
                                        : "text-white/60 hover:bg-white/5 hover:text-white"
                                    }`}
                                  >
                                    {m.label}
                                  </button>
                                ))}
                              </motion.div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Value Sorter */}
                      <div className="space-y-1 relative">
                        <label className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30 ml-1 block select-none">Ordenar por Valor</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSortOrderOpen(!isSortOrderOpen);
                              setIsCategoryFilterOpen(false);
                              setIsMonthFilterOpen(false);
                            }}
                            className="w-full h-11 bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-xl px-4 flex items-center justify-between text-xs font-bold text-white transition-all select-none"
                          >
                            <span>
                              {sortOrder === "none" && "Mais recentes"}
                              {sortOrder === "asc" && "Menor para o Maior"}
                              {sortOrder === "desc" && "Maior para o Menor"}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-white/45 transition-transform duration-200 ${isSortOrderOpen ? "rotate-180 text-blue-400" : ""}`} />
                          </button>

                          {isSortOrderOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setIsSortOrderOpen(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 5, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className="absolute left-0 right-0 mt-1.5 p-1.5 surface-dropdown border border-white/10 rounded-2xl shadow-2xl z-20 flex flex-col gap-0.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortOrder("none");
                                    setIsSortOrderOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all ${
                                    sortOrder === "none"
                                      ? "bg-white/10 text-white"
                                      : "text-white/60 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  Mais recentes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortOrder("asc");
                                    setIsSortOrderOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2 ${
                                    sortOrder === "asc"
                                      ? "bg-emerald-500/10 text-emerald-400 font-bold"
                                      : "text-white/60 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  Menor para o Maior
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSortOrder("desc");
                                    setIsSortOrderOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all flex items-center gap-2 ${
                                    sortOrder === "desc"
                                      ? "bg-rose-500/10 text-rose-400 font-bold"
                                      : "text-white/60 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  Maior para o Menor
                                </button>
                              </motion.div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Activity Feed Refined */}
              <div className="space-y-4">
                {filteredAndSortedExpenses.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-10 text-center glass rounded-[32px] border border-white/5 space-y-4"
                  >
                    <Search className="w-8 h-8 text-white/10 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white/50">Nenhum lançamento encontrado</p>
                      <p className="text-[10px] text-white/20 px-4 leading-relaxed font-medium">Tente ajustar seus termos de pesquisa ou os filtros ativos (categoria e ordenação).</p>
                    </div>
                    {(selectedCategoryFilter !== "all" || sortOrder !== "none" || searchQuery !== "" || (selectedMonthFilter !== "all" && selectedMonthFilter !== currentYearMonth)) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedCategoryFilter("all");
                          setSelectedMonthFilter(currentYearMonth);
                          setSortOrder("none");
                        }}
                        className="mx-auto text-xs font-bold bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 px-5 h-10 rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                      >
                        Limpar Filtros
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <>
                  {filteredAndSortedExpenses.slice(0, visibleCount).map((expense, idx) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      categoryColor={categoryColorByName.get(expense.category)}
                      ownerName={usersById.get(expense.userId)?.name}
                      idx={idx}
                      pageSize={PAGE_SIZE}
                      onSelect={setSelectedExpense}
                    />
                  ))}

                  {/* Sentinela de scroll infinito — callback ref para garantir montagem */}
                  <div ref={setSentinelEl}>
                    {visibleCount < filteredAndSortedExpenses.length ? (
                      <div className="flex flex-col items-center gap-2 py-8">
                        <div className="w-5 h-5 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">
                          {visibleCount} de {filteredAndSortedExpenses.length}
                        </p>
                      </div>
                    ) : filteredAndSortedExpenses.length > PAGE_SIZE ? (
                      <p className="text-center text-[9px] text-white/15 font-bold uppercase tracking-widest py-6">
                        — {filteredAndSortedExpenses.length} lançamentos —
                      </p>
                    ) : null}
                  </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Action Button */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 btn-gradient rounded-full flex items-center justify-center shadow-[0_15px_30px_-5px_rgba(59,130,246,0.6)] z-[90] active:scale-95 transition-all"
      >
        <Plus className="w-8 h-8 text-white stroke-[3]" />
      </motion.button>

      <ExpenseModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setExpenseToEdit(null);
        }} 
        user={user} 
        expense={expenseToEdit}
        onSave={handleSaveExpense}
        categories={visibleCategories}
      />
      <ExpenseDetailModal
        isOpen={!!selectedExpense}
        onClose={() => setSelectedExpense(null)}
        expense={selectedExpense}
        onEdit={handleEdit}
        onDelete={handleDelete}
        categories={categories}
        users={users}
      />
      <CategorySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        categories={visibleCategories}
        onAdd={handleAddCategory}
        onDelete={handleDeleteCategory}
        onEdit={handleEditCategory}
        onColorChange={handleChangeCategoryColor}
      />
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        expenses={expenses}
        categories={categories}
        users={users}
      />
      <NotificationSettingsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        enabled={notificationsEnabled}
        onToggle={handleNotificationsToggle}
        time={notificationTime}
        onTimeChange={handleNotificationsTimeChange}
        title={notificationTitle}
        onTitleChange={handleNotificationTitleChange}
        message={notificationMessage}
        onMessageChange={handleNotificationMessageChange}
      />
      <ConfirmationModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir Registro?"
        message="Esta ação não pode ser desfeita. O gasto selecionado será removido permanentemente do relatório."
      />
      <BillFormModal
        isOpen={billModalOpen}
        onClose={() => { setBillModalOpen(false); setBillToEdit(null); }}
        bill={billToEdit}
        categories={categories}
        onSave={handleSaveBill}
        onDelete={billToEdit ? () => { setBillToDelete(billToEdit); setBillModalOpen(false); } : undefined}
      />
      <PayBillModal
        bill={billToPay}
        isPaid={(() => {
          if (!billToPay) return false;
          const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
          return billToPay.isRecurring
            ? billToPay.lastPaidYearMonth === ym
            : billToPay.lastPaidYearMonth !== null;
        })()}
        onClose={() => setBillToPay(null)}
        onPay={handlePayBill}
        onUnpay={handleUnpayBill}
      />
      <ConfirmationModal
        isOpen={!!billToDelete}
        onClose={() => setBillToDelete(null)}
        onConfirm={confirmDeleteBill}
        title="Excluir Conta?"
        message={`A conta "${billToDelete?.name}" será removida. Os lançamentos já pagos serão mantidos.`}
      />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        email={user.email}
        onSaved={(updated) => {
          onProfileUpdate(updated);
          // Atualiza também a lista de users carregada para refletir nome/foto novos
          setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
        }}
      />
    </div>
  );
};

// --- Main App Entry ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#090a0f');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  }, []);

  // Retorna null quando o perfil não pôde ser carregado (inexistente OU falha de
  // rede) — o chamador decide o fallback. NUNCA inventar um usuário sem restrição
  // aqui: perderia o allowedCategories e vazaria categorias offline.
  async function loadUserProfile(userId: string, sessionEmail: string = ''): Promise<User | null> {
    const profile = await db.getUserProfile(userId);
    if (!profile) return null;
    const full = { ...profile, email: sessionEmail };
    saveCachedProfile(full);
    return full;
  }

  useEffect(() => {
    // Timeout de segurança: se o Supabase não responder em 5s, vai para login
    const timeout = setTimeout(() => setAuthLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      if (session?.user) {
        // Perfil em cache → entra na hora, sem esperar a rede (essencial offline)
        const cached = loadCachedProfile();
        if (cached && cached.id === session.user.id) {
          setCurrentUser(cached);
          setAuthLoading(false);
          if (navigator.onLine) {
            // Atualiza o perfil em background; null (falha) mantém o cacheado
            loadUserProfile(session.user.id, session.user.email ?? '')
              .then((p) => { if (p) setCurrentUser(p); })
              .catch(() => {});
          }
          return;
        }
        const profile = await loadUserProfile(session.user.id, session.user.email ?? '').catch(() => null);
        setCurrentUser(profile ?? {
          id: session.user.id,
          name: session.user.email?.split('@')[0] ?? 'Usuário',
          email: session.user.email ?? '',
          color: '#3b82f6',
          initials: (session.user.email ?? 'US').slice(0, 2).toUpperCase(),
        });
      }
      setAuthLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // CRÍTICO: nunca fazer queries Supabase DIRETO no callback — causa deadlock.
      // O signInWithPassword retém o lock interno de auth e espera este callback
      // terminar antes de prosseguir. Se fizermos uma query aqui, ela trava esperando
      // o mesmo lock. Solução: deferir para fora do callback com setTimeout(fn, 0).
      if (session?.user) {
        // Set imediato para tirar a tela de login — PREFERIR o perfil cacheado:
        // ele preserva allowedCategories (o fallback genérico não tem restrição
        // e vazaria categorias quando a busca de rede falhar offline)
        const cached = loadCachedProfile();
        const immediateUser: User = (cached && cached.id === session.user.id) ? cached : {
          id: session.user.id,
          name: session.user.email?.split('@')[0] ?? 'Usuário',
          email: session.user.email ?? '',
          color: '#3b82f6',
          initials: (session.user.email ?? 'US').slice(0, 2).toUpperCase(),
        };
        setCurrentUser(immediateUser);

        // Depois, fora do lock, busca o perfil completo.
        // null (perfil não carregou / sem rede) NÃO sobrescreve o atual.
        setTimeout(async () => {
          try {
            const profile = await loadUserProfile(session.user.id, session.user.email ?? '');
            if (profile) setCurrentUser(profile);
          } catch (err) {
            console.error('Falha ao carregar perfil:', err);
          }
        }, 0);
      } else {
        setCurrentUser(null);
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <AnimatePresence mode="wait">
        {!currentUser ? (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LoginScreen />
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardScreen user={currentUser} onLogout={() => supabase.auth.signOut()} onProfileUpdate={setCurrentUser} theme={theme} onToggleTheme={toggleTheme} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
