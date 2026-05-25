"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Send, Zap, Mail, Linkedin, MessageSquare } from "lucide-react";

const TABS = [
  { id: "inbox", label: "Boîte de réponses", count: 5 },
  { id: "sequences", label: "Mes séquences", count: 4 },
] as const;

type Tab = typeof TABS[number]["id"];

interface Conversation {
  id: number;
  name: string;
  co: string;
  initials: string;
  preview: string;
  time: string;
  intent: "INTÉRESSÉE" | "OBJECTION" | "REFUS POLI" | "PAS MAINTENANT";
  unread: boolean;
  messages: { role: "ai" | "lead"; text: string; time: string }[];
}

const CONVERSATIONS: Conversation[] = [
  {
    id: 1,
    name: "Nina Torres", co: "Qonto", initials: "NT",
    preview: "Oui ça m'intéresse, vous avez une démo...",
    time: "2 min",
    intent: "INTÉRESSÉE",
    unread: true,
    messages: [
      { role: "ai", text: "Bonjour Nina, j'ai vu que Qonto recrute activement des Sales managers. Nos clients dans la FinTech ont réduit leur cycle de vente de 40% en 3 mois.", time: "hier 14:32" },
      { role: "lead", text: "Oui ça m'intéresse, vous avez une démo disponible cette semaine ?", time: "aujourd'hui 09:14" },
    ]
  },
  {
    id: 2,
    name: "Emma Blanc", co: "Swile", initials: "EB",
    preview: "On a déjà un outil similaire, pas sûr que...",
    time: "14 min",
    intent: "OBJECTION",
    unread: true,
    messages: [
      { role: "ai", text: "Bonjour Emma, Swile a récemment ouvert un bureau à Lyon. Notre solution aide les équipes décentralisées à maintenir un pipeline cohérent.", time: "avant-hier 11:00" },
      { role: "lead", text: "On a déjà un outil similaire, pas sûr que ça apporte quelque chose de plus.", time: "aujourd'hui 08:45" },
    ]
  },
  {
    id: 3,
    name: "Thomas Duval", co: "Mistral AI", initials: "TD",
    preview: "Merci mais ce n'est pas le bon moment pour...",
    time: "1 h",
    intent: "REFUS POLI",
    unread: true,
    messages: [
      { role: "ai", text: "Bonjour Thomas, félicitations pour la levée de fonds ! C'est souvent le bon moment pour structurer l'outreach.", time: "3j ago" },
      { role: "lead", text: "Merci mais ce n'est pas le bon moment pour nous, on est en pleine phase de recrutement.", time: "hier 17:20" },
    ]
  },
  {
    id: 4,
    name: "Marc Lefèvre", co: "Spendesk", initials: "ML",
    preview: "Recontactez-moi en septembre, là c'est...",
    time: "2 h",
    intent: "PAS MAINTENANT",
    unread: true,
    messages: [
      { role: "ai", text: "Bonjour Marc, j'ai vu que Spendesk recrute 3 BDR. Notre IA peut accélérer leur onboarding et ramp-up.", time: "4j ago" },
      { role: "lead", text: "Recontactez-moi en septembre, là c'est la fin de Q2 et on est focusés sur les deals en cours.", time: "hier 16:05" },
    ]
  },
  {
    id: 5,
    name: "Lucas Petit", co: "Alan", initials: "LP",
    preview: "Super ! On peut caler ça mardi ?",
    time: "3 h",
    intent: "INTÉRESSÉE",
    unread: false,
    messages: [
      { role: "ai", text: "Bonjour Lucas, Alan vient de lancer une expansion dans 3 pays. Notre solution s'adapte à chaque marché automatiquement.", time: "2j ago" },
      { role: "lead", text: "Super ! On peut caler ça mardi ?", time: "hier 15:30" },
    ]
  },
];

interface Sequence {
  id: number;
  name: string;
  channels: ("email" | "linkedin" | "sms")[];
  leads: number;
  replyRate: string;
  status: "Active" | "Pause" | "Draft";
}

const SEQUENCES: Sequence[] = [
  { id: 1, name: "B2B SaaS Directeurs Commerciaux", channels: ["email", "linkedin"], leads: 47, replyRate: "18.2%", status: "Active" },
  { id: 2, name: "Startup post-levée Série A/B", channels: ["linkedin", "email", "sms"], leads: 32, replyRate: "22.4%", status: "Active" },
  { id: 3, name: "Recruteurs actifs — RevOps", channels: ["linkedin"], leads: 28, replyRate: "14.7%", status: "Pause" },
  { id: 4, name: "Nouveaux bureaux régionaux", channels: ["email"], leads: 15, replyRate: "—", status: "Draft" },
];

function intentStyle(intent: Conversation["intent"]) {
  if (intent === "INTÉRESSÉE") return { bg: "var(--emerald-soft)", color: "var(--emerald-fg)" };
  if (intent === "OBJECTION") return { bg: "var(--amber-soft)", color: "var(--amber-fg)" };
  if (intent === "REFUS POLI") return { bg: "var(--danger-soft)", color: "var(--danger-fg)" };
  return { bg: "var(--cold-soft)", color: "var(--cold-fg)" };
}

function statusStyle(status: Sequence["status"]) {
  if (status === "Active") return { bg: "var(--emerald-soft)", color: "var(--emerald-fg)" };
  if (status === "Pause") return { bg: "var(--amber-soft)", color: "var(--amber-fg)" };
  return { bg: "oklch(0.21 0.03 260 / 0.06)", color: "var(--fg-mute)" };
}

const AI_REPLIES = [
  {
    type: "Closing direct",
    accent: "emerald" as const,
    text: "Parfait Nina ! Je vous propose mardi 14h ou jeudi 10h pour une démo de 20 min — quel créneau vous convient ? Je vous envoie le lien Calendly.",
  },
  {
    type: "Nurturing",
    accent: "violet" as const,
    text: "Super Nina ! Avant la démo, je vous partage une étude de cas Qonto-like : comment Pennylane a réduit son cycle de vente de 35% en 6 semaines. Ça devrait résonner avec vos enjeux.",
  },
];

export default function OutreachPage() {
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [selectedConv, setSelectedConv] = useState<number>(1);
  const [replyText, setReplyText] = useState("");

  const conv = CONVERSATIONS.find((c) => c.id === selectedConv)!;

  return (
    <>
      <AppTopBar
        title="Outreach"
        breadcrumb="sales-os / outreach"
        cta="Nouvelle séquence"
        onCta={() => setActiveTab("sequences")}
        accent="emerald"
      />

      <div className="px-6 pt-4 pb-6 space-y-4 max-w-[1400px]">

        {/* Tabs */}
        <div className="flex items-center gap-1.5">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={
                  active
                    ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                    : { color: "var(--fg-dim)", border: "1px solid transparent" }
                }
              >
                {tab.label}
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: active ? "var(--emerald-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                    color: active ? "white" : "var(--fg-mute)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Inbox 2-col */}
        {activeTab === "inbox" && (
          <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 200px)" }}>

            {/* Left — conversation list */}
            <div
              className="col-span-4 rounded-[18px] overflow-hidden flex flex-col"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="p-4 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Réponses reçues</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {CONVERSATIONS.map((c) => {
                  const style = intentStyle(c.intent);
                  const active = selectedConv === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedConv(c.id)}
                      className="w-full text-left px-4 py-3.5 transition-all hover:brightness-[0.97]"
                      style={{
                        background: active ? "var(--emerald-soft)" : "transparent",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                          style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                        >
                          {c.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                              {c.name}
                              {c.unread && (
                                <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: "var(--emerald-fg)" }} />
                              )}
                            </p>
                            <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>{c.time}</span>
                          </div>
                          <p className="text-[11px] mb-1" style={{ color: "var(--fg-mute)" }}>{c.co}</p>
                          <p className="text-[11.5px] truncate" style={{ color: "var(--fg-dim)" }}>{c.preview}</p>
                          <span
                            className="mt-1.5 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {c.intent}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right — conversation detail */}
            <div
              className="col-span-8 rounded-[18px] flex flex-col overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                  >
                    {conv.initials}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{conv.name}</p>
                    <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{conv.co}</p>
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded"
                  style={{ background: intentStyle(conv.intent).bg, color: intentStyle(conv.intent).color }}
                >
                  {conv.intent}
                </span>
              </div>

              {/* Messages timeline */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {conv.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}>
                    <div
                      className="max-w-[70%] rounded-[12px] px-4 py-3"
                      style={
                        msg.role === "ai"
                          ? { background: "var(--bg)", border: "1px solid var(--line)" }
                          : { background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }
                      }
                    >
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--fg)" }}>{msg.text}</p>
                      <p className="text-[10px] mt-1.5" style={{ color: "var(--fg-mute)" }}>{msg.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI suggested replies */}
              <div className="px-6 py-4 space-y-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="flex items-center gap-1.5 mb-3 text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                  <Zap className="h-3 w-3" style={{ color: "var(--emerald-fg)" }} />
                  Réponses IA suggérées
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {AI_REPLIES.map((reply) => (
                    <button
                      key={reply.type}
                      onClick={() => setReplyText(reply.text)}
                      className="text-left p-3.5 rounded-[12px] transition-all hover:brightness-[0.97]"
                      style={{
                        background: `var(--${reply.accent}-soft)`,
                        border: `1px solid var(--${reply.accent}-line)`,
                      }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: `var(--${reply.accent}-fg)` }}>
                        {reply.type}
                      </p>
                      <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: "var(--fg-dim)" }}>{reply.text}</p>
                    </button>
                  ))}
                </div>

                {/* Composer */}
                <div
                  className="flex items-end gap-3 px-4 py-3 rounded-[12px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                >
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="flex-1 bg-transparent text-[13px] outline-none resize-none placeholder:opacity-50"
                    style={{ color: "var(--fg)" }}
                    placeholder="Répondre..."
                  />
                  <button
                    className="p-2 rounded-[8px] transition-all hover:brightness-110 shrink-0"
                    style={{ background: "var(--emerald-fg)", color: "white" }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sequences view */}
        {activeTab === "sequences" && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="space-y-2">
              <div
                className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: "2.5fr 1fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
              >
                <span>Séquence</span><span>Canaux</span><span>Leads</span><span>Taux rép.</span><span>Statut</span>
              </div>
              {SEQUENCES.map((seq) => {
                const style = statusStyle(seq.status);
                return (
                  <div
                    key={seq.id}
                    className="grid items-center gap-4 px-4 py-4 rounded-[12px] cursor-pointer transition-all hover:brightness-[0.97]"
                    style={{ gridTemplateColumns: "2.5fr 1fr 1fr 1fr 1fr", background: "var(--bg)", border: "1px solid var(--line)" }}
                  >
                    <span className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{seq.name}</span>
                    <div className="flex items-center gap-1.5">
                      {seq.channels.includes("email") && (
                        <Mail className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                      )}
                      {seq.channels.includes("linkedin") && (
                        <Linkedin className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                      )}
                      {seq.channels.includes("sms") && (
                        <MessageSquare className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
                      )}
                    </div>
                    <span className="text-[13px] font-mono" style={{ color: "var(--fg-dim)" }}>{seq.leads}</span>
                    <span
                      className="text-[13px] font-semibold tabular-nums"
                      style={{ color: seq.replyRate !== "—" ? "var(--emerald-fg)" : "var(--fg-mute)" }}
                    >
                      {seq.replyRate}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded w-fit"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {seq.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
