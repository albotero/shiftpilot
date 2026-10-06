"use client"

import { useRef, useState } from "react"
import { CalendarDays } from "lucide-react"
import { formatDateDmy, parseDateDmy } from "@/lib/date-format"

type DateInputProps = {
  id: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  readOnly?: boolean
  ariaLabel: string
}

export function DateInput({ id, value, onChange, required, readOnly, ariaLabel }: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<{ value: string; display: string } | null>(null)
  const displayValue = draft?.value === value ? draft.display : formatDateDmy(value)
  const invalid = displayValue !== "" && parseDateDmy(displayValue) === null

  function updateDisplay(display: string) {
    setDraft({ value, display })
    if (display === "") onChange?.("")
    else {
      const parsed = parseDateDmy(display)
      if (parsed) onChange?.(parsed)
    }
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker) return
    if (typeof picker.showPicker === "function") picker.showPicker()
    else picker.click()
  }

  return (
    <div className="date-input-control">
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        inputMode="numeric"
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        placeholder="dd/MM/yyyy"
        required={required}
        readOnly={readOnly}
        title="Formato: dd/MM/yyyy"
        type="text"
        value={displayValue}
        onChange={(event) => updateDisplay(event.target.value)}
      />
      <button
        aria-label={`Abrir calendario para ${ariaLabel}`}
        className="date-input-picker"
        disabled={readOnly}
        title="Abrir calendario"
        type="button"
        onClick={openPicker}
      >
        <CalendarDays size={16} />
      </button>
      <input
        ref={pickerRef}
        aria-hidden="true"
        className="date-input-native"
        tabIndex={-1}
        type="date"
        value={value}
        onChange={(event) => {
          setDraft(null)
          onChange?.(event.target.value)
        }}
      />
    </div>
  )
}
