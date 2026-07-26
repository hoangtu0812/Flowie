"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, ChatChannel, ChatMessage, Project, User } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import Avatar from "@/components/ui/Avatar";
import { useProjectEvents } from "@/lib/useProjectEvents";

// Fallback poll: realtime (SSE) drives updates, this only covers a dropped
// stream that has not reconnected yet.
const POLL_MS = 30000;

export default function ProjectChatPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [active, setActive] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.me().then(setMe).catch(() => {});
  }, [id]);

  const loadChannels = useCallback(async () => {
    const cs = await api.listChannels(id).catch(() => []);
    setChannels(cs);
    setActive((cur) => cur || (cs.length > 0 ? cs[0].id : ""));
  }, [id]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async () => {
    if (!active) return;
    const ms = await api.listMessages(active).catch(() => []);
    setMessages(ms);
  }, [active]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Poll the open channel so other people's messages show up.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      loadMessages();
      loadChannels();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, loadMessages, loadChannels]);

  // Live updates: new messages arrive without waiting for the poll.
  useProjectEvents(id, (ev) => {
    if (ev.type === "chat.message") {
      loadMessages();
      loadChannels();
    }
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !active) return;
    setDraft("");
    try {
      const m = await api.postMessage(active, body);
      setMessages((p) => [...p, m]);
      loadChannels();
    } catch (err) {
      setError((err as Error).message);
      setDraft(body);
    }
  }

  async function createChannel() {
    const name = newChannel.trim();
    if (!name) return;
    try {
      const c = await api.createChannel(id, name);
      setNewChannel("");
      setChannels((p) => [...p, c]);
      setActive(c.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell title={project ? `${project.key} · Chat` : "Chat"}>
      <div className="p-lg max-w-[1400px]">
        <ProjectTabs projectId={id} />

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        <div className="flex gap-lg" style={{ height: "calc(100vh - 220px)" }}>
          {/* Channel list */}
          <aside className="w-60 shrink-0 card p-sm flex flex-col">
            <p className="text-label-sm uppercase text-on-surface-variant px-2 py-1">Kênh</p>
            <div className="flex-grow overflow-y-auto flex flex-col gap-1">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                    active === c.id
                      ? "bg-primary-container/10 text-primary font-medium"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon name="tag" size={16} />
                    <span className="truncate text-body-sm">{c.name}</span>
                  </span>
                  {c.unread > 0 && active !== c.id && (
                    <span className="min-w-5 h-5 px-1 bg-error text-on-error rounded-full text-label-sm flex items-center justify-center">
                      {c.unread > 9 ? "9+" : c.unread}
                    </span>
                  )}
                </button>
              ))}
              {channels.length === 0 && (
                <p className="px-3 py-2 text-body-sm text-on-surface-variant/60">Chưa có kênh nào.</p>
              )}
            </div>
            <div className="flex gap-1 mt-sm pt-sm border-t border-outline-variant">
              <input
                className="field text-body-sm"
                placeholder="Kênh mới…"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createChannel()}
              />
              <button className="btn-ghost" onClick={createChannel} title="Tạo kênh">
                <Icon name="add" size={18} />
              </button>
            </div>
          </aside>

          {/* Messages */}
          <section className="flex-grow card flex flex-col min-w-0">
            {active ? (
              <>
                <div className="flex-grow overflow-y-auto p-lg flex flex-col gap-md">
                  {messages.map((m) => {
                    const mine = me?.id && m.authorId === me.id;
                    return (
                      <div key={m.id} className={`flex gap-sm ${mine ? "flex-row-reverse" : ""}`}>
                        <Avatar name={m.authorName || m.authorEmail} size={32} />
                        <div className={`max-w-[70%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                          <p className="text-label-sm text-on-surface-variant/70">
                            {mine ? "Bạn" : m.authorName || m.authorEmail}{" "}
                            · {new Date(m.createdAt).toLocaleString()}
                          </p>
                          <div
                            className={`px-3 py-2 rounded-2xl text-body-md whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-primary text-on-primary rounded-br-sm"
                                : "bg-surface-container-high text-on-surface rounded-bl-sm"
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <p className="text-body-sm text-on-surface-variant/60 m-auto">
                      Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.
                    </p>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div className="flex gap-sm p-md border-t border-outline-variant">
                  <input
                    className="field flex-grow"
                    placeholder="Nhắn tin… (dùng @ để nhắc tên)"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                  />
                  <button className="btn-primary" onClick={send} disabled={!draft.trim()}>
                    <Icon name="send" size={18} />
                  </button>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-on-surface-variant/60 p-xl">
                <Icon name="forum" size={40} className="text-outline mb-sm" />
                <p>Tạo một kênh để bắt đầu trò chuyện.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
