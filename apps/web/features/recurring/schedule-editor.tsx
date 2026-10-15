'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { recurringApi, type Schedule, type ScheduleRule, type RecurringTemplate } from './types';
type Options = {
   statuses: { id: string; name: string }[];
   projects: { id: string; name: string }[];
   members: { id: string; name: string }[];
};
export function ScheduleEditor({
   workspace,
   teams,
   schedule,
   onSaved,
   onCancel,
}: {
   workspace: string;
   teams: { id: string; name: string }[];
   schedule?: Schedule;
   onSaved: () => void;
   onCancel: () => void;
}) {
   const [name, setName] = useState(schedule?.name ?? '');
   const [team, setTeam] = useState(schedule?.teamId ?? teams[0]?.id ?? '');
   const [rule, setRule] = useState<ScheduleRule>(
      schedule?.rule ?? {
         timezone: 'Asia/Ho_Chi_Minh',
         startDate: new Date().toISOString().slice(0, 10),
         time: '09:00',
         frequency: 'WEEKLY',
         interval: 1,
         weekdays: [0],
         monthDay: 1,
      }
   );
   const [template, setTemplate] = useState<RecurringTemplate>(
      schedule?.template ?? {
         title: '',
         description: '',
         priority: 'NONE',
         issueType: 'TASK',
         statusId: null,
         projectId: null,
         assigneeId: null,
      }
   );
   const [due, setDue] = useState(schedule?.dueAfterMinutes?.toString() ?? '');
   const [repeat, setRepeat] = useState(String(schedule?.rule.interval ?? 1));
   const [monthDay, setMonthDay] = useState(String(schedule?.rule.monthDay ?? 1));
   const [options, setOptions] = useState<Options>();
   const [optionRetry, setOptionRetry] = useState(0);
   const [busy, setBusy] = useState(false),
      [error, setError] = useState('');
   const [occurrences, setOccurrences] = useState<string[]>([]);
   const alive = useRef(true),
      requestKey = useRef('');
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
      if (team)
         void authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/issues/options?${new URLSearchParams({ workspaceId: workspace, teamId: team })}`
         )
            .then((response) => responseData<Options>(response))
            .then((data) => {
               if (active) setOptions(data);
            })
            .catch((reason) => {
               if (active) setError(String(reason));
            });
      return () => {
         active = false;
      };
   }, [workspace, team, optionRetry]);
   const changeRule = (values: Partial<ScheduleRule>) => {
      setRule({ ...rule, ...values });
      setOccurrences([]);
      requestKey.current = '';
   };
   const changeTemplate = (values: Partial<RecurringTemplate>) => {
      setTemplate({ ...template, ...values });
      requestKey.current = '';
   };
   const action = async (preview: boolean) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         if (!/^[1-9]\d*$/.test(repeat) || !/^[1-9]\d*$/.test(monthDay))
            throw new Error('Repeat interval and day of month must be positive whole numbers.');
         const requestedRule = { ...rule, interval: Number(repeat), monthDay: Number(monthDay) };
         if (preview) {
            const data = await responseData<{ occurrences: string[] }>(
               await authenticatedFetch(recurringApi + '/preview', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(requestedRule),
               })
            );
            if (alive.current) setOccurrences(data.occurrences);
         } else {
            if (due && !/^[1-9]\d*$/.test(due))
               throw new Error(
                  'Due-after minutes must be a positive whole number, or left blank for SLA.'
               );
            if (!requestKey.current) requestKey.current = crypto.randomUUID();
            const body = {
               name,
               rule: requestedRule,
               template,
               dueAfterMinutes: due ? Number(due) : null,
               ...(schedule
                  ? { expectedVersion: schedule.version }
                  : { workspaceId: workspace, teamId: team, requestKey: requestKey.current }),
            };
            const response = await authenticatedFetch(
               recurringApi +
                  (schedule
                     ? `/${schedule.id}?${new URLSearchParams({ workspaceId: workspace })}`
                     : ''),
               {
                  method: schedule ? 'PUT' : 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(body),
               }
            );
            await responseData(response);
            if (alive.current) onSaved();
         }
      } catch (reason) {
         if (alive.current)
            setError(reason instanceof Error ? reason.message : 'Could not save schedule.');
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   const refs = (
      field: 'statusId' | 'projectId' | 'assigneeId',
      label: string,
      rows: { id: string; name: string }[],
      none: string
   ) => (
      <Selector
         label={label}
         value={template[field] ?? ''}
         options={[
            { value: '', label: none },
            ...rows.map((row) => ({ value: row.id, label: row.name })),
         ]}
         isDisabled={busy || !options}
         onChange={(value) => changeTemplate({ [field]: value || null })}
      />
   );
   return (
      <VStack
         as="form"
         gap={4}
         onSubmit={(event) => {
            event.preventDefault();
            void action(false);
         }}
      >
         <Heading level={2}>
            {schedule ? 'Edit recurring schedule' : 'Create recurring schedule'}
         </Heading>
         {schedule?.unavailableProject && (
            <Text role="alert">
               The original project is unavailable. Saving clears that reference unless you select
               an accessible replacement.
            </Text>
         )}
         <HStack gap={3} wrap="wrap">
            <TextInput
               label="Schedule name"
               value={name}
               onChange={(value) => {
                  setName(value);
                  requestKey.current = '';
               }}
               isRequired
               isDisabled={busy}
            />
            <Selector
               label="Schedule team"
               value={team}
               options={teams.map((row) => ({ value: row.id, label: row.name }))}
               isDisabled={busy || !!schedule}
               onChange={(value) => {
                  setTeam(value);
                  changeTemplate({ statusId: null, projectId: null });
               }}
            />
            <TextInput
               label="Schedule time zone"
               value={rule.timezone}
               onChange={(timezone) => changeRule({ timezone })}
               description="IANA name, for example Asia/Ho_Chi_Minh"
               isDisabled={busy}
            />
         </HStack>
         <HStack gap={3} wrap="wrap">
            <TextInput
               label="Schedule start date"
               description="YYYY-MM-DD in the schedule time zone"
               value={rule.startDate}
               onChange={(startDate) => changeRule({ startDate })}
               isDisabled={busy}
            />
            <TextInput
               label="Schedule local time"
               description="HH:MM, 24-hour clock"
               value={rule.time}
               onChange={(time) => changeRule({ time })}
               isDisabled={busy}
            />
            <Selector
               label="Repeat frequency"
               value={rule.frequency}
               options={['DAILY', 'WEEKLY', 'MONTHLY'].map((value) => ({ value, label: value }))}
               onChange={(frequency) => {
                  changeRule({ frequency, interval: 1 });
                  setRepeat('1');
                  setMonthDay('1');
               }}
               isDisabled={busy}
            />
            <TextInput
               label="Repeat every"
               description="Days, weeks or months according to frequency"
               value={repeat}
               onChange={(value) => {
                  setRepeat(value);
                  setOccurrences([]);
                  requestKey.current = '';
               }}
               isDisabled={busy}
            />
         </HStack>
         {rule.frequency === 'WEEKLY' && (
            <MultiSelector
               label="Repeat weekdays"
               value={rule.weekdays.map(String)}
               onChange={(values) => changeRule({ weekdays: values.map(Number) })}
               options={[
                  'Monday',
                  'Tuesday',
                  'Wednesday',
                  'Thursday',
                  'Friday',
                  'Saturday',
                  'Sunday',
               ].map((label, index) => ({ label, value: String(index) }))}
               isDisabled={busy}
            />
         )}
         {rule.frequency === 'MONTHLY' && (
            <TextInput
               label="Day of month"
               value={monthDay}
               onChange={(value) => {
                  setMonthDay(value);
                  setOccurrences([]);
                  requestKey.current = '';
               }}
               description="1–31; shorter months use their final day."
               isDisabled={busy}
            />
         )}
         <Text>
            Daylight-saving overlaps run once at the first occurrence; missing local times advance
            to the first valid minute. A delayed worker creates one missed occurrence and schedules
            the next future one, without backfilling every missed task.
         </Text>
         <Button
            label="Preview next five occurrences"
            onClick={() => void action(true)}
            isLoading={busy}
         />
         {!!occurrences.length && (
            <Text role="status">Next occurrences (UTC): {occurrences.join(' · ')}</Text>
         )}
         <TextInput
            label="Recurring issue title"
            value={template.title}
            onChange={(title) => changeTemplate({ title })}
            isRequired
            isDisabled={busy}
            width="100%"
         />
         <TextArea
            label="Recurring issue description"
            value={template.description ?? ''}
            onChange={(description) => changeTemplate({ description })}
            rows={4}
            isDisabled={busy}
         />
         <HStack gap={3} wrap="wrap">
            <Selector
               label="Recurring issue priority"
               value={template.priority}
               onChange={(priority) => changeTemplate({ priority })}
               options={['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((value) => ({
                  value,
                  label: value,
               }))}
               isDisabled={busy}
            />
            <Selector
               label="Recurring issue type"
               value={template.issueType}
               onChange={(issueType) => changeTemplate({ issueType })}
               options={['TASK', 'BUG'].map((value) => ({ value, label: value }))}
               isDisabled={busy}
            />
            {refs(
               'statusId',
               'Recurring issue status',
               options?.statuses ?? [],
               'Team default status'
            )}
            {refs('projectId', 'Recurring issue project', options?.projects ?? [], 'No project')}
            {refs('assigneeId', 'Recurring issue assignee', options?.members ?? [], 'Unassigned')}
            <TextInput
               label="Due after minutes"
               description="Elapsed minutes after actual creation; leave blank to use the matching SLA."
               value={due}
               onChange={(value) => {
                  setDue(value);
                  requestKey.current = '';
               }}
               isDisabled={busy}
            />
         </HStack>
         {template.issueType === 'BUG' && (
            <>
               <Selector
                  label="Recurring bug severity"
                  value={template.severity ?? ''}
                  onChange={(value) => changeTemplate({ severity: value || null })}
                  options={[
                     { value: '', label: 'Unspecified' },
                     ...['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({
                        value,
                        label: value,
                     })),
                  ]}
                  isDisabled={busy}
               />
               <TextInput
                  label="Recurring bug environment"
                  value={template.environment ?? ''}
                  onChange={(environment) => changeTemplate({ environment })}
                  isDisabled={busy}
               />
               {(['reproductionSteps', 'expectedResult', 'actualResult'] as const).map((field) => (
                  <TextArea
                     key={field}
                     label={
                        (
                           {
                              reproductionSteps: 'Recurring bug steps to reproduce',
                              expectedResult: 'Recurring bug expected result',
                              actualResult: 'Recurring bug actual result',
                           } as const
                        )[field]
                     }
                     value={template[field] ?? ''}
                     onChange={(value) => changeTemplate({ [field]: value })}
                     isDisabled={busy}
                  />
               ))}
            </>
         )}
         {error && <Text role="alert">{error}</Text>}
         {!options && (
            <Button
               label="Retry schedule options"
               onClick={() => setOptionRetry((value) => value + 1)}
               isDisabled={busy}
            />
         )}
         <HStack gap={3} wrap="wrap">
            <Button
               label={schedule ? 'Save recurring schedule' : 'Create schedule'}
               type="submit"
               isLoading={busy}
               isDisabled={!options || !team}
            />
            <Button label="Cancel schedule editing" onClick={onCancel} isDisabled={busy} />
         </HStack>
      </VStack>
   );
}
