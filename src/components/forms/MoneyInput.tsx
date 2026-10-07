"use client"

import { useState, type InputHTMLAttributes } from "react"
import { formatMoneyInput, parseMoneyInput } from "@/lib/money/input-format"

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "onChange" | "type" | "value"> & {
  value: string
  onValueChange: (value: string) => void
}

export function MoneyInput({ value, onValueChange, onBlur, onFocus, ...inputProps }: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState("")

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      value={focused ? draft : formatMoneyInput(value)}
      onFocus={(event) => {
        setFocused(true)
        setDraft(value.replace(".", ","))
        onFocus?.(event)
      }}
      onChange={(event) => {
        const nextDraft = event.target.value
        setDraft(nextDraft)
        const parsed = parseMoneyInput(nextDraft)
        if (parsed !== null) onValueChange(parsed)
      }}
      onBlur={(event) => {
        const parsed = parseMoneyInput(draft, true)
        if (parsed !== null) {
          onValueChange(parsed)
        }
        setFocused(false)
        onBlur?.(event)
      }}
    />
  )
}
