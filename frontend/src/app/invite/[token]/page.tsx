"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Center } from "@astryxdesign/core/Center";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "var(--color-background-body)",
  padding: "var(--spacing-4)",
};

/**
 * Landing page for an invitation link.
 *
 * The token is redeemed server-side against the signed-in user, so an
 * unauthenticated visitor is sent to log in first and returns here afterwards.
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error" | "anon">("working");
  const [message, setMessage] = useState("");

  const accept = useCallback(async () => {
    try {
      await api.me();
    } catch {
      setState("anon");
      return;
    }
    try {
      const r = await api.acceptInvite(token);
      setState("done");
      setTimeout(() => router.replace(`/workspaces/${r.workspaceId}`), 1200);
    } catch (err) {
      setMessage((err as Error).message);
      setState("error");
    }
  }, [token, router]);

  useEffect(() => {
    accept();
  }, [accept]);

  return (
    <Center axis="both" style={pageStyle}>
      <Card padding={8} width="100%" maxWidth={400}>
        {state === "working" && (
          <VStack gap={3} hAlign="center">
            <Spinner size="md" />
            <Text>Đang xử lý lời mời…</Text>
          </VStack>
        )}

        {state === "done" && (
          <EmptyState
            title="Đã tham gia workspace"
            description="Đang chuyển hướng…"
            icon={<Icon name="check_circle" size={32} />}
            isCompact
          />
        )}

        {state === "anon" && (
          <EmptyState
            title="Cần đăng nhập"
            description="Hãy đăng nhập bằng đúng email đã được mời, rồi mở lại liên kết này."
            icon={<Icon name="login" size={32} />}
            isCompact
            actions={
              <Button
                label="Đăng nhập với Microsoft"
                variant="primary"
                clickAction={() => {
                  window.location.href = api.loginUrl();
                }}
              />
            }
          />
        )}

        {state === "error" && (
          <EmptyState
            title="Không thể tham gia"
            description={message}
            icon={<Icon name="error" size={32} />}
            isCompact
            actions={
              <Button label="Về trang chủ" variant="ghost" clickAction={() => router.replace("/")} />
            }
          />
        )}
      </Card>
    </Center>
  );
}
