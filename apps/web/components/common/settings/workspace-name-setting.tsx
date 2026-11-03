'use client';

import { useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, type WorkspaceSummary } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useMessages } from '@/features/shared/use-messages';

const messages = {
   'Workspace name': 'Tên workspace',
   'The display name shown in the sidebar and workspace switcher.':
      'Tên hiển thị trên sidebar và bộ chọn workspace.',
   'Save name': 'Lưu tên',
   'Workspace name must not be empty.': 'Tên workspace không được để trống.',
   'Workspace name must be at most 120 characters.': 'Tên workspace không được quá 120 ký tự.',
   'Could not update workspace name.': 'Không thể cập nhật tên workspace.',
   'Workspace name updated.': 'Đã cập nhật tên workspace.',
} as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Owns the name draft for one workspace (the caller keys by workspace id). Failures retain
 * input; a synchronous guard covers repeated Enter/clicks before React renders loading state.
 * Only the trimmed name is sent, keeping URL and icon edits independent.
 * VI: Giữ bản nháp tên cho một workspace (bên gọi đặt key bằng id). Lỗi giữ nội dung đã nhập;
 * guard đồng bộ chặn Enter/click lặp trước khi React render trạng thái đang lưu. Chỉ gửi tên
 * đã trim để độc lập với thao tác sửa URL và icon.
 */
export function WorkspaceNameSetting({
   workspace,
   canEdit,
   onSaved,
}: {
   workspace: WorkspaceSummary;
   canEdit: boolean;
   onSaved: (workspace: WorkspaceSummary) => void;
}) {
   const tx = useMessages(messages);
   const [draft, setDraft] = useState(workspace.name);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [saved, setSaved] = useState(false);
   const submitting = useRef(false);
   const name = draft.trim();
   // Count Unicode code points, matching Python's length limit rather than UTF-16 code units.
   // VI: Đếm code point Unicode khớp giới hạn độ dài Python thay vì code unit UTF-16.
   const invalid = !name
      ? tx('Workspace name must not be empty.')
      : Array.from(name).length > 120
        ? tx('Workspace name must be at most 120 characters.')
        : undefined;
   const save = async () => {
      if (!canEdit || invalid || name === workspace.name || submitting.current) return;
      submitting.current = true;
      setSaving(true);
      setError(undefined);
      setSaved(false);
      try {
         const response = await authenticatedFetch(`${api}/workspaces/${workspace.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name }),
         });
         const updated = await responseData<WorkspaceSummary>(
            response,
            tx('Could not update workspace name.')
         );
         if (updated.name !== name) throw new Error(tx('Could not update workspace name.'));
         onSaved(updated);
         setDraft(updated.name);
         setSaved(true);
         window.dispatchEvent(new Event('flowie:workspace-updated'));
      } catch (reason) {
         setError(
            reason instanceof Error ? reason.message : tx('Could not update workspace name.')
         );
      } finally {
         submitting.current = false;
         setSaving(false);
      }
   };
   return (
      <DesignSurface>
         <VStack gap={2} paddingInline={4} paddingBlock={3}>
            {canEdit ? (
               <>
                  <HStack gap={2} wrap="wrap" align="end">
                     <TextInput
                        label={tx('Workspace name')}
                        value={draft}
                        onChange={(value) => {
                           setDraft(value);
                           setError(undefined);
                           setSaved(false);
                        }}
                        onEnter={() => void save()}
                        isDisabled={saving}
                        description={tx(
                           'The display name shown in the sidebar and workspace switcher.'
                        )}
                        className="min-w-0 flex-1"
                     />
                     <Button
                        label={tx('Save name')}
                        size="sm"
                        isLoading={saving}
                        isDisabled={!!invalid || name === workspace.name}
                        onClick={() => void save()}
                     />
                  </HStack>
                  {(invalid || error) && (
                     <Text role="alert" className="text-destructive">
                        {invalid ?? error}
                     </Text>
                  )}
                  {saved && <Text role="status">{tx('Workspace name updated.')}</Text>}
               </>
            ) : (
               <>
                  <Text type="label">{tx('Workspace name')}</Text>
                  <Text className="break-words">{workspace.name}</Text>
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
