"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@astryxdesign/core/TopNav";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { HStack } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Kbd } from "@astryxdesign/core/Kbd";
import { IconButton } from "@astryxdesign/core/IconButton";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { api, User, Workspace } from "@/lib/api";
import { materialIcon } from "../ui/materialIcon";
import NotificationBell from "./NotificationBell";
import TimerWidget from "../task/TimerWidget";
import ThemeToggle from "./ThemeToggle";

const HelpIcon = materialIcon("help_outline");
const SettingsIcon = materialIcon("settings");
const WorkspaceIcon = materialIcon("workspaces");
const LogoutIcon = materialIcon("logout");

export default function TopBar({
  title,
  user,
  actions,
}: {
  title: React.ReactNode;
  user: User | null;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    setActiveWorkspaceId(localStorage.getItem("activeWorkspaceId"));
    if (user) {
      api.listWorkspaces().then((res) => setWorkspaces(res || [])).catch(() => {});
    }
  }, [user]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const workspaceItems =
    workspaces.length === 0
      ? [{ label: "Chưa có không gian làm việc", isDisabled: true }]
      : workspaces.map((ws) => ({
          label: ws.name,
          onClick: () => {
            localStorage.setItem("activeWorkspaceId", ws.id);
            setActiveWorkspaceId(ws.id);
            router.push(`/workspaces/${ws.id}`);
          },
        }));

  return (
    <>
      <TopNav
        label="Thanh điều hướng chính"
        startContent={
          <HStack gap={3} vAlign="center">
            <TextInput
              label="Tìm kiếm"
              isLabelHidden
              type="text"
              placeholder="Tìm kiếm…"
              value={search}
              onChange={setSearch}
              width={240}
            />
            <Kbd keys="mod+k" />
            <DropdownMenu
              button={{
                label: activeWorkspace?.name || "Chọn không gian làm việc",
                icon: <Icon icon={WorkspaceIcon} />,
                variant: "secondary",
              }}
              items={[{ type: "section", title: "Không gian làm việc", items: workspaceItems }]}
            />
          </HStack>
        }
        endContent={
          <HStack gap={1} vAlign="center">
            <TimerWidget />
            <NotificationBell />
            <ThemeToggle />
            <IconButton label="Trợ giúp" icon={<Icon icon={HelpIcon} />} variant="ghost" />
            <IconButton
              label="Cài đặt"
              icon={<Icon icon={SettingsIcon} />}
              variant="ghost"
              onClick={() => router.push("/settings")}
            />
            {user && (
              <DropdownMenu
                hasChevron={false}
                button={{
                  label: user.displayName || user.email,
                  isIconOnly: true,
                  variant: "ghost",
                  icon: (
                    <Avatar
                      name={user.displayName || user.email}
                      src={user.avatarUrl || undefined}
                      size="sm"
                      tooltip={false}
                    />
                  ),
                }}
                menuWidth={224}
                items={[
                  {
                    type: "section",
                    title: user.email,
                    items: [
                      {
                        label: "Đăng xuất",
                        icon: <Icon icon={LogoutIcon} />,
                        onClick: async () => {
                          await api.logout();
                          window.location.href = "/login";
                        },
                      },
                    ],
                  },
                ]}
              />
            )}
          </HStack>
        }
      />

      {/* Hàng tiêu đề trang. `title` và `actions` từng được nhận làm prop nhưng
          không hề render, khiến mọi nút cấp trang (Dự án mới, Sprint mới, Tạo
          mới, xuất CSV…) trở nên vô hình. Giữ nguyên hành vi đã sửa. */}
      {(title || actions) && (
        <Toolbar
          label="Hành động của trang"
          startContent={
            <Text type="large" weight="bold" maxLines={1}>
              {title}
            </Text>
          }
          endContent={actions}
        />
      )}
    </>
  );
}
