"use client";

import { useEffect, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Center } from "@astryxdesign/core/Center";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Section } from "@astryxdesign/core/Section";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Button } from "@astryxdesign/core/Button";
import { api } from "@/lib/api";

// Grid phát ra minmax(MIN, 1fr); MIN cộng inset của grid và padding trang phải
// vừa màn hình hẹp nhất, nếu không cột bị cắt. 320 − 2×24 − 2×16 = 240.
const COLUMN_MIN_WIDTH = 240;

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "var(--color-background-body)",
  padding: "var(--spacing-6)",
};

// Container query nằm trong thẻ <style> thường nên KHÔNG cần CSS compiler.
// repeat:'fit' gộp hai cột thành một dưới 2×MIN + gap; query đảo thứ tự và
// siết inset đúng tại điểm đó, khoá theo bề rộng card (không phải cửa sổ).
const LOGIN_CSS = `
.flowie-login-grid {
  container-type: inline-size;
  container-name: flowie-login;
  padding: var(--spacing-8);
}
.flowie-login-aside { order: 0; }
@container flowie-login (max-width: 511px) {
  .flowie-login-grid { padding: var(--spacing-4); }
  .flowie-login-aside { display: none; }
}
`;

/** Logo Microsoft — brand mark, giữ nguyên màu gốc theo brand guideline. */
function MicrosoftLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Ô số liệu cho cột phải. Card ở đây là widget KPI — đúng vai trò của Card. */
function StatTile({ label, value, unit, delta }: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
}) {
  return (
    <Card padding={4} variant="muted">
      <VStack gap={2}>
        <Text type="label" color="secondary">{label}</Text>
        <HStack gap={1} vAlign="end">
          <Text type="display-3" weight="bold">{value}</Text>
          {unit ? <Text type="supporting">{unit}</Text> : null}
        </HStack>
        {delta ? <Text type="supporting" color="accent">{delta}</Text> : null}
      </VStack>
    </Card>
  );
}

export default function LoginPage() {
  const router = useRouter();

  // Nếu đã đăng nhập thì chuyển thẳng vào dashboard.
  useEffect(() => {
    api.me().then(() => router.replace("/")).catch(() => {});
  }, [router]);

  return (
    <Center axis="both" style={pageStyle}>
      <style>{LOGIN_CSS}</style>
      <VStack width="100%" maxWidth={1000} hAlign="stretch">
        <Card padding={0} width="100%">
          <Grid
            columns={{ minWidth: COLUMN_MIN_WIDTH, repeat: "fit" }}
            gap={8}
            align="stretch"
            className="flowie-login-grid">

            {/* ── Cột trái: form đăng nhập ── */}
            <Section variant="transparent" padding={0} height="100%">
              <VStack gap={6} height="100%">
                <StackItem size="fill">
                  <Center axis="vertical" height="100%">
                    <VStack gap={6} hAlign="stretch" width="100%">
                      <VStack gap={1}>
                        <Heading level={1}>Đăng nhập</Heading>
                        <Text type="body" color="secondary">
                          Nền tảng quản lý dự án doanh nghiệp Flowie
                        </Text>
                      </VStack>

                      <Button
                        label="Đăng nhập với Microsoft"
                        variant="secondary"
                        size="lg"
                        width="100%"
                        icon={<MicrosoftLogo />}
                        clickAction={() => { window.location.href = api.loginUrl(); }}
                      />

                      <Text type="supporting" justify="center">
                        Hệ thống chỉ hỗ trợ xác thực qua hệ sinh thái Azure Active
                        Directory nội bộ.
                      </Text>
                    </VStack>
                  </Center>
                </StackItem>
              </VStack>
            </Section>

            {/* ── Cột phải: điểm nhấn sản phẩm (ẩn khi hẹp) ── */}
            <Section
              variant="transparent"
              padding={0}
              height="100%"
              className="flowie-login-aside">
              <VStack gap={4} height="100%" vAlign="center">
                <Heading level={2}>Tính năng nổi bật</Heading>
                <Grid columns={{ minWidth: 140, repeat: "fit" }} gap={3}>
                  <StatTile label="Tổng công việc" value="425" delta="↗ +2,45%" />
                  <StatTile label="Hoàn thành" value="87" delta="↗ +21%" />
                </Grid>
                <StatTile label="Tiến độ dự án" value="72.550" unit="giờ" delta="64% kế hoạch" />
              </VStack>
            </Section>
          </Grid>
        </Card>
      </VStack>
    </Center>
  );
}
