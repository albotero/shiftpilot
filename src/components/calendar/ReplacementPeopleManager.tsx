"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Pencil, Plus, RotateCcw, Trash2, UserRound, X } from "lucide-react"

type ReplacementPerson = {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
}

const emptyForm = { name: "", phone: "", email: "", notes: "" }

export function ReplacementPeopleManager() {
  const [people, setPeople] = useState<ReplacementPerson[]>([])
  const [editing, setEditing] = useState<ReplacementPerson | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function loadPeople() {
    setLoading(true)
    try {
      const response = await fetch("/api/replacement-people?includeInactive=true", { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el catálogo.")
      setPeople(result as ReplacementPerson[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el catálogo.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    fetch("/api/replacement-people?includeInactive=true", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? "No se pudo consultar el catálogo.")
        if (active) setPeople(result as ReplacementPerson[])
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el catálogo.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function startCreate() {
    setEditing(null)
    setFormOpen(true)
    setForm(emptyForm)
    setError("")
    setMessage("")
  }

  function startEdit(person: ReplacementPerson) {
    setEditing(person)
    setFormOpen(true)
    setForm({
      name: person.name,
      phone: person.phone ?? "",
      email: person.email ?? "",
      notes: person.notes ?? "",
    })
    setError("")
    setMessage("")
  }

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/replacement-people", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(editing ? { id: editing.id } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el anestesiólogo.")
      setMessage(editing ? "Cambios guardados." : "Anestesiólogo agregado.")
      setEditing(null)
      setFormOpen(false)
      setForm(emptyForm)
      await loadPeople()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el anestesiólogo.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(person: ReplacementPerson) {
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/replacement-people", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id, active: !person.active }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el estado.")
      await loadPeople()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el estado.")
    }
  }

  async function deletePerson(person: ReplacementPerson) {
    if (!window.confirm(`¿Eliminar a ${person.name} del catálogo?`)) return
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/replacement-people", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "No se pudo eliminar el anestesiólogo.")
      setMessage(
        result.deactivated
          ? "Tiene coberturas registradas; se desactivó para conservar el historial."
          : "Anestesiólogo eliminado.",
      )
      if (editing?.id === person.id) {
        setEditing(null)
        setFormOpen(false)
        setForm(emptyForm)
      }
      await loadPeople()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el anestesiólogo.")
    }
  }

  return (
    <section className="replacement-people-panel" aria-labelledby="replacement-people-title">
      <div className="replacement-people-heading">
        <span className="annual-plan-icon">
          <UserRound size={18} />
        </span>
        <div>
          <p className="eyebrow">Contactos reutilizables</p>
          <h2 id="replacement-people-title">Anestesiólogos de cobertura</h2>
        </div>
        <button type="button" className="submit-button replacement-add-button" onClick={startCreate}>
          <Plus size={15} /> Agregar
        </button>
      </div>

      {formOpen && (
        <form className="replacement-person-form" onSubmit={savePerson}>
          <div className="replacement-person-fields">
            <label className="form-field">
              <span>Nombre</span>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Teléfono · opcional</span>
              <input
                maxLength={40}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Correo · opcional</span>
              <input
                type="email"
                maxLength={254}
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Notas · opcional</span>
              <input
                maxLength={500}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
          </div>
          <div className="replacement-person-actions">
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar al catálogo"}
            </button>
            <button type="button" className="cancel-button" onClick={() => setFormOpen(false)} disabled={saving}>
              <X size={14} /> Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="replacement-people-message" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p className="replacement-people-empty">Cargando catálogo…</p>
      ) : people.length === 0 ? (
        <p className="replacement-people-empty">Todavía no hay anestesiólogos en el catálogo.</p>
      ) : (
        <ul className="replacement-people-list">
          {people.map((person) => (
            <li key={person.id} className={!person.active ? "inactive" : ""}>
              <div className="replacement-person-copy">
                <strong>{person.name}</strong>
                <span>
                  {[person.phone, person.email].filter(Boolean).join(" · ") || (person.active ? "Activo" : "Inactivo")}
                </span>
              </div>
              <div className="replacement-person-row-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Editar ${person.name}`}
                  onClick={() => startEdit(person)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={person.active ? `Desactivar ${person.name}` : `Reactivar ${person.name}`}
                  onClick={() => void toggleActive(person)}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Eliminar ${person.name}`}
                  onClick={() => void deletePerson(person)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
