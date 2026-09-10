/** Passive GitHub issue mapping. No store, transport or synchronization state. */
export type Status = 'Todo' | 'Doing' | 'Done';
export type Projection = {
  title: string;
  body: string;
  status: Status;
};
export interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<string | { name: string }>;
  pull_request?: unknown;
}
export function project(issue: Issue): Projection {
  if (
    !Number.isSafeInteger(issue.number) ||
    issue.number <= 0 ||
    typeof issue.title !== 'string' ||
    !(issue.body === null || typeof issue.body === 'string') ||
    !['open', 'closed'].includes(issue.state) ||
    !Array.isArray(issue.labels)
  )
    throw new Error('GitHub returned an invalid issue');
  return {
    title: issue.title,
    body: issue.body ?? '',
    status:
      issue.state === 'closed'
        ? 'Done'
        : issue.labels.some(
              (l) =>
                (typeof l === 'string' ? l : l.name).toLowerCase() ===
                'atomic:doing',
            )
          ? 'Doing'
          : 'Todo',
  };
}
export function validate(value: Projection): void {
  if (
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    typeof value.body !== 'string' ||
    !['Todo', 'Doing', 'Done'].includes(value.status)
  )
    throw new Error(
      'Cards require a title, Markdown body and exactly one Todo/Doing/Done status',
    );
}

/** Fields owned by the lens; labels are managed separately without replacing other labels. */
export function issueFields(value: Projection): {
  title: string;
  body: string;
  state: 'open' | 'closed';
} {
  return {
    title: value.title,
    body: value.body,
    state: value.status === 'Done' ? 'closed' : 'open',
  };
}

/** Reverse mapping preserves every field and label outside the projection. */
export function unproject<T extends Issue>(value: Projection, previous: T): T {
  validate(value);
  const labels = previous.labels.filter(
    (label) =>
      (typeof label === 'string' ? label : label.name).toLowerCase() !==
      'atomic:doing',
  );
  if (value.status === 'Doing') labels.push('atomic:doing');
  return { ...previous, ...issueFields(value), labels };
}

/** Minimal reverse patch used by the existing reviewed synchronization workflow. */
export function issuePatch(
  desired: Projection,
  previous?: Projection,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (previous && previous.title !== desired.title) patch.title = desired.title;
  if (previous && previous.body !== desired.body) patch.body = desired.body;
  if (
    (!previous && desired.status === 'Done') ||
    (previous && (previous.status === 'Done') !== (desired.status === 'Done'))
  )
    patch.state = desired.status === 'Done' ? 'closed' : 'open';
  return patch;
}
