"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@astryxdesign/core/Popover";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import { api, Notification } from "@/lib/api";
import Icon from "../ui/Icon";

const TYPE_ICON: Record<string, string> = {
  assigned: "assignment_ind",
  commented: "chat_bubble",
  mentioned: "alternate_email",
  due_soon: "event_upcoming",
};

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const r = await api.notifications();
      setItems(r.notifications);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000); // poll every 30s
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function markRead(n: Notification) {
    if (n.readAt) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    await api.markNotificationRead(n.id).catch(() => load());
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="below"
      alignment="end"
      width={340}
      label="Thông báo"
      content={
        <VStack gap={0} hAlign="stretch">
          <Toolbar
            label="Thông báo"
            size="sm"
            startContent={<Text type="label">Thông báo</Text>}
            endContent={
              <Button
                label="Đọc hết"
                variant="ghost"
                size="sm"
                clickAction={() => api.markAllNotificationsRead().then(load)}
              />
            }
          />
          {/* Dense, scannable records → rows edge-to-edge, không bọc Card. */}
          {items.length === 0 ? (
            <EmptyState title="Không có thông báo." isCompact />
          ) : (
            <VStack isScrollable height={384} hAlign="stretch">
            <List hasDividers>
              {items.map((n) => (
                <ListItem
                  key={n.id}
                  isSelected={!n.readAt}
                  startContent={<Icon name={TYPE_ICON[n.type] ?? "notifications"} size={18} />}
                  label={n.title}
                  description={n.body || new Date(n.createdAt).toLocaleString()}
                  // Notifications were dead text — being assigned a task or
                  // mentioned gave you no way to reach it. `link` comes from the
                  // backend and opens the task (and the comment, for mentions).
                  isDisabled={!n.link}
                  onClick={() => {
                    if (!n.link) return;
                    markRead(n);
                    setOpen(false);
                    router.push(n.link);
                  }}
                  endContent={
                    !n.readAt ? (
                      <IconButton
                        label="Đánh dấu đã đọc"
                        tooltip="Đánh dấu đã đọc"
                        variant="ghost"
                        size="sm"
                        icon={<Icon name="done" size={16} />}
                        onClick={() => markRead(n)}
                      />
                    ) : undefined
                  }
                />
              ))}
            </List>
            </VStack>
          )}
        </VStack>
      }>
      {/* IconButton không có endContent, nên badge đếm nằm cạnh nút thay vì
          đè lên góc. Badge ở đây đúng vai trò: một con số đếm. */}
      <HStack gap={0.5} vAlign="center">
        <IconButton
          label="Thông báo"
          variant="ghost"
          icon={<Icon name="notifications" size={22} />}
        />
        {unread > 0 && <Badge variant="error" label={unread > 9 ? "9+" : unread} />}
      </HStack>
    </Popover>
  );
}
