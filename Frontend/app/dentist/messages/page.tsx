"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/common/AppLayout";
import { PageHeader, Avatar, SectionCard } from "@/components/ui/shared";
import Link from "next/link";
import { messagesApi, appointmentApi, type ConversationOut, type MessageOut, type Appointment } from "@/lib/api";
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

function DentistMessagesInner() {
  const { user, loading: authLoading } = useRequireAuth("dentist");
  const searchParams = useSearchParams();
  const [convMetas, setConvMetas] = useState<ConvMeta[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationOut | null>(null);
  const [activeOtherName, setActiveOtherName] = useState("");
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoDate, setVideoDate] = useState("");
  const [videoTime, setVideoTime] = useState("");
  const [videoRequestSent, setVideoRequestSent] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [startingConv, setStartingConv] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-open conversation from ?conv= param
  useEffect(() => {
    const convId = searchParams.get("conv");
    if (convId && convMetas.length > 0) {
      const target = convMetas.find(m => m.conv.id === convId);
      if (target) openConversation(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, convMetas]);

  useEffect(() => {
    if (!authLoading) {
      loadConversations();
      loadAppointments();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [authLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadAppointments() {
    try {
      const res = await appointmentApi.list(1);
      const active = (res.data || []).filter(
        a => a.status === "pending" || a.status === "confirmed" || a.status === "completed"
      );
      setAppointments(active);
    } catch {}
  }

  async function loadConversations(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const convs = await messagesApi.listConversations();
      const metas = await Promise.all(
        convs.map(async (conv) => {
          const msgs = await messagesApi.listMessages(conv.id).catch(() => [] as MessageOut[]);
          const unread = msgs.filter(m => m.sender_id !== user?.id && !m.is_read).length;
          const otherName = conv.other_user_name || "Unknown";
          return { conv, otherName, lastMsg: msgs[msgs.length - 1], unread };
        })
      );
      setConvMetas(metas);
      if (metas.length > 0 && !activeConv) {
        openConversation(metas[0]);
      }
    } catch {}
    if (!isBackground) setLoading(false);
  }

  async function openConversation(meta: ConvMeta) {
    setActiveConv(meta.conv);
    setActiveOtherName(meta.otherName);
    setVideoRequestSent(false);
    await loadMessages(meta.conv.id);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(meta.conv.id), 5000);
  }

  // WP3D: use patient_user_id for dentist-initiated conversations
  async function startConversationWithPatient(patientUserId: string, displayName?: string) {
    if (!patientUserId) return;
    setStartingConv(patientUserId);
    try {
      const conv = await messagesApi.startConversation(patientUserId);
      await loadConversations();
      const meta: ConvMeta = {
        conv,
        otherName: conv.other_user_name || displayName || "Unknown",
        unread: 0,
      };
      openConversation(meta);
    } catch {}
    setStartingConv(null);
  }

  async function sendVideoRequest() {
    if (!videoDate || !videoTime || !activeConv) return;
    const dateTimeStr = `${videoDate} at ${videoTime}`;
    const text = `Video Call Request: I would like to schedule a video consultation on ${dateTimeStr}. Please confirm if this works for you.`;
    setSending(true);
    try {
      const msg = await messagesApi.sendMessage(activeConv.id, text);
      setMessages(prev => [...prev, msg]);
      loadConversations(true);
    } catch {}
    setSending(false);
    setShowVideoModal(false);
    setVideoDate("");
    setVideoTime("");
    setVideoRequestSent(true);
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
      loadConversations(true);
    } catch {}
    setSending(false);
  }

  if (authLoading) return null;

  // Patient user_ids already in conversations
  const existingPatientUserIds = new Set(convMetas.map(m => m.conv.patient_id));

  // Deduplicate: appointments without existing conv, using patient_user_id
  const seenPatients = new Set<string>();
  const appointmentsWithoutConv = appointments.filter(a => {
    const uid = a.patient_user_id;
    if (!uid || existingPatientUserIds.has(uid) || seenPatients.has(uid)) return false;
    seenPatients.add(uid);
    return true;
  });

  // WP4C: find confirmed appointment for the active conversation's patient
  const confirmedAppt = activeConv
    ? appointments.find(a => a.patient_user_id === activeConv.patient_id)
    : null;

  return (
    <AppLayout role="dentist" pageTitle="Messages">
      <PageHeader title="Messages" subtitle="Secure patient communication" />
      <div className="page-body">
        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ color: "var(--text-muted)" }}>Loading conversations...</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, height: "calc(100vh - 180px)" }}>
            {/* Conversation List */}
            <SectionCard title={`Conversations (${convMetas.length})`}>
              <div style={{ overflowY: "auto", height: "100%" }}>
                {convMetas.length === 0 && appointmentsWithoutConv.length === 0 && (
                  <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                    No conversations yet.<br />
                    <span style={{ fontSize: 12 }}>Conversations will appear here once patients book with you.</span>
                  </div>
                )}

                {/* Existing conversations */}
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

                {/* Start new conversations for appointment patients without chats */}
                {appointmentsWithoutConv.length > 0 && (
                  <>
                    {convMetas.length > 0 && (
                      <div style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--surface-2)" }}>
                        Start New Conversation
                      </div>
                    )}
                    {appointmentsWithoutConv.map((a) => (
                      <div key={a.id} style={{ padding: "14px 16px", borderBottom: "1px solid var(--surface-3)", display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar name={a.patient_name || "PT"} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.patient_name || "Patient"}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>
                            {a.status} · {new Date(a.scheduled_at).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => startConversationWithPatient(a.patient_user_id ?? "", a.patient_name)}
                          disabled={startingConv === a.patient_user_id}
                          style={{ flexShrink: 0 }}
                        >
                          {startingConv === a.patient_user_id ? "…" : "Message"}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </SectionCard>

            {/* Chat Window */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              {!activeConv ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", gap: 16, padding: 40 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>No conversation selected</div>
                  {appointmentsWithoutConv.length > 0 ? (
                    <div style={{ textAlign: "center", fontSize: 13 }}>
                      You have patients with appointments.<br />
                      <button
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => startConversationWithPatient(
                          appointmentsWithoutConv[0].patient_user_id ?? "",
                          appointmentsWithoutConv[0].patient_name
                        )}
                        disabled={startingConv !== null}
                      >
                        {startingConv ? "Starting…" : "Start Conversation"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13 }}>Select a conversation to start chatting.</div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar name={activeOtherName} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{activeOtherName}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Your patient</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {videoRequestSent && (
                        <span style={{ fontSize: 12, color: "var(--brand-blue)", background: "var(--brand-blue-light)", padding: "4px 10px", borderRadius: 20 }}>
                          Video request sent
                        </span>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowVideoModal(true)}
                      >
                        Schedule Call
                      </button>
                      {/* WP4C: Join Video only when there is a confirmed appointment with this patient */}
                      {confirmedAppt && (
                        <Link
                          href={`/dentist/video?appointment_id=${confirmedAppt.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          Join Video Call
                        </Link>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                    {messages.length === 0 && (
                      <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginTop: 40 }}>No messages yet. Start the conversation.</div>
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
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showVideoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: 32, width: 420, maxWidth: "90vw", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Schedule a Video Call</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Suggest a date and time to the patient. A message will be sent in the chat — they can confirm or propose a different time.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Preferred Date</label>
                <input type="date" className="input" style={{ width: "100%" }} min={new Date().toISOString().split("T")[0]} value={videoDate} onChange={e => setVideoDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Preferred Time</label>
                <input type="time" className="input" style={{ width: "100%" }} value={videoTime} onChange={e => setVideoTime(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => { setShowVideoModal(false); setVideoDate(""); setVideoTime(""); }}>Cancel</button>
              <button className="btn btn-primary" disabled={!videoDate || !videoTime} onClick={sendVideoRequest}>Send Request</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function DentistMessagesPage() {
  return (
    <Suspense fallback={null}>
      <DentistMessagesInner />
    </Suspense>
  );
}
