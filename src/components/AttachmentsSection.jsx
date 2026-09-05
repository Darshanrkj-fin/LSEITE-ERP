import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

// Generic attachments panel — drop it into any detail view with an
// entityType/entityId pair. Files live in the private "attachments"
// Storage bucket at {company_id}/{entityType}/{entityId}/{uuid}-{name};
// public.attachments is just the queryable metadata row for each one.
export function AttachmentsSection({ entityType, entityId }) {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('attachments')
      .select('id, file_name, file_path, file_size, created_at, uploaded_by:users(full_name)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setAttachments(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setUploading(true)

    const path = `${profile.company_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file)
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { error: insertError } = await supabase.from('attachments').insert({
      company_id: profile.company_id,
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: profile.id,
    })
    setUploading(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    load()
  }

  const handleView = async (att) => {
    setError(null)
    const { data, error: urlError } = await supabase.storage.from('attachments').createSignedUrl(att.file_path, 60)
    if (urlError) {
      setError(urlError.message)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (att) => {
    if (!window.confirm(`Delete "${att.file_name}"? This cannot be undone.`)) return
    setError(null)
    const { error: removeError } = await supabase.storage.from('attachments').remove([att.file_path])
    if (removeError) {
      setError(removeError.message)
      return
    }
    const { error: deleteError } = await supabase.from('attachments').delete().eq('id', att.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Attachments</h3>
        {canEdit && (
          <label className="cursor-pointer text-sm text-slate-600 hover:underline">
            {uploading ? 'Uploading…' : '+ Upload file'}
            <input type="file" className="hidden" disabled={uploading} onChange={handleUpload} />
          </label>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted">No attachments yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center justify-between border-b border-slate-100 py-1">
              <button type="button" onClick={() => handleView(att)} className="text-left text-slate-700 hover:underline">
                {att.file_name}
              </button>
              <span className="flex items-center gap-2 text-muted">
                {att.uploaded_by?.full_name ?? ''} · {new Date(att.created_at).toLocaleDateString()}
                {canEdit && (
                  <button type="button" onClick={() => handleDelete(att)} className="text-clay hover:underline">
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
