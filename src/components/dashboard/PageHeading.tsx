import type { ReactNode } from "react"

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: ReactNode
  description: string
  action?: ReactNode
}) {
  return (
    <section className="welcome-row">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="welcome-subtitle">{description}</p>
      </div>
      {action}
    </section>
  )
}