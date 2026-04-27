import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import Modal from '../../ui/Modal';
import { fetchHighlightRules, createHighlightRule, updateHighlightRule, deleteHighlightRule } from '../../../api/highlightRules';
import { useProject } from '../../../contexts/ProjectContext';
import type { HighlightRule } from 'shared/types';

export default function HighlightRulesTab() {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('#fef9c3');
  const [textColor, setTextColor] = useState('');
  const [useTextColor, setUseTextColor] = useState(false);

  const { data: rules = [] } = useQuery({
    queryKey: ['highlight-rules', projectId],
    queryFn: () => fetchHighlightRules(projectId),
  });

  const createMut = useMutation({
    mutationFn: (data: { keyword: string; category: string; color: string; text_color?: string | null }) =>
      createHighlightRule(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] });
      setKeyword('');
      setCategory('');
      setColor('#fef9c3');
      setTextColor('');
      setUseTextColor(false);
    },
    onError: (err: Error) => toast(err.message || 'Failed to create highlight rule', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteHighlightRule(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] }),
    onError: (err: Error) => toast(err.message || 'Failed to delete highlight rule', 'error'),
  });

  const [editingRule, setEditingRule] = useState<HighlightRule | null>(null);
  const [editKeyword, setEditKeyword] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editColor, setEditColor] = useState('#fef9c3');
  const [editUseTextColor, setEditUseTextColor] = useState(false);
  const [editTextColor, setEditTextColor] = useState('#000000');

  const updateMut = useMutation({
    mutationFn: (data: { keyword: string; category: string; color: string; text_color?: string | null }) =>
      updateHighlightRule(projectId, editingRule!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlight-rules', projectId] });
      setEditingRule(null);
    },
    onError: (err: Error) => toast(err.message || 'Failed to update highlight rule', 'error'),
  });

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-header-title">Highlight Rules</h3>
            <div className="card-header-subtitle">Rows in parsed command output that contain a matching keyword will be highlighted with the specified colours.</div>
          </div>
        </div>

        <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. sudo"
            />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. WARNING"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Background</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              style={{ height: '38px', width: '100%', padding: '2px', cursor: 'pointer' }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={useTextColor}
                onChange={e => setUseTextColor(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Font colour
            </label>
            <input
              type="color"
              value={textColor || '#000000'}
              onChange={e => setTextColor(e.target.value)}
              disabled={!useTextColor}
              style={{ height: '38px', width: '100%', padding: '2px', cursor: useTextColor ? 'pointer' : 'not-allowed', opacity: useTextColor ? 1 : 0.4 }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ visibility: 'hidden' }}>Add</label>
            <button
              className="btn btn-primary"
              disabled={!keyword.trim() || !category.trim() || createMut.isPending}
              onClick={() => createMut.mutate({
                keyword: keyword.trim(),
                category: category.trim(),
                color,
                text_color: useTextColor ? textColor : null,
              })}
              style={{ width: '100%' }}
            >
              Add Rule
            </button>
          </div>
        </div>

        {rules.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Category</th>
                  <th>Background</th>
                  <th>Font</th>
                  <th>Preview</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule: HighlightRule) => (
                  <tr key={rule.id}>
                    <td style={{ fontFamily: 'monospace' }}>{rule.keyword}</td>
                    <td>{rule.category}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: rule.color, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{rule.color}</span>
                      </div>
                    </td>
                    <td>
                      {rule.text_color ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: rule.text_color, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{rule.text_color}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>default</span>
                      )}
                    </td>
                    <td>
                      <span style={{ background: rule.color, color: rule.text_color || undefined, padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        {rule.keyword}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        title="Edit" aria-label="Edit"
                        onClick={() => {
                          setEditKeyword(rule.keyword);
                          setEditCategory(rule.category);
                          setEditColor(rule.color);
                          setEditUseTextColor(!!rule.text_color);
                          setEditTextColor(rule.text_color || '#000000');
                          setEditingRule(rule);
                        }}
                      ><Pencil size={13} /></button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Delete" aria-label="Delete"
                        onClick={async () => { if (await confirm(`Delete rule for "${rule.keyword}"?`)) deleteMut.mutate(rule.id); }}
                      ><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No highlight rules yet.</p>
        )}
      </div>

      {editingRule && (
        <Modal
          onClose={() => setEditingRule(null)}
          style={{ minWidth: 420 }}
          title="Edit Highlight Rule"
        >
          <div className="confirm-dialog-message">
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Keyword</label>
                <input type="text" value={editKeyword} onChange={e => setEditKeyword(e.target.value)} placeholder="e.g. sudo" />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Category</label>
                <input type="text" value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="e.g. WARNING" />
              </div>
            </div>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Background</label>
                <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={{ height: '38px', width: '100%', padding: '2px', cursor: 'pointer' }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={editUseTextColor} onChange={e => setEditUseTextColor(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
                  Font colour
                </label>
                <input type="color" value={editTextColor} onChange={e => setEditTextColor(e.target.value)} disabled={!editUseTextColor} style={{ height: '38px', width: '100%', padding: '2px', cursor: editUseTextColor ? 'pointer' : 'not-allowed', opacity: editUseTextColor ? 1 : 0.4 }} />
              </div>
            </div>
          </div>
          <div className="confirm-dialog-actions">
            <button className="btn btn-secondary" onClick={() => setEditingRule(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!editKeyword.trim() || !editCategory.trim() || updateMut.isPending}
              onClick={() => updateMut.mutate({ keyword: editKeyword.trim(), category: editCategory.trim(), color: editColor, text_color: editUseTextColor ? editTextColor : null })}
            >Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}
