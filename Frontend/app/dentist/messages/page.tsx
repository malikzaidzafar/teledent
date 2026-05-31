"use client";
import { useEffect, useState, useRef } from "react";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Avatar, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { messagesApi, type ConversationOut, type MessageOut } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface ConvMeta {
  conv: ConversationOut;
  otherName: string;
  lastMsg?: MessageOut;
  unread: number;
}

export default function DentistMessagesPage() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const [convMetas, setConvMetas] = useState<ConvMeta[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationOut | null>(null);
  const [activeOtherName, setActiveOtherName] = useState("");
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading) loadConversations();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [authLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    setLoading(true);
    try {
      const convs = await messagesApi.listConversations();      const metas = await Promise.all(
        convs.map(async (conv) => {
          const msgs = await messagesApi.listMessages(conv.id).catch(() => [] as MessageOut[]);
          const unread = msgs.filter(m => m.sender_id !== user?.id && !m.is_read).length;
          const otherId = conv.patient_id;
          const otherName = `Patient ${otherId.slice(0, 6).toUpperCase()}`;
          return { conv, otherName, lastMsg: msgs[msgs.length - 1], unread };
        })
      );
      setConvMetas(metas);
      if (metas.length > 0 && !activeConv) {
        openConversation(metas[0]);
      }
    } catch {}
    setLoading(false);
  }

  async function openConversation(meta: ConvMeta) {
    setActiveConv(meta.conv);
    setActiveOtherName(meta.otherName);
    await loadMessages(meta.conv.id);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(meta.conv.id), 5000);
  }

  async function loadMessages(convId: string) {
    try {
      const msgs = await messagesApi.listMessages(convId);
      setMessages(msgs);
    } catch {}
  }

  async function sendMessage() {
    if (!input.trim() || !activeConv || sending) return;
    setSending(true);
    try {
      const msg = await messagesApi.sendMessage(activeConv.id, input.trim());
      setMessages(prev => [...prev, msg]);
      setInput("");
      loadConversations();
    } catch {}
    setSending(false);
  }

  if (authLoading) return null;

  return (
    <AppLayout role="dentist" pageTitle="Messages">
      <PageHeader title="Messages" subtitle="Secure patient communication" />
      <div className="page-body">
        {loading ? (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}></div>
              <div style={{ color: "var(--text-muted)" }}>Loading conversations…</div>
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, height: "calc(100vh - 180px)" }}>
            {/* Conversation List */}
            <SectionCard title={`Conversations (${convMetas.length})`}>
              <div style={{ overflowY: "auto" }}>
                {convMetas.length === 0 && (
                  <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                    No conversations yet.
                  </div>
                )}
                {convMetas.map((meta) => (
                  <div key={meta.conv.id} onClick={() => openConversation(meta)} style={{ padding: "14px 16px", borderBottom: "1px solid var(--surface-3)", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: activeConv?.id === meta.conv.id ? "var(--brand-blue-light)" : "transparent" }}>
                    <Avatar name={meta.otherName} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.otherName}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{meta.lastMsg ? fmtTime(meta.lastMsg.sent_at) : ""}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.lastMsg?.text ?? "No messages yet"}</div>
                    </div>
                    {meta.unread > 0 && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--brand-blue)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{meta.unread}</div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Chat Window */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              {!activeConv ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  Select a conversation to start chatting.
                </div>
              ) : (
                <>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar name={activeOtherName} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{activeOtherName}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <Link href="/dentist/video" className="btn btn-primary btn-sm"> Video Call</Link>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                    {messages.length === 0 && (
                      <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginTop: 40 }}>No messages yet. Say hello!</div>
                    )}
                    {messages.map((m) => {
                      const isMe = m.sender_id === user?.id;
                      return (
                        <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                          <div style={{ maxWidth: "72%", background: isMe ? "var(--brand-blue)" : "var(--surface-3)", color: isMe ? "#fff" : "var(--text-primary)", borderRadius: "var(--radius-lg)", padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
                            <p style={{ margin: 0 }}>{m.text}</p>
                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7, textAlign: "right" }}>{fmtClock(m.sent_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
                    <input
                      className="input"
                      placeholder="Type a message…"
                      style={{ flex: 1 }}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      disabled={sending}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>
                      {sending ? "…" : "Send "}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </div>
    </AppLayout>
  );
}
