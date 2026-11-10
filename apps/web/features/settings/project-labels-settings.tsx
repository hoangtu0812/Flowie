'use client';

import IssueLabelsSettings from './issue-labels-settings';

/** Project-label variant of the original Labels settings layout. */
export default function ProjectLabelsSettings() {
   return <IssueLabelsSettings scope="project" />;
}
