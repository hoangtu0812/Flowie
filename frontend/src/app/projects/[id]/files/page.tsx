"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { ApiError, api, DriveItem, Project } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";

/**
 * SharePoint file browser.
 *
 * Attachments were already stored in the project's SharePoint folder, but the
 * only way to see them was through the task they were attached to. This lists
 * the folder itself.
 */
export default function ProjectFilesPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [root, setRoot] = useState("");
  const [path, setPath] = useState("");
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The project simply has no SharePoint folder yet — not a failure. */
  const [noFolder, setNoFolder] = useState(false);

  const load = useCallback(
    (p: string) => {
      setLoading(true);
      setError(null);
      setNoFolder(false);
      api
        .browseFiles(id, p)
        .then((r) => {
          setItems(r.items);
          setRoot(r.root);
          setPath(r.path);
        })
        .catch((e) => {
          const err = e as ApiError;
          if (err.code === "no_folder") setNoFolder(true);
          else setError(err.message);
          setItems([]);
        })
        .finally(() => setLoading(false));
    },
    [id],
  );

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    load("");
  }, [id, load]);

  const segments = path.split("/").filter(Boolean);

  return (
    <AppShell
      title={
        <HStack gap={2} vAlign="center">
          {project && <Token label={project.key} />}
          <Text weight="bold">{project?.name || "Project"}</Text>
        </HStack>
      }>
      <Section variant="transparent" padding={5}>
        <VStack gap={5} hAlign="stretch">
          {project && <ProjectTabs projectId={id} />}

          <VStack gap={4} hAlign="stretch" maxWidth={1024}>
            <HStack gap={4} vAlign="center">
              <Heading level={2}>Tệp trên SharePoint</Heading>
              <StackItem size="fill" />
              <IconButton
                label="Tải lại"
                tooltip="Tải lại"
                variant="ghost"
                icon={<Icon name="refresh" size={18} />}
                onClick={() => load(path)}
              />
            </HStack>

            <Breadcrumbs label="Đường dẫn thư mục">
              <BreadcrumbItem onClick={() => load("")}>{root || "Thư mục dự án"}</BreadcrumbItem>
              {segments.map((seg, i) => (
                <BreadcrumbItem
                  key={i}
                  isCurrent={i === segments.length - 1}
                  onClick={() => load(segments.slice(0, i + 1).join("/"))}>
                  {seg}
                </BreadcrumbItem>
              ))}
            </Breadcrumbs>

            {noFolder && (
              <EmptyState
                title="Dự án chưa có thư mục SharePoint"
                description="Thư mục sẽ được tạo tự động khi có tệp đính kèm đầu tiên, hoặc bạn có thể đặt đường dẫn trong phần Cài đặt dự án."
                icon={<Icon name="folder_off" size={40} />}
              />
            )}

            {error && (
              <Banner
                status="error"
                title={`Không đọc được thư mục: ${error}`}
                description="Kiểm tra cấu hình SHAREPOINT_SITE_URL và quyền Microsoft Graph."
              />
            )}

            {loading && <Text color="secondary">Đang tải…</Text>}

            {!loading && !error && !noFolder && (
              // Danh sách tệp = dữ liệu quét bằng mắt → rows edge-to-edge.
              <List hasDividers>
                {path && (
                  <ListItem
                    startContent={<Icon name="drive_folder_upload" size={20} />}
                    label=".."
                    onClick={() => load(segments.slice(0, -1).join("/"))}
                  />
                )}
                {items.map((it) => {
                  const isFolder = !!it.folder;
                  return (
                    <ListItem
                      key={it.id}
                      startContent={
                        <Icon name={isFolder ? "folder" : "description"} size={20} />
                      }
                      label={it.name}
                      onClick={isFolder ? () => load(path ? `${path}/${it.name}` : it.name) : undefined}
                      href={isFolder ? undefined : it.webUrl}
                      target={isFolder ? undefined : "_blank"}
                      rel={isFolder ? undefined : "noreferrer"}
                      endContent={
                        <HStack gap={4} vAlign="center">
                          <Text type="supporting">
                            {isFolder ? `${it.folder!.childCount} mục` : humanSize(it.size)}
                          </Text>
                          <Text type="supporting">
                            {it.lastModifiedDateTime
                              ? new Date(it.lastModifiedDateTime).toLocaleDateString()
                              : ""}
                          </Text>
                        </HStack>
                      }
                    />
                  );
                })}
                {items.length === 0 && <EmptyState title="Thư mục trống." isCompact />}
              </List>
            )}
          </VStack>
        </VStack>
      </Section>
    </AppShell>
  );
}

function humanSize(bytes?: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}
