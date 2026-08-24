'use client';

import { LabelsSettings } from './issue-labels-settings';

/** Project-label variant of the original Labels settings layout. */
export default function ProjectLabelsSettings() {
   return <LabelsSettings scope="project" />;
}
