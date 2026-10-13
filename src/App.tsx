/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  Heart, 
  Wallet, 
  ArrowRight,
  Play,
  ShieldCheck,
  Target,
  MessageCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// --- Types ---
type Step = 'vsl' | 'quiz' | 'lead' | 'result';

interface QuizAnswers {
  name?: string;
  email?: string;
  phone?: string;
  income: string;
  debts: boolean | null;
  savings: boolean | null;
  communication: string;
  conflicts: string;
  decisions: string;
  commonGoals: boolean;
  structuredPlan: boolean;
  bothAware: boolean;
  future5Years: string;
  missedOpportunities: boolean;
}

// --- Constants & Data ---
const KIWIFY_CHECKOUT_URL = "https://pay.kiwify.com.br/SEU_LINK_AQUI"; // SUBSTITUA PELO SEU LINK
const VSL_VIDEO_URL = "https://www.youtube.com/embed/SEU_VIDEO_ID"; // SUBSTITUA PELA URL DO SEU VÍDEO (Youtube Embed, Vimeo, etc)

const INITIAL_ANSWERS: QuizAnswers = {
  income: '',
  debts: null,
  savings: null,
  communication: '',
  conflicts: '',
  decisions: '',
  commonGoals: false,
  structuredPlan: false,
  bothAware: false,
  future5Years: '',
  missedOpportunities: false,
};

const PROFILES = {
  DESALINHADO: {
    title: "CASAL DESALINHADO FINANCEIRAMENTE",
    description: "Isso significa que, mesmo tendo potencial... a falta de alinhamento está impedindo vocês de crescer.",
    consequence: "Se nada mudar, o mais provável é: mais conflitos, decisões erradas e atraso na construção de patrimônio.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20"
  },
  DESORGANIZADO: {
    title: "CASAL DESORGANIZADO FINANCEIRAMENTE",
    description: "A falta de estrutura básica está drenando a energia e os recursos de vocês.",
    consequence: "Dívidas acumuladas e a sensação de que o dinheiro 'some' no final do mês.",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20"
  },
  ESTAVEL: {
    title: "CASAL FINANCEIRAMENTE ESTÁVEL",
    description: "Vocês já têm uma base, mas ainda falta o 'próximo nível' de alinhamento estratégico.",
    consequence: "Estagnação. Vocês não quebram, mas também não prosperam como poderiam.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20"
  },
  EVOLUCAO: {
    title: "CASAL EM PLENA EVOLUÇÃO",
    description: "Vocês estão no caminho certo, mas precisam de ferramentas para acelerar o patrimônio.",
    consequence: "Perda de tempo. Sem um método profissional, o crescimento é mais lento do que o necessário.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20"
  }
};

// --- Components ---

const Button = ({ children, onClick, className = "", variant = "primary", disabled = false }: any) => {
  const base = "px-8 py-4 rounded-full font-semibold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50";
  const variants: any = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20",
    secondary: "bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10",
    outline: "border-2 border-emerald-600 text-emerald-500 hover:bg-emerald-600 hover:text-white"
  };
  
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} disabled={disabled}>
      {children}
    </button>
  );
};

const ProgressIndicator = ({ current, total }: { current: number, total: number }) => (
  <div className="flex gap-1 w-full max-w-md mx-auto mb-8">
    {Array.from({ length: total }).map((_, i) => (
      <div 
        key={i} 
        className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= current ? 'bg-emerald-500' : 'bg-white/10'}`}
      />
    ))}
  </div>
);

export default function App() {
  const [step, setStep] = useState<Step>('vsl');
  const [quizStep, setQuizStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(INITIAL_ANSWERS);
  const [aiFeedback, setAiFeedback] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleNextQuiz = () => {
    if (quizStep < 3) {
      setQuizStep(quizStep + 1);
    } else {
      setStep('lead');
    }
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const profile = calculateProfile();
      const leadData = {
        name: answers.name,
        email: answers.email,
        phone: answers.phone,
        income: answers.income,
        debts: answers.debts,
        savings: answers.savings,
        alignmentScore: profile.alignmentScore,
        financialScore: profile.financialScore,
        profile: profile.title,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'leads'), leadData);
      setStep('result');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateProfile = () => {
    let alignmentScore = 0;
    let financialScore = 0;

    // Alignment Score (Max 12)
    if (answers.commonGoals) alignmentScore += 2;
    if (answers.structuredPlan) alignmentScore += 3;
    if (answers.bothAware) alignmentScore += 2;
    if (answers.communication === 'frequent') alignmentScore += 3;
    if (answers.decisions === 'both') alignmentScore += 2;
    
    // Financial Score (Max 9)
    if (answers.income === 'ultra') financialScore += 5;
    else if (answers.income === 'high') financialScore += 4;
    else if (answers.income === 'mid-high') financialScore += 3;
    else if (answers.income === 'mid') financialScore += 2;
    else if (answers.income === 'low') financialScore += 1;
    
    if (answers.debts === false) financialScore += 2;
    if (answers.savings === true) financialScore += 2;

    // Evaluation Logic
    let profile = PROFILES.DESALINHADO;
    if (alignmentScore >= 10 && financialScore >= 7) profile = PROFILES.EVOLUCAO;
    else if (alignmentScore >= 7 && financialScore >= 5) profile = PROFILES.ESTAVEL;
    else if (financialScore < 4) profile = PROFILES.DESORGANIZADO;
    
    return { ...profile, alignmentScore, financialScore };
  };

  const currentProfile = useMemo(() => calculateProfile(), [answers]);

  const generateAiFeedback = async (retryCount = 0) => {
    if (!process.env.GEMINI_API_KEY) return;
    
    setIsGeneratingAi(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const prompt = `
        Você é o Mentor da Aliança, um sistema que une finanças, investimentos, gestão de conflitos, Princípios da Palavra de Deus e neurociência.
        
        Analise o seguinte perfil de casal e forneça um feedback curto, impactante e transformador (máximo 150 palavras).
        
        Perfil: ${currentProfile.title}
        Renda: ${answers.income}
        Dívidas: ${answers.debts ? 'Sim' : 'Não'}
        Poupança: ${answers.savings ? 'Sim' : 'Não'}
        Comunicação: ${answers.communication}
        Decisões: ${answers.decisions}
        Visão de Futuro: ${answers.commonGoals && answers.structuredPlan ? 'Alinhada' : 'Desalinhada'}
        
        O feedback deve:
        1. Validar a dor do casal.
        2. Citar brevemente um Princípio da Palavra de Deus ou de neurociência.
        3. Mostrar que o Método A.L.I.A.N.Ç.A é a solução.
        4. Ser encorajador mas firme sobre a necessidade de mudança.
        
        Use um tom premium, elegante e empático.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      setAiFeedback(response.text || '');
    } catch (error: any) {
      console.error("Erro ao gerar feedback IA:", error);
      
      // Lógica de Retry para Rate Limiting (Erro 429)
      if (error?.status === 429 && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => generateAiFeedback(retryCount + 1), delay);
        return;
      }
      
      setAiFeedback("Ocorreu um erro ao gerar sua análise personalizada. Mas não se preocupe, o Método A.L.I.A.N.Ç.A tem o caminho para vocês.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  useEffect(() => {
    if (step === 'result' && !aiFeedback && !isGeneratingAi) {
      generateAiFeedback();
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Background Accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-900/20 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-900/10 blur-[100px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-20">
        <AnimatePresence mode="wait">
          {step === 'vsl' && (
            <motion.div 
              key="vsl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-12"
            >
              <div className="space-y-6">
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm font-medium tracking-wider uppercase"
                >
                  Exclusivo para Casais
                </motion.span>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
                  O dinheiro está <span className="text-emerald-500">unindo</span> ou <span className="text-red-400">afastando</span> vocês?
                </h1>
                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
                  Descubra por que a maioria dos casais falha financeiramente e como alinhar sua visão para construir um patrimônio sólido.
                </p>
              </div>

              {/* VSL Video Section */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl">
                {VSL_VIDEO_URL.includes('embed') ? (
                  <iframe 
                    src={VSL_VIDEO_URL}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="text-center p-8">
                      <Play className="w-16 h-16 text-emerald-500 mx-auto mb-4 opacity-50" />
                      <p className="text-gray-400">Configure a URL do seu vídeo no código para começar.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Script Section */}
              <div className="text-left bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                <h3 className="text-emerald-500 font-bold uppercase tracking-widest text-sm">Transcrição do Vídeo</h3>
                <div className="space-y-4 text-gray-300 leading-relaxed">
                  <p className="font-bold text-white">“Se você é casado… ou está construindo uma vida a dois… e sente que o dinheiro, em vez de unir vocês, está gerando tensão, silêncio ou até conflitos… você precisa ver isso.”</p>
                  <p>“A maioria dos casais acha que o problema é falta de dinheiro. Mas na verdade, o problema é que ninguém ensinou como alinhar visão financeira dentro de um relacionamento.”</p>
                  <p>“Um quer economizar… o outro quer viver o agora. Um quer investir… o outro tem medo. E sem perceber, o dinheiro vira um campo de conflito invisível.”</p>
                  <p className="p-4 bg-emerald-500/10 border-l-4 border-emerald-500 italic">“Ao longo dos anos, eu comecei a estudar profundamente três coisas: o que a Bíblia ensina sobre dinheiro, como o cérebro reage às decisões financeiras, e como estruturar um plano financeiro real para um casal.”</p>
                  <p>“E percebi algo preocupante: a maioria dos casais não quebra financeiramente por falta de renda… mas por falta de alinhamento.”</p>
                  <p>“Quando o casal não tem um plano claro… cada decisão vira uma negociação… e toda negociação vira desgaste.”</p>
                  <p>“Foi por isso que eu criei um método que não começa com investimento… começa com entendimento, alinhamento e estrutura.”</p>
                  <p className="font-bold text-emerald-400">“Agora, eu quero te mostrar exatamente em que nível financeiro vocês estão como casal… e o que está travando vocês hoje.”</p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6 text-left">
                {[
                  { icon: Heart, title: "Alinhamento", desc: "Aprenda a falar de dinheiro sem brigas." },
                  { icon: ShieldCheck, title: "Segurança", desc: "Proteja o futuro da sua família." },
                  { icon: TrendingUp, title: "Prosperidade", desc: "Construa um plano real de riqueza." }
                ].map((item, i) => (
                  <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                    <item.icon className="w-8 h-8 text-emerald-500 mb-4" />
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-400">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="pt-8">
                <Button onClick={() => setStep('quiz')} className="mx-auto text-lg px-12 py-6">
                  Fazer Diagnóstico Gratuito <ArrowRight className="w-5 h-5" />
                </Button>
                <p className="mt-4 text-sm text-gray-500">Leva menos de 3 minutos.</p>
              </div>
            </motion.div>
          )}

          {step === 'quiz' && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto"
            >
              <ProgressIndicator current={quizStep} total={4} />
              
              <div className="space-y-8">
                {quizStep === 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-emerald-500 mb-2">
                      <Wallet className="w-6 h-6" />
                      <span className="font-semibold uppercase tracking-widest text-sm">Bloco 1: Realidade Financeira</span>
                    </div>
                    <h2 className="text-3xl font-bold">Como está a saúde financeira de vocês hoje?</h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-400">Qual a renda mensal combinada do casal?</p>
                      <div className="grid grid-cols-1 gap-3">
                        {[
                          { label: 'Até R$ 5.000', val: 'low' },
                          { label: 'R$ 5.000 a R$ 15.000', val: 'mid' },
                          { label: 'R$ 15.000 a R$ 25.000', val: 'mid-high' },
                          { label: 'R$ 25.000 a R$ 45.000', val: 'high' },
                          { label: 'Acima de R$ 50.000', val: 'ultra' }
                        ].map((opt) => (
                          <button 
                            key={opt.val}
                            onClick={() => setAnswers({...answers, income: opt.val})}
                            className={`p-4 rounded-xl border text-left transition-all ${answers.income === opt.val ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <p className="text-gray-400 text-sm">Possuem dívidas?</p>
                        <div className="flex gap-2">
                          {[true, false].map((v) => (
                            <button 
                              key={String(v)}
                              onClick={() => setAnswers({...answers, debts: v})}
                              className={`flex-1 p-3 rounded-xl border transition-all ${answers.debts === v ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'}`}
                            >
                              {v ? 'Sim' : 'Não'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-gray-400 text-sm">Poupam mensalmente?</p>
                        <div className="flex gap-2">
                          {[true, false].map((v) => (
                            <button 
                              key={String(v)}
                              onClick={() => setAnswers({...answers, savings: v})}
                              className={`flex-1 p-3 rounded-xl border transition-all ${answers.savings === v ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'}`}
                            >
                              {v ? 'Sim' : 'Não'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {quizStep === 1 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-emerald-500 mb-2">
                      <Users className="w-6 h-6" />
                      <span className="font-semibold uppercase tracking-widest text-sm">Bloco 2: Comportamento</span>
                    </div>
                    <h2 className="text-3xl font-bold">Como vocês lidam com as decisões?</h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-400">Com que frequência conversam sobre dinheiro?</p>
                      <div className="grid gap-3">
                        {[
                          { label: 'Toda semana, de forma leve', val: 'frequent' },
                          { label: 'Raramente, só quando precisa', val: 'rare' },
                          { label: 'Nunca, é um tabu', val: 'never' }
                        ].map((opt) => (
                          <button 
                            key={opt.val}
                            onClick={() => setAnswers({...answers, communication: opt.val})}
                            className={`p-4 rounded-xl border text-left transition-all ${answers.communication === opt.val ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-gray-400">Quem toma as decisões financeiras de fato?</p>
                      <div className="grid grid-cols-1 gap-3">
                        {[
                          { label: 'Cada um por si, Deus por todos?', val: 'none' },
                          { label: 'Apenas um (o outro apenas aceita)', val: 'one' },
                          { label: 'Ambos Juntos (alinhamento real)', val: 'both' }
                        ].map((opt) => (
                          <button 
                            key={opt.val}
                            onClick={() => setAnswers({...answers, decisions: opt.val})}
                            className={`p-4 rounded-xl border text-left transition-all ${answers.decisions === opt.val ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {quizStep === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-emerald-500 mb-2">
                      <Target className="w-6 h-6" />
                      <span className="font-semibold uppercase tracking-widest text-sm">Bloco 3: Alinhamento</span>
                    </div>
                    <h2 className="text-3xl font-bold">Existe uma visão de futuro compartilhada?</h2>
                    
                    <div className="grid gap-4">
                      {[
                        { key: 'commonGoals', label: 'Temos objetivos financeiros claros em comum' },
                        { key: 'structuredPlan', label: 'Temos um plano estruturado para os próximos anos' },
                        { key: 'bothAware', label: 'Ambos sabem exatamente quanto entra e quanto sai' }
                      ].map((item) => (
                        <button 
                          key={item.key}
                          onClick={() => setAnswers({...answers, [item.key]: !((answers as any)[item.key])})}
                          className={`p-5 rounded-xl border text-left flex items-center justify-between transition-all ${(answers as any)[item.key] ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'}`}
                        >
                          <span>{item.label}</span>
                          {(answers as any)[item.key] ? <CheckCircle2 className="text-emerald-500" /> : <div className="w-6 h-6 rounded-full border border-white/20" />}
                        </button>
                      ))}
                      
                      <button 
                        onClick={() => setAnswers({...answers, commonGoals: false, structuredPlan: false, bothAware: false})}
                        className={`p-5 rounded-xl border text-left flex items-center justify-between transition-all ${(!answers.commonGoals && !answers.structuredPlan && !answers.bothAware) ? 'border-red-500 bg-red-500/10' : 'border-white/10 hover:border-white/20'}`}
                      >
                        <span>Não, cada um segue seus planos e objetivos individuais</span>
                        {(!answers.commonGoals && !answers.structuredPlan && !answers.bothAware) ? <AlertCircle className="text-red-500" /> : <div className="w-6 h-6 rounded-full border border-white/20" />}
                      </button>
                    </div>
                  </div>
                )}

                {quizStep === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 text-emerald-500 mb-2">
                      <TrendingUp className="w-6 h-6" />
                      <span className="font-semibold uppercase tracking-widest text-sm">Bloco 4: Consequência</span>
                    </div>
                    <h2 className="text-3xl font-bold">Para onde o caminho atual está levando vocês?</h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-400">Se continuarem exatamente como estão hoje, onde estarão em 5 anos?</p>
                      <div className="grid gap-3">
                        {[
                          { label: 'Muito melhor, estamos crescendo', val: 'better' },
                          { label: 'No mesmo lugar, estagnados', val: 'same' },
                          { label: 'Em uma situação crítica', val: 'worse' }
                        ].map((opt) => (
                          <button 
                            key={opt.val}
                            onClick={() => setAnswers({...answers, future5Years: opt.val})}
                            className={`p-4 rounded-xl border text-left transition-all ${answers.future5Years === opt.val ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={() => setAnswers({...answers, missedOpportunities: !answers.missedOpportunities})}
                      className={`w-full p-5 rounded-xl border text-left flex items-center justify-between transition-all ${answers.missedOpportunities ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'}`}
                    >
                      <span>Já deixaram de fazer algo importante por falta de organização financeira?</span>
                      {answers.missedOpportunities ? <CheckCircle2 className="text-emerald-500" /> : <div className="w-6 h-6 rounded-full border border-white/20" />}
                    </button>
                  </div>
                )}

                <div className="pt-8 flex justify-between items-center">
                  <button 
                    onClick={() => quizStep > 0 && setQuizStep(quizStep - 1)}
                    className={`text-gray-500 hover:text-white transition-colors ${quizStep === 0 ? 'invisible' : ''}`}
                  >
                    Voltar
                  </button>
                  <Button onClick={handleNextQuiz} className="px-12">
                    {quizStep === 3 ? 'Ver Resultado' : 'Próximo Passo'} <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'lead' && (
            <motion.div 
              key="lead"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto text-center space-y-8"
            >
              <div className="space-y-4">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-bold">Quase lá!</h2>
                <p className="text-gray-400">Para onde devemos enviar seu diagnóstico detalhado e o plano de ação?</p>
              </div>

              <form onSubmit={handleLeadSubmit} className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Seu nome" 
                  required
                  value={answers.name || ''}
                  onChange={(e) => setAnswers({...answers, name: e.target.value})}
                  className="w-full px-6 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none transition-all"
                />
                <input 
                  type="email" 
                  placeholder="Seu melhor e-mail" 
                  required
                  value={answers.email || ''}
                  onChange={(e) => setAnswers({...answers, email: e.target.value})}
                  className="w-full px-6 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none transition-all"
                />
                <input 
                  type="tel" 
                  placeholder="WhatsApp (com DDD)" 
                  required
                  value={answers.phone || ''}
                  onChange={(e) => setAnswers({...answers, phone: e.target.value})}
                  className="w-full px-6 py-4 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 outline-none transition-all"
                />
                <Button type="submit" className="w-full py-5 text-lg" disabled={isSaving}>
                  {isSaving ? (
                    <>Salvando... <Loader2 className="w-5 h-5 animate-spin" /></>
                  ) : (
                    <>Ver Meu Resultado Agora <ArrowRight className="w-5 h-5" /></>
                  )}
                </Button>
              </form>
              <p className="text-xs text-gray-600">Respeitamos sua privacidade. Seus dados estão seguros conosco.</p>
            </motion.div>
          )}

          {step === 'result' && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10"
            >
              <div className="text-center space-y-4">
                <span className="text-emerald-500 font-semibold tracking-widest uppercase text-sm">Diagnóstico Concluído</span>
                <h2 className="text-3xl md:text-4xl font-bold">Resultado da Análise</h2>
              </div>

              <div className={`p-8 md:p-12 rounded-3xl border-2 ${currentProfile.border} ${currentProfile.bg} space-y-6 relative overflow-hidden`}>
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <AlertCircle className="w-32 h-32" />
                </div>
                
                <div className="space-y-2 relative z-10">
                  <p className="text-sm font-medium uppercase tracking-wider opacity-70">Nível Atual:</p>
                  <h3 className={`text-2xl md:text-4xl font-black ${currentProfile.color}`}>
                    {currentProfile.title}
                  </h3>
                </div>

                <div className="grid md:grid-cols-2 gap-8 relative z-10">
                  <div className="space-y-4">
                    <h4 className="font-bold flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-emerald-500" /> Interpretação
                    </h4>
                    <p className="text-gray-300 leading-relaxed">
                      {currentProfile.description}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-5 h-5" /> Consequência
                    </h4>
                    <p className="text-gray-300 leading-relaxed">
                      {currentProfile.consequence}
                    </p>
                  </div>
                </div>

                {/* AI Feedback Section */}
                <div className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/10 relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-emerald-400">Análise Personalizada (Mentor da Aliança)</h4>
                  </div>
                  
                  {isGeneratingAi ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      <p className="text-sm text-gray-400 animate-pulse">O Mentor da Aliança está analisando seu perfil através do Método A.L.I.A.N.Ç.A...</p>
                    </div>
                  ) : aiFeedback ? (
                    <div className="space-y-4">
                      <div className="text-gray-300 italic leading-relaxed whitespace-pre-wrap">
                        {aiFeedback}
                      </div>
                      <button 
                        onClick={generateAiFeedback}
                        className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Gerar nova análise
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                      <p className="text-sm text-gray-400">Não foi possível gerar a análise automática.</p>
                      <button 
                        onClick={generateAiFeedback}
                        className="px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold">O Caminho para a Prosperidade</h3>
                  <p className="text-gray-400">Para mudar essa realidade, vocês precisam focar em 3 pilares:</p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { title: "Clareza", desc: "Saber exatamente onde cada centavo está indo." },
                    { title: "Alinhamento", desc: "Ter os mesmos sonhos e metas de vida." },
                    { title: "Estrutura", desc: "Um método que funcione no piloto automático." }
                  ].map((p, i) => (
                    <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto mb-4 font-bold">
                        {i + 1}
                      </div>
                      <h4 className="font-bold mb-2">{p.title}</h4>
                      <p className="text-sm text-gray-400">{p.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-center space-y-10 shadow-2xl shadow-emerald-900/40"
              >
                <div className="space-y-8">
                  <h3 className="text-3xl md:text-4xl font-bold">Domine o Método A.L.I.A.N.Ç.A</h3>
                  
                  <div className="text-emerald-100 max-w-3xl mx-auto leading-relaxed text-lg space-y-6">
                    <p>
                      Você não precisa de mais informação…<br />
                      Nem de mais um curso de finanças cheio de termos que só aumentam a confusão.
                    </p>
                    
                    <p>
                      Se o dinheiro tem gerado tensão, silêncio ou decisões desalinhadas no seu casamento… o problema não é falta de conhecimento.
                    </p>
                    
                    <p className="text-2xl font-bold text-white">É falta de direção.</p>
                    
                    <p>
                      O Método A.L.I.A.N.Ç.A integra <span className="font-bold text-white">princípios bíblicos, neurociência aplicada e estratégia financeira</span> para transformar não apenas suas finanças…
                    </p>
                    
                    <p className="text-xl font-bold text-white italic">
                      mas a forma como vocês pensam, decidem e caminham juntos.
                    </p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-6 md:p-8 max-w-2xl mx-auto text-left space-y-4 border border-white/10">
                  <p className="text-white font-bold text-lg mb-2">Aqui vocês desenvolvem:</p>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-emerald-50">
                      <span className="text-emerald-400 mt-1">✔</span>
                      <span>Clareza financeira e decisões seguras</span>
                    </li>
                    <li className="flex items-start gap-3 text-emerald-50">
                      <span className="text-emerald-400 mt-1">✔</span>
                      <span>Unidade emocional e alinhamento no casal</span>
                    </li>
                    <li className="flex items-start gap-3 text-emerald-50">
                      <span className="text-emerald-400 mt-1">✔</span>
                      <span>Controle sobre o dinheiro (sem ansiedade ou conflito)</span>
                    </li>
                    <li className="flex items-start gap-3 text-emerald-50">
                      <span className="text-emerald-400 mt-1">✔</span>
                      <span>Um plano real para construir patrimônio e legado</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-8">
                  <div className="space-y-2">
                    <p className="text-emerald-100 text-lg">Isso não é sobre ganhar mais dinheiro.</p>
                    <p className="text-2xl font-bold text-white">É sobre viver em unidade, com propósito e direção.</p>
                  </div>

                  <p className="text-emerald-50 font-medium max-w-2xl mx-auto text-lg">
                    Transforme seu casamento, alinhe seu futuro e comece hoje a construir um legado financeiro sólido com o Método A.L.I.A.N.Ç.A.
                  </p>
                  
                  <Button 
                    variant="secondary" 
                    onClick={() => window.open(KIWIFY_CHECKOUT_URL, '_blank')}
                    className="mx-auto bg-white text-emerald-900 hover:bg-gray-100 px-16 py-8 text-xl md:text-2xl font-black tracking-tighter shadow-2xl hover:scale-105 active:scale-95"
                  >
                    Clique agora e comece essa transformação <ArrowRight className="w-6 h-6" />
                  </Button>
                </div>
                
                <p className="text-emerald-200/60 text-xs">Garantia incondicional de 7 dias.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-10 py-12 text-center text-gray-600 text-sm border-t border-white/5 mt-20">
        <p>© 2026 Método Aliança. Todos os direitos reservados.</p>
        <div className="flex justify-center gap-6 mt-4">
          <a href="#" className="hover:text-gray-400 transition-colors">Termos de Uso</a>
          <a href="#" className="hover:text-gray-400 transition-colors">Privacidade</a>
        </div>
      </footer>
    </div>
  );
}
