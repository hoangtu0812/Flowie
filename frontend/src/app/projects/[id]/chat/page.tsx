"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Layout, LayoutPanel, LayoutContent } from "@astryxdesign/core/Layout";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { ChatMessageList, ChatMessage as ChatBubbleRow, ChatMessageBubble } from "@astryxdesign/core/Chat";
import { TextInput } from "@astryxdesign/core/TextInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { Avatar } from "@astryxdesign/core/Avatar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, ChatChannel, ChatMessage, Project, User } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
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

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const loadMessages = useCallback(async () => {
    if (!active) return;
    const ms = await api.listMessages(active).catch(() => []);
    setMessages(ms);
  }, [active]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
      <Section variant="transparent" padding={5}>
        <VStack gap={5} hAlign="stretch">
          <ProjectTabs projectId={id} />

          {error && <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />}

          {/* Frame kiểu messaging: rail kênh 240px + luồng tin nhắn.
              Rows và bubble, không Card trong luồng (xem `astryx docs layout`). */}
          <Layout height="fill">
            <LayoutPanel width={240} hasDivider isScrollable label="Kênh">
              <VStack gap={2} hAlign="stretch" padding={2} height="100%">
                <Text type="label" color="secondary">
                  Kênh
                </Text>
                <StackItem size="fill">
                  {channels.length === 0 ? (
                    <Text type="supporting">Chưa có kênh nào.</Text>
                  ) : (
                    <List>
                      {channels.map((c) => (
                        <ListItem
                          key={c.id}
                          startContent={<Icon name="tag" size={16} />}
                          label={c.name}
                          isSelected={active === c.id}
                          onClick={() => setActive(c.id)}
                          endContent={
                            c.unread > 0 && active !== c.id ? (
                              <Badge variant="error" label={c.unread > 9 ? "9+" : c.unread} />
                            ) : undefined
                          }
                        />
                      ))}
                    </List>
                  )}
                </StackItem>
                <HStack gap={1} vAlign="center">
                  <StackItem size="fill">
                    <TextInput
                      label="Kênh mới"
                      isLabelHidden
                      size="sm"
                      placeholder="Kênh mới…"
                      value={newChannel}
                      onChange={setNewChannel}
                      onEnter={createChannel}
                    />
                  </StackItem>
                  <IconButton
                    label="Tạo kênh"
                    tooltip="Tạo kênh"
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="add" size={18} />}
                    clickAction={createChannel}
                  />
                </HStack>
              </VStack>
            </LayoutPanel>

            <LayoutContent>
              {active ? (
                <VStack gap={0} hAlign="stretch" height="100%">
                  <StackItem size="fill">
                    <ChatMessageList
                      emptyState={
                        <EmptyState
                          title="Chưa có tin nhắn"
                          description="Hãy bắt đầu cuộc trò chuyện."
                          isCompact
                        />
                      }>
                      {messages.map((m) => {
                        const mine = !!me?.id && m.authorId === me.id;
                        // `sender` của Astryx điều khiển căn trái/phải của bong
                        // bóng. Ánh xạ: tin của mình → 'user' (phải), của người
                        // khác → 'assistant' (trái).
                        return (
                          <ChatBubbleRow
                            key={m.id}
                            sender={mine ? "user" : "assistant"}
                            avatar={
                              <Avatar name={m.authorName || m.authorEmail} size={32} tooltip={false} />
                            }
                            name={mine ? "Bạn" : m.authorName || m.authorEmail}
                            metadata={new Date(m.createdAt).toLocaleString()}>
                            <ChatMessageBubble>{m.body}</ChatMessageBubble>
                          </ChatBubbleRow>
                        );
                      })}
                      <div ref={bottomRef} />
                    </ChatMessageList>
                  </StackItem>

                  <Section variant="transparent" padding={4} dividers={["top"]}>
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <TextInput
                          label="Nội dung tin nhắn"
                          isLabelHidden
                          placeholder="Nhắn tin… (dùng @ để nhắc tên)"
                          value={draft}
                          onChange={setDraft}
                          onEnter={send}
                        />
                      </StackItem>
                      <IconButton
                        label="Gửi"
                        tooltip="Gửi"
                        variant="primary"
                        icon={<Icon name="send" size={18} />}
                        isDisabled={!draft.trim()}
                        clickAction={send}
                      />
                    </HStack>
                  </Section>
                </VStack>
              ) : (
                <EmptyState
                  title="Tạo một kênh để bắt đầu trò chuyện."
                  icon={<Icon name="forum" size={40} />}
                />
              )}
            </LayoutContent>
          </Layout>
        </VStack>
      </Section>
    </AppShell>
  );
}
