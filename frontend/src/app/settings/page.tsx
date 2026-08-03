"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Code } from "@astryxdesign/core/Code";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, User, UserSession } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

/** GDPR controls: export everything, or erase the account. */
function PrivacyCard({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function erase() {
    const typed = window.prompt(
      `Hành động này KHÔNG THỂ HOÀN TÁC.\n\n` +
        `Hồ sơ của bạn sẽ bị ẩn danh và tài khoản bị vô hiệu hoá. ` +
        `Công việc/bình luận vẫn còn nhưng không còn gắn với bạn.\n\n` +
        `Nhập email của bạn để xác nhận:`,
    );
    if (!typed) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteMyData(typed.trim());
      window.location.href = "/login";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1}>
          <Heading level={3}>Dữ liệu cá nhân</Heading>
          <Text type="supporting">Quyền truy cập, mang theo và xoá dữ liệu theo GDPR.</Text>
        </VStack>

        {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

        <HStack gap={2} wrap="wrap">
          <Button
            label="Tải bản sao dữ liệu (JSON)"
            variant="ghost"
            icon={<Icon name="download" size={18} />}
            href={api.exportMyDataUrl()}
          />
          <Button
            label="Xoá tài khoản của tôi"
            variant="destructive"
            icon={<Icon name="delete_forever" size={18} />}
            isDisabled={busy}
            clickAction={erase}
          />
        </HStack>

        {email && <Text type="supporting">Xác nhận bằng email: {email}</Text>}
      </VStack>
    </Card>
  );
}

/** Enrol / manage TOTP two-factor authentication. */
function TwoFactorCard() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryCodesLeft: number } | null>(
    null,
  );
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.twoFactorStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.startTwoFactor();
      setUri(r.provisioningUri);
      setSecret(r.secret);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.enableTwoFactor(code.trim());
      setCodes(r.recoveryCodes);
      setUri(null);
      setCode("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const c = window.prompt("Nhập mã 2FA (hoặc mã khôi phục) để tắt xác thực hai lớp:");
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      await api.disableTwoFactor(c.trim());
      setCodes(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <HStack gap={4} vAlign="start">
          <VStack gap={1}>
            <Heading level={3}>Xác thực hai lớp (2FA)</Heading>
            <Text type="supporting">
              Dùng ứng dụng như Google Authenticator / Microsoft Authenticator.
            </Text>
          </VStack>
          <StackItem size="fill" />
          {status?.enabled && <Badge variant="success" label="Đang bật" />}
        </HStack>

        {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

        {codes && (
          <Card variant="blue" padding={4}>
            <VStack gap={2} hAlign="stretch">
              <Text weight="semibold">
                Lưu lại các mã khôi phục này — chúng chỉ hiện một lần:
              </Text>
              <Grid columns={{ minWidth: 120, repeat: "fit" }} gap={1}>
                {codes.map((c) => (
                  <Code key={c}>{c}</Code>
                ))}
              </Grid>
            </VStack>
          </Card>
        )}

        {!status?.enabled && !uri && (
          <HStack>
            <Button
              label="Thiết lập 2FA"
              variant="primary"
              icon={<Icon name="shield_lock" size={18} />}
              isDisabled={busy}
              clickAction={start}
            />
          </HStack>
        )}

        {uri && (
          <VStack gap={3} hAlign="start">
            <Text type="supporting">
              Quét mã QR bằng ứng dụng xác thực, hoặc nhập khoá thủ công:
            </Text>
            {/* QR rendered by a public chart service; the secret is short-lived
                and not yet active until confirmed below. */}
            <img
              alt="QR 2FA"
              width={160}
              height={160}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`}
            />
            <Code>{secret}</Code>
            <HStack gap={2} vAlign="end">
              <TextInput
                label="Mã xác thực"
                isLabelHidden
                width={160}
                placeholder="000000"
                value={code}
                onChange={setCode}
                onEnter={() => {
                  if (code.trim().length >= 6) enable();
                }}
              />
              <Button
                label="Bật 2FA"
                variant="primary"
                isDisabled={busy || code.trim().length < 6}
                clickAction={enable}
              />
            </HStack>
          </VStack>
        )}

        {status?.enabled && (
          <HStack gap={4} vAlign="center">
            <Text type="supporting">Còn {status.recoveryCodesLeft} mã khôi phục</Text>
            <Button
              label="Tắt 2FA"
              variant="destructive"
              icon={<Icon name="shield" size={18} />}
              isDisabled={busy}
              clickAction={disable}
            />
          </HStack>
        )}
      </VStack>
    </Card>
  );
}

// Turns a raw User-Agent into something readable in the device list.
function deviceLabel(ua: string): { icon: string; label: string } {
  if (!ua) return { icon: "devices", label: "Thiết bị không xác định" };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  let browser = "Trình duyệt";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  const label = [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
  return { icon: mobile ? "smartphone" : "computer", label };
}

export default function SettingsPage() {
  const [me, setMe] = useState<User | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    load();
  }, [load]);

  async function revoke(s: UserSession) {
    if (s.current) {
      if (!window.confirm("Đây là phiên hiện tại. Thu hồi sẽ đăng xuất bạn ngay. Tiếp tục?"))
        return;
    } else if (!window.confirm("Thu hồi phiên đăng nhập này?")) {
      return;
    }
    setBusy(s.id);
    try {
      await api.revokeSession(s.id);
      if (s.current) {
        window.location.href = "/login";
        return;
      }
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Cài đặt">
      {/* Settings → FormLayout/Section, Card chỉ để gom nhóm — đúng archetype
          "Settings / forms" trong `astryx docs layout`. */}
      <Section variant="transparent" padding={5} maxWidth={768}>
        <VStack gap={5} hAlign="stretch">
          <Card padding={5}>
            <VStack gap={4} hAlign="stretch">
              <Heading level={3}>Tài khoản</Heading>
              <HStack gap={4} vAlign="center">
                <Avatar
                  name={me?.displayName || me?.email || "?"}
                  src={me?.avatarUrl || undefined}
                  size={48}
                  tooltip={false}
                />
                <VStack gap={0.5}>
                  <Text type="large" weight="semibold">
                    {me?.displayName || "—"}
                  </Text>
                  <Text type="supporting" maxLines={1}>
                    {me?.email}
                  </Text>
                  {me?.isSystemAdmin && <Token label="System Admin" />}
                </VStack>
              </HStack>
            </VStack>
          </Card>

          <TwoFactorCard />
          <PrivacyCard email={me?.email} />

          <Card padding={5}>
            <VStack gap={4} hAlign="stretch">
              <HStack gap={4} vAlign="start">
                <VStack gap={1}>
                  <Heading level={3}>Thiết bị đang đăng nhập</Heading>
                  <Text type="supporting">Thu hồi để đăng xuất thiết bị đó ngay lập tức.</Text>
                </VStack>
                <StackItem size="fill" />
                <IconButton
                  label="Tải lại"
                  tooltip="Tải lại"
                  variant="ghost"
                  icon={<Icon name="refresh" size={18} />}
                  onClick={load}
                />
              </HStack>

              {error && (
                <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />
              )}

              {/* Danh sách thiết bị = record quét bằng mắt → rows, không Card. */}
              {sessions.length === 0 ? (
                <EmptyState
                  title="Không có phiên nào được ghi nhận"
                  description="Các phiên tạo trước khi bật tính năng này vẫn hoạt động nhưng không hiển thị ở đây."
                  isCompact
                />
              ) : (
                <List hasDividers>
                  {sessions.map((s) => {
                    const d = deviceLabel(s.device);
                    return (
                      <ListItem
                        key={s.id}
                        isSelected={s.current}
                        startContent={<Icon name={d.icon} size={20} />}
                        label={d.label}
                        description={`IP ${s.ip} · hoạt động ${new Date(s.lastSeen).toLocaleString()}`}
                        endContent={
                          <HStack gap={2} vAlign="center">
                            {s.current && <Badge variant="info" label="Phiên hiện tại" />}
                            <Button
                              label={busy === s.id ? "Đang thu hồi…" : "Thu hồi"}
                              variant="destructive"
                              size="sm"
                              icon={<Icon name="logout" size={18} />}
                              isDisabled={busy === s.id}
                              isLoading={busy === s.id}
                              clickAction={() => revoke(s)}
                            />
                          </HStack>
                        }
                      />
                    );
                  })}
                </List>
              )}
            </VStack>
          </Card>
        </VStack>
      </Section>
    </AppShell>
  );
}
