'use client';
import { useState } from 'react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Text';
import type { Issue } from '@/mock-data/issues';
import { BugDetails } from './bug-details';
import { IssueDocuments } from '@/features/documents/issue-documents';
import { IssueDocumentLinks } from '@/features/documents/issue-document-links';
import { useIssueDocuments } from '@/features/documents/use-issue-documents';
import { DocumentView } from '@/features/documents/document-page';
import { ActivityEvents, CommentsSection } from '@/components/common/issues/details/activity-feed';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/features/shared/use-locale';
import { useIssuesStore } from '@/store/issues-store';
import { useIssueActivity } from './use-issue-activity';
import { useIssueAttachments } from './use-issue-attachments';
import { IssueTicketLink } from '@/features/service-desk/issue-ticket-link';
import { IssueDescription } from '@/components/common/issues/details/issue-description';
import { IssueAttachments } from '@/components/common/issues/details/issue-attachments';
import { IssueReactions } from '@/components/common/issues/details/issue-reactions';
import { IssueSubIssues } from '@/components/common/issues/details/issue-sub-issues';
import { IssueParent } from '@/components/common/issues/details/issue-parent';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';
import { MobileIssueProperties } from '@/components/common/issues/details/mobile-issue-properties';
import { IssueSlaPanel } from '@/features/sla/issue-sla-panel';
import {
   IssuePullRequests,
   useIssueReviews,
} from '@/components/common/issues/details/issue-pull-requests';

const TABS = ['overview', 'activity', 'attachments'] as const;
type IssueTab = (typeof TABS)[number];

/**
 * Issue detail body: title and properties, then three tabs so a long task stays readable.
 * Overview holds the description, details, sub-issues and comments; Activity the change
 * history; Attachments the files and linked Docs documents. Activity, attachment and linked
 * document state live here, so a hidden tab keeps the comment draft and the attachment count,
 * and a link made in Attachments shows at once in Overview's related documents. The page keeps the tab in `?tab=` to share
 * a link to it; the compact Inbox preview keeps it locally so the host page URL never changes.
 * VI: Phần thân chi tiết công việc: tiêu đề và thuộc tính, rồi ba tab để task dài vẫn dễ đọc.
 * VI: Tổng quan gồm mô tả, chi tiết, sub-issue và bình luận; Hoạt động là lịch sử thay đổi; Tệp
 * VI: đính kèm là các tệp và tài liệu Docs đã liên kết. State hoạt động, đính kèm và tài liệu liên
 * VI: kết nằm ở đây, nên tab ẩn vẫn giữ bản nháp bình luận và số tệp, và liên kết tạo ở tab Tệp
 * VI: đính kèm hiện ngay ở mục tài liệu liên quan của Tổng quan. Trang task lưu tab vào `?tab=` để chia sẻ link; khung xem nhanh ở
 * VI: Inbox giữ tab cục bộ để không đổi URL của trang chứa.
 */
export function IssueContent({
   issue,
   orgId,
   compact = false,
}: {
   issue: Issue;
   orgId: string;
   compact?: boolean;
}) {
   const detail = { identifier: issue.identifier, description: [], activity: [] };
   const reviews = useIssueReviews(issue.id);
   const { t } = useLocale();
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const activity = useIssueActivity(issue.id);
   const attachments = useIssueAttachments(workspaceId, issue.id);
   const documents = useIssueDocuments(issue.id);
   const [urlTab, setUrlTab] = useQueryState(
      'tab',
      parseAsStringLiteral(TABS).withDefault('overview')
   );
   const [localTab, setLocalTab] = useState<IssueTab>('overview');
   const tab = compact ? localTab : urlTab;
   const setTab = (next: string) =>
      compact ? setLocalTab(next as IssueTab) : void setUrlTab(next as IssueTab);
   const [urlDocument, setUrlDocument] = useQueryState('doc', parseAsString);
   const openDocument = compact ? null : urlDocument;
   return (
      <HStack
         height="100%"
         gap={0}
         align="stretch"
         className="relative min-h-0 min-w-0 overflow-hidden"
      >
         {/*
          * A related document opened from this page (`?doc=<id>`) covers only this body, the area
          * MainLayout sizes below the task header, so the header (breadcrumb, favorite, actions,
          * previous/next) stays usable and the document scrolls in its own pane: one scrollbar,
          * header bottom to screen bottom. The task body stays mounted under it but `inert`, so
          * closing restores the same tab, scroll position and unsaved drafts. The link opens with
          * a history push, so browser Back also closes it; X replaces the entry.
          * VI: Tài liệu liên quan mở từ trang này (`?doc=<id>`) chỉ phủ phần thân này, tức vùng
          * VI: MainLayout tính chiều cao dưới header task, nên header (breadcrumb, sao, thao tác,
          * VI: trước/sau) vẫn dùng được và tài liệu cuộn trong khung riêng: một thanh cuộn, từ mép
          * VI: dưới header tới đáy màn hình. Thân task vẫn mount bên dưới nhưng `inert`, nên đóng
          * VI: lại giữ nguyên tab, vị trí cuộn và bản nháp chưa lưu. Link mở bằng history push nên
          * VI: Back của trình duyệt cũng đóng tài liệu; nút X thay thế entry hiện tại.
          */}
         {openDocument && (
            <VStack
               className="absolute inset-0 z-10 min-h-0 bg-background"
               data-testid="issue-document-viewer"
            >
               <DocumentView
                  key={openDocument}
                  documentId={openDocument}
                  pageTitle={false}
                  onClose={() => void setUrlDocument(null)}
                  onChanged={documents.reload}
               />
            </VStack>
         )}
         <VStack
            isScrollable
            className="min-h-0 min-w-0 flex-1"
            align="center"
            inert={Boolean(openDocument)}
         >
            <VStack
               data-image-gallery
               width="100%"
               maxWidth={768}
               gap={6}
               className={compact ? 'px-5 py-6' : 'px-5 py-8 sm:px-8 sm:py-10'}
            >
               <Heading level={compact ? 2 : 1} textWrap="balance" className="break-words">
                  {issue.title}
               </Heading>
               <IssueParent issue={issue} orgId={orgId} />
               <MobileIssueProperties
                  issue={issue}
                  detail={detail}
                  reviews={reviews}
                  allScreens={compact}
               />
               <Tabs value={tab} onValueChange={setTab} className="gap-6">
                  <TabsList aria-label={t('issueSections')}>
                     <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
                     <TabsTrigger value="activity">{t('activity')}</TabsTrigger>
                     <TabsTrigger value="attachments">
                        {t('attachments')}
                        {attachments.attachments.length > 0 &&
                           ` (${attachments.attachments.length})`}
                     </TabsTrigger>
                  </TabsList>
                  {/*
                   * Overview stays mounted while hidden so an unsaved description or bug report
                   * draft survives a look at Activity or Attachments, like the comment draft.
                   * VI: Tab Overview vẫn mount khi ẩn để bản nháp mô tả hoặc Bug report chưa lưu
                   * VI: còn nguyên khi xem Activity hay Attachments, giống bản nháp bình luận.
                   */}
                  <TabsContent
                     value="overview"
                     forceMount
                     className="flex flex-col gap-6 data-[state=inactive]:hidden"
                  >
                     <IssueDescription issue={issue} />
                     <BugDetails key={issue.id} issue={issue} />
                     <IssueTicketLink workspaceId={workspaceId} issueId={issue.id} orgId={orgId} />
                     <IssuePullRequests reviews={reviews} orgId={orgId} />
                     <IssueDocuments
                        state={documents}
                        projectId={issue.project?.id}
                        inPlace={!compact}
                     />
                     <IssueSlaPanel issue={issue} />
                     <IssueReactions issueId={issue.id} />
                     <IssueSubIssues
                        issue={issue}
                        issueId={issue.id}
                        identifier={issue.identifier}
                        teamId={issue.teamId}
                        orgId={orgId}
                     />
                     <CommentsSection issueId={issue.id} state={activity} />
                  </TabsContent>
                  <TabsContent value="activity">
                     <ActivityEvents state={activity} />
                  </TabsContent>
                  <TabsContent value="attachments" className="flex flex-col gap-6">
                     <IssueAttachments workspaceId={workspaceId} state={attachments} />
                     <IssueDocumentLinks state={documents} projectId={issue.project?.id} />
                  </TabsContent>
               </Tabs>
            </VStack>
         </VStack>
         {!compact && (
            <VStack
               as="aside"
               width={304}
               isScrollable
               padding={5}
               className="hidden min-h-0 shrink-0 border-l border-border/60 bg-muted/10 lg:flex"
               inert={Boolean(openDocument)}
            >
               <IssuePropertiesPanel issue={issue} detail={detail} reviews={reviews} />
            </VStack>
         )}
      </HStack>
   );
}
