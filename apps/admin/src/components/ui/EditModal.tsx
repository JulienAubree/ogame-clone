import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  step?: string;
  options?: { value: string; label: string }[];
  allowEmpty?: boolean;
}

interface EditModalProps {
  open: boolean;
  title: string;
  fields: Field[];
  values: Record<string, string | number>;
  onSave: (values: Record<string, string | number>) => void;
  onClose: () => void;
  saving?: boolean;
}

export function EditModal({ open, title, fields, values, onSave, onClose, saving }: EditModalProps) {
  const [form, setForm] = useState<Record<string, string | number>>(values);

  useEffect(() => {
    setForm(values);
  }, [values]);

  useEffect(() => {
    if (open) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="admin-card p-6 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-100">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {field.label}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="admin-input min-h-[60px] resize-y"
                  rows={2}
                />
              ) : field.type === 'select' ? (
                <select
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="admin-input"
                >
                  {field.allowEmpty && <option value="">— Aucun —</option>}
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  step={field.step}
                  value={form[field.key] ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                  className="admin-input"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="admin-btn-ghost">
            Annuler
          </button>
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </form>
    </div>
  );
}
