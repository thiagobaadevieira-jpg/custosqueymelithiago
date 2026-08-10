import React, { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { cn } from './utils';

// ─── LanguageTool integration ───────────────────────────────────────────────
// API pública gratuita: 20 req/min por IP, 20KB de texto por request.
// Sem cadastro, sem chave. Docs: https://languagetool.org/http-api/

export interface LTMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: Array<{ value: string }>;
  rule: {
    id: string;
    category: { id: string; name: string };
  };
}

// Regras que a gente ignora (barulho pra texto informal)
const IGNORED_RULES = new Set<string>([
  'WHITESPACE_RULE',      // espaços duplos/triplos — chato demais
  'MORFOLOGIK_RULE_PT_BR', // deixa spellcheck do navegador cuidar
  'UPPERCASE_SENTENCE_START', // "queria comprar..." é natural em nota
]);

export function useLanguageTool(text: string, delayMs = 800) {
  const [matches, setMatches] = useState<LTMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text.trim() || text.trim().length < 4) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = new URLSearchParams({
          text,
          language: 'pt-BR',
          enabledOnly: 'false',
        });
        const res = await fetch('https://api.languagetool.org/v2/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`LT API ${res.status}`);
        const data = (await res.json()) as { matches: LTMatch[] };
        const filtered = (data.matches ?? []).filter(m => !IGNORED_RULES.has(m.rule.id));
        setMatches(filtered);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Falha de rede ou API — silenciosamente sem sugestões
          setMatches([]);
        }
      } finally {
        setLoading(false);
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, delayMs]);

  return { matches, loading };
}

// ─── Componente de sugestões ────────────────────────────────────────────────

interface GrammarSuggestionsProps {
  text: string;
  matches: LTMatch[];
  loading: boolean;
  onApply: (newText: string) => void;
  maxVisible?: number;
}

export function GrammarSuggestions({
  text,
  matches,
  loading,
  onApply,
  maxVisible = 4,
}: GrammarSuggestionsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Reseta dismissals quando o texto muda o suficiente
  useEffect(() => {
    setDismissed(new Set());
  }, [text.length < 3]);

  const active = matches.filter(m => {
    const key = `${m.offset}-${m.length}-${m.rule.id}`;
    if (dismissed.has(key)) return false;
    if (!m.replacements[0]?.value) return false;
    // Valida que o offset ainda bate com o texto atual (evita corromper)
    const slice = text.slice(m.offset, m.offset + m.length);
    // Match original — só compara caso já tenha sido invalidado por edição
    return slice.length === m.length;
  });

  if (active.length === 0 && !loading) return null;

  const applyMatch = (m: LTMatch, replacement: string) => {
    const before = text.slice(0, m.offset);
    const after = text.slice(m.offset + m.length);
    onApply(before + replacement + after);
  };

  const dismiss = (m: LTMatch) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(`${m.offset}-${m.length}-${m.rule.id}`);
      return next;
    });
  };

  const visible = active.slice(0, maxVisible);
  const overflow = active.length - visible.length;

  return (
    <div className="mt-2 space-y-1.5">
      {loading && active.length === 0 && (
        <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest ml-1">
          <div className="w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" />
          Verificando gramática...
        </div>
      )}

      {visible.map((m, idx) => {
        const suggestion = m.replacements[0].value;
        const original = text.slice(m.offset, m.offset + m.length);
        const isTypo = m.rule.category.id === 'TYPOS' || m.rule.id.startsWith('MORFOLOGIK');
        return (
          <div
            key={`${m.offset}-${m.length}-${m.rule.id}-${idx}`}
            className={cn(
              "glass rounded-xl p-2.5 flex items-center gap-2 border",
              isTypo ? "border-red-500/15" : "border-amber-500/15"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/70 truncate">
                <span className="line-through text-red-400/80">"{original}"</span>
                <span className="text-white/30 mx-1.5">→</span>
                <span className="text-emerald-400 font-black">{suggestion}</span>
              </p>
              <p className="text-[9px] text-white/40 mt-0.5 truncate">
                {m.shortMessage || m.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => applyMatch(m, suggestion)}
              className="shrink-0 h-8 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/25 active:scale-95 transition-all flex items-center gap-1"
            >
              <Check className="w-3 h-3 stroke-[3]" />
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => dismiss(m)}
              className="shrink-0 w-7 h-7 rounded-lg text-white/25 hover:text-white/50 flex items-center justify-center transition-colors"
              aria-label="Ignorar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {overflow > 0 && (
        <p className="text-[9px] text-white/25 font-bold uppercase tracking-widest ml-1">
          + {overflow} sugesto{overflow > 1 ? 'es' : ''} adicional{overflow > 1 ? 'is' : ''}
        </p>
      )}
    </div>
  );
}
