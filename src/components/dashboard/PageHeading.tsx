import type { ReactNode } from "react"

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow: string
  title: ReactNode
  description: string
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={`welcome-row ${className ?? ""}`.trim()}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="welcome-subtitle">{description}</p>
      </div>
      {action}
    </section>
  )
}
