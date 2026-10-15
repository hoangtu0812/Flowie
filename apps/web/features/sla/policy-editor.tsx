'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { CalendarEditor } from './calendar-editor';
import { slaApi, defaultCalendar, type PolicyValues, type SlaPolicy, dateLabel } from './types';

type Options = {
   statuses: { id: string; name: string }[];
   members: { id: string; name: string }[];
};
export function PolicyEditor({
   workspace,
   teams,
   policy,
   onSaved,
   onCancel,
}: {
   workspace: string;
   teams: { id: string; name: string }[];
   policy?: SlaPolicy;
   onSaved: () => void;
   onCancel: () => void;
}) {
   const [draft, setDraft] = useState<PolicyValues>(
      policy
         ? {
              name: policy.name,
              description: policy.description,
              teamId: policy.teamId,
              priority: policy.priority,
              deadlineMinutes: policy.deadlineMinutes,
              enabled: policy.enabled,
              calendar: policy.calendar,
              pauseStatusIds: policy.pauseStatusIds,
              warningMinutes: policy.warningMinutes,
              escalateToId: policy.escalateToId,
           }
         : {
              name: '',
              description: null,
              teamId: null,
              priority: null,
              deadlineMinutes: 1440,
              enabled: true,
              calendar: null,
              pauseStatusIds: [],
              warningMinutes: 0,
              escalateToId: null,
           }
   );
   const [budget, setBudget] = useState(String(draft.deadlineMinutes)),
      [warning, setWarning] = useState(String(draft.warningMinutes));
   const [calendar, setCalendar] = useState(draft.calendar ?? defaultCalendar());
   const [options, setOptions] = useState<Options>(),
      [retry, setRetry] = useState(0);
   const [busy, setBusy] = useState(false),
      [error, setError] = useState(''),
      [preview, setPreview] = useState('');
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   useEffect(() => {
      let active = true;
      setOptions(undefined);
      setError('');
      void awaitFetch()
         .then((response) => responseData<Options>(response))
         .then((data) => {
            if (active) setOptions(data);
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         });
      async function awaitFetch() {
         return authenticatedFetch(
            `${slaApi}/options?${new URLSearchParams({ workspaceId: workspace, ...(draft.teamId ? { teamId: draft.teamId } : {}) })}`
         );
      }
      return () => {
         active = false;
      };
   }, [workspace, draft.teamId, retry]);
   const change = (values: Partial<PolicyValues>) => {
      setDraft({ ...draft, ...values });
      setPreview('');
   };
   const action = async (isPreview: boolean) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         if (!/^[1-9]\d*$/.test(budget) || !/^\d+$/.test(warning))
            throw new Error('Deadline and warning must be whole minutes; warning may be zero.');
         const values = {
            ...draft,
            deadlineMinutes: Number(budget),
            warningMinutes: Number(warning),
            calendar: draft.calendar ? calendar : null,
         };
         if (isPreview) {
            const result = await responseData<{ dueAt: string }>(
               await authenticatedFetch(slaApi + '/preview', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                     startAt: new Date().toISOString(),
                     deadlineMinutes: values.deadlineMinutes,
                     calendar: values.calendar,
                  }),
               })
            );
            if (alive.current) setPreview(`Starting now, deadline: ${dateLabel(result.dueAt)}`);
         } else {
            await responseData(
               await authenticatedFetch(
                  policy
                     ? `${slaApi}/${policy.id}?${new URLSearchParams({ workspaceId: workspace })}`
                     : slaApi,
                  {
                     method: policy ? 'PUT' : 'POST',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify({
                        ...values,
                        ...(policy
                           ? { expectedVersion: policy.version }
                           : { workspaceId: workspace }),
                     }),
                  }
               )
            );
            if (alive.current) onSaved();
         }
      } catch (reason) {
         if (alive.current)
            setError(reason instanceof Error ? reason.message : 'Could not save SLA.');
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack
         as="form"
         gap={4}
         width="100%"
         maxWidth="70ch"
         onSubmit={(event) => {
            event.preventDefault();
            void action(false);
         }}
      >
         <Heading level={2}>{policy ? 'Edit SLA' : 'New SLA'}</Heading>
         <Text>
            Changes apply to new tasks. Existing tasks keep their accepted policy revision until
            explicitly reapplied.
         </Text>
         <TextInput
            label="SLA name"
            placeholder="SLA name"
            value={draft.name}
            onChange={(name) => change({ name })}
            isRequired
            isDisabled={busy}
            width="100%"
         />
         <TextArea
            label="SLA description"
            value={draft.description ?? ''}
            onChange={(description) => change({ description: description || null })}
            isDisabled={busy}
            width="100%"
         />
         <Selector
            label="Policy team"
            value={draft.teamId ?? ''}
            options={[
               { value: '', label: 'All teams' },
               ...teams.map((row) => ({ value: row.id, label: row.name })),
            ]}
            onChange={(value) =>
               change({ teamId: value || null, pauseStatusIds: [], escalateToId: null })
            }
            isDisabled={busy}
            width="100%"
         />
         <Selector
            label="Policy priority"
            value={draft.priority ?? ''}
            options={[
               { value: '', label: 'Any priority' },
               ...['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                  value,
                  label: value === 'NONE' ? 'No priority' : value[0] + value.slice(1).toLowerCase(),
               })),
            ]}
            onChange={(priority) => change({ priority: priority || null })}
            isDisabled={busy}
            width="100%"
         />
         <TextInput
            label="Deadline duration"
            description="Working minutes, from 15 to 525600."
            value={budget}
            onChange={(value) => {
               setBudget(value);
               setPreview('');
            }}
            isRequired
            isDisabled={busy}
            width="100%"
         />
         <TextInput
            label="Warning minutes remaining"
            description="Zero disables the warning; use a value below the deadline duration."
            value={warning}
            onChange={setWarning}
            isDisabled={busy}
            width="100%"
         />
         <CheckboxInput
            label="Policy enabled"
            value={draft.enabled}
            onChange={(enabled) => change({ enabled })}
            isDisabled={busy}
         />
         <Selector
            label="Clock calendar"
            value={draft.calendar ? 'business' : 'elapsed'}
            options={[
               { value: 'elapsed', label: '24 hours, every day' },
               { value: 'business', label: 'Business working hours' },
            ]}
            onChange={(value) => change({ calendar: value === 'business' ? calendar : null })}
            isDisabled={busy}
            width="100%"
         />
         {draft.calendar && (
            <CalendarEditor
               value={calendar}
               onChange={(value) => {
                  setCalendar(value);
                  setPreview('');
               }}
               disabled={busy}
            />
         )}
         {options ? (
            <>
               <MultiSelector
                  label="Pause in statuses"
                  value={draft.pauseStatusIds}
                  options={[
                     ...options.statuses.map((row) => ({ value: row.id, label: row.name })),
                     ...draft.pauseStatusIds
                        .filter((id) => !options.statuses.some((row) => row.id === id))
                        .map((value) => ({
                           value,
                           label: 'Unavailable status — remove before saving',
                        })),
                  ]}
                  onChange={(pauseStatusIds) => change({ pauseStatusIds })}
                  isDisabled={busy}
                  hasSearch
                  width="100%"
               />
               <Selector
                  label="Escalate to"
                  value={draft.escalateToId ?? ''}
                  options={[
                     { value: '', label: 'No reassignment' },
                     ...options.members.map((row) => ({ value: row.id, label: row.name })),
                     ...(draft.escalateToId &&
                     !options.members.some((row) => row.id === draft.escalateToId)
                        ? [
                             {
                                value: draft.escalateToId,
                                label: 'Unavailable member — choose another',
                             },
                          ]
                        : []),
                  ]}
                  onChange={(value) => change({ escalateToId: value || null })}
                  isDisabled={busy}
                  width="100%"
               />
               <Text>
                  Escalation reassigns once after a breach, only when the policy creator and
                  recipient still have access to the task.
               </Text>
            </>
         ) : (
            <Button
               label="Retry SLA options"
               onClick={() => setRetry((value) => value + 1)}
               isDisabled={busy}
            />
         )}
         {error && <Text role="alert">{error}</Text>}
         {preview && <Text role="status">{preview}</Text>}
         <HStack gap={2} wrap="wrap">
            <Button
               label={policy ? 'Save SLA' : 'Create SLA'}
               type="submit"
               variant="primary"
               isLoading={busy}
               isDisabled={!options}
            />
            <Button label="Preview deadline" onClick={() => void action(true)} isDisabled={busy} />
            <Button label="Cancel SLA editing" onClick={onCancel} isDisabled={busy} />
         </HStack>
      </VStack>
   );
}
