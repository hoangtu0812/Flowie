"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Center } from "@astryxdesign/core/Center";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "var(--color-background-body)",
  padding: "var(--spacing-4)",
};

/** Second step of login: the user proves possession of their authenticator. */
export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyTwoFactor(code.trim());
      router.replace("/");
    } catch (err) {
      setError((err as Error).message || "Mã không đúng");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && code.trim().length >= 6;

  return (
    <Center axis="both" style={pageStyle}>
      <Card padding={8} width="100%" maxWidth={400}>
        <VStack gap={6} hAlign="stretch">
          <VStack gap={2} hAlign="center">
            <Icon name="shield_lock" size={28} />
            <Heading level={1}>Xác thực hai lớp</Heading>
            <Text type="supporting" justify="center">
              Nhập mã 6 chữ số từ ứng dụng xác thực của bạn.
            </Text>
          </VStack>

          <TextInput
            label="Mã xác thực"
            isLabelHidden
            hasAutoFocus
            placeholder="000000"
            value={code}
            onChange={setCode}
            onEnter={() => { if (canSubmit) submit(); }}
            size="lg"
            status={error ? { type: "error", message: error } : undefined}
          />

          <Button
            label={busy ? "Đang kiểm tra…" : "Xác nhận"}
            variant="primary"
            width="100%"
            isLoading={busy}
            isDisabled={!canSubmit}
            clickAction={submit}
          />

          <Text type="supporting" justify="center">
            Mất thiết bị? Nhập một mã khôi phục vào ô trên.
          </Text>
        </VStack>
      </Card>
    </Center>
  );
}
