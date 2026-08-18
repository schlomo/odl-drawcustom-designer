import type { ReactNode } from 'react'

interface EntityFocusLabelProps {
  className: string
  title: string
  children: ReactNode
  testId: string
  /** The entity/state key to report on click. */
  entityId: string
  /** Reports the picked key so the shell can jump the YAML editor to where the
   *  design reads it. Absent (or with coupling off) the label stays inert
   *  text — it grows no affordance it cannot honour. */
  onFocusEntity?: (entityId: string) => void
}

/**
 * A row's label: a button only while entity coupling is wired, plain text
 * otherwise. Shared by the ReferencedStatesPanel (issue #107) and the State
 * Simulator so both name-jump affordances look and behave the same way
 * (PR #142 maintainer parity finding).
 */
export function EntityFocusLabel({
  className,
  title,
  children,
  testId,
  entityId,
  onFocusEntity,
}: EntityFocusLabelProps) {
  if (!onFocusEntity) {
    return (
      <span className={className} title={title} data-testid={testId}>
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`${className} cursor-pointer text-left hover:underline`}
      title={title}
      data-testid={testId}
      onClick={() => onFocusEntity(entityId)}
    >
      {children}
    </button>
  )
}
