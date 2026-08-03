"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { api, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const router = useRouter();

  useEffect(() => {
    api
      .listWorkspaces()
      .then((res) => {
        const wss = res || [];
        setWorkspaces(wss);
        if (wss.length > 0) {
          let activeId = localStorage.getItem("activeWorkspaceId");
          if (!activeId || !wss.some((w) => w.id === activeId)) {
            activeId = wss[0].id;
            localStorage.setItem("activeWorkspaceId", activeId);
          }
          router.replace(`/workspaces/${activeId}`);
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <AppShell title={null}>
      <Section variant="transparent" padding={8} maxWidth={1400}>
        <VStack gap={8} hAlign="stretch">
          <Center axis="horizontal">
            <VStack gap={1} hAlign="center">
              <Heading level={2}>Chào mừng trở lại 👋</Heading>
              <Text color="secondary">
                Vui lòng chọn một Không gian làm việc bên dưới để bắt đầu.
              </Text>
            </VStack>
          </Center>

          {/* Card grid là đúng vai trò ở đây: đây là màn hình chọn dạng gallery,
              không phải danh sách dữ liệu dày cần quét bằng mắt. */}
          {workspaces.length > 0 ? (
            <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={5}>
              {workspaces.map((ws) => (
                <ClickableCard
                  key={ws.id}
                  label={ws.name}
                  href={`/workspaces/${ws.id}`}
                  padding={5}
                  elevation="low">
                  <HStack gap={4} vAlign="center">
                    <Icon name="workspaces" size={24} />
                    <VStack gap={0.5}>
                      <Text weight="bold" maxLines={1}>
                        {ws.name}
                      </Text>
                      <Text type="supporting" maxLines={1}>
                        /{ws.slug}
                      </Text>
                    </VStack>
                  </HStack>
                </ClickableCard>
              ))}
            </Grid>
          ) : (
            <EmptyState
              title="Bạn chưa được phân quyền vào Không gian làm việc nào"
              description="Vui lòng liên hệ Admin hệ thống để được cấp quyền."
              icon={<Icon name="workspaces" size={40} />}
            />
          )}
        </VStack>
      </Section>
    </AppShell>
  );
}
