"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

  const load = useCallback((p: string) => {
    setLoading(true);
    setError(null);
    setNoFolder(false);
    api.browseFiles(id, p)
      .then((r) => { setItems(r.items); setRoot(r.root); setPath(r.path); })
      .catch((e) => {
        const err = e as ApiError;
        if (err.code === "no_folder") setNoFolder(true);
        else setError(err.message);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    load("");
  }, [id, load]);

  const segments = path.split("/").filter(Boolean);

  return (
    <AppShell
      title={
        <div className="flex items-center gap-sm">
          {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
          <span>{project?.name || "Project"}</span>
        </div>
      }
    >
      <div className="p-lg max-w-5xl">
        {project && <ProjectTabs projectId={id} />}

        <div className="flex items-center justify-between gap-md mb-lg">
          <h2 className="text-headline-md">Tệp trên SharePoint</h2>
          <button className="btn-ghost" onClick={() => load(path)} title="Tải lại">
            <Icon name="refresh" size={18} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-xs text-body-sm mb-md">
          <button className="text-primary hover:underline" onClick={() => load("")}>
            {root || "Thư mục dự án"}
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-xs">
              <Icon name="chevron_right" size={16} className="text-on-surface-variant" />
              <button
                className="text-primary hover:underline"
                onClick={() => load(segments.slice(0, i + 1).join("/"))}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {noFolder && (
          <div className="card p-xl text-center text-on-surface-variant">
            <Icon name="folder_off" size={40} className="text-outline mb-sm" />
            <p className="text-body-lg font-medium text-on-surface">Dự án chưa có thư mục SharePoint</p>
            <p className="text-body-sm mt-1">
              Thư mục sẽ được tạo tự động khi có tệp đính kèm đầu tiên, hoặc bạn có thể
              đặt đường dẫn trong phần Cài đặt dự án.
            </p>
          </div>
        )}

        {error && (
          <div className="card p-lg text-body-sm text-error mb-md">
            Không đọc được thư mục: {error}
            <p className="text-on-surface-variant mt-1">
              Kiểm tra cấu hình SHAREPOINT_SITE_URL và quyền Microsoft Graph.
            </p>
          </div>
        )}

        {loading && <p className="text-on-surface-variant">Đang tải…</p>}

        {!loading && !error && !noFolder && (
          <div className="card divide-y divide-outline-variant/40">
            {path && (
              <button
                className="w-full flex items-center gap-md p-md text-left hover:bg-surface-container-low"
                onClick={() => load(segments.slice(0, -1).join("/"))}
              >
                <Icon name="drive_folder_upload" size={20} className="text-on-surface-variant" />
                <span className="text-body-md text-on-surface-variant">..</span>
              </button>
            )}
            {items.map((it) => {
              const isFolder = !!it.folder;
              return (
                <div key={it.id} className="flex items-center gap-md p-md hover:bg-surface-container-low">
                  <Icon
                    name={isFolder ? "folder" : "description"}
                    size={20}
                    className={isFolder ? "text-orange-600" : "text-on-surface-variant"}
                  />
                  {isFolder ? (
                    <button
                      className="text-body-md text-on-surface font-medium hover:text-primary truncate flex-grow text-left"
                      onClick={() => load(path ? `${path}/${it.name}` : it.name)}
                    >
                      {it.name}
                    </button>
                  ) : (
                    <a
                      href={it.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-body-md text-on-surface hover:text-primary truncate flex-grow"
                    >
                      {it.name}
                    </a>
                  )}
                  <span className="text-body-sm text-on-surface-variant whitespace-nowrap">
                    {isFolder ? `${it.folder!.childCount} mục` : humanSize(it.size)}
                  </span>
                  <span className="text-body-sm text-on-surface-variant/70 whitespace-nowrap hidden sm:inline">
                    {it.lastModifiedDateTime ? new Date(it.lastModifiedDateTime).toLocaleDateString() : ""}
                  </span>
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="p-xl text-center text-on-surface-variant">Thư mục trống.</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function humanSize(bytes?: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}
