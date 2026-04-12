import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSubnet, createSubnet, updateSubnet } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { isValidCidr } from '../../utils/validation';

export default function SubnetForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [vlanId, setVlanId] = useState('');
  const [description, setDescription] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useUnsavedChanges(isDirty);

  const { data: subnet } = useQuery({
    queryKey: ['subnet', projectId, Number(id)],
    queryFn: () => fetchSubnet(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (subnet) {
      setName(subnet.name);
      setCidr(subnet.cidr);
      setVlanId(subnet.vlan_id?.toString() || '');
      setDescription(subnet.description || '');
    }
  }, [subnet]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateSubnet(projectId, Number(id), data) : createSubnet(projectId, data),
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['subnets', projectId] });
      navigate(`${base}/subnets`);
    },
  });

  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    if (cidr && !isValidCidr(cidr)) {
      setValidationError('Invalid CIDR notation. Expected format: 192.168.1.0/24');
      return;
    }
    mutation.mutate({
      name,
      cidr,
      vlan_id: vlanId ? Number(vlanId) : undefined,
      description: description || undefined,
      updated_at: isEdit ? subnet?.updated_at : undefined,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Subnet' : 'New Subnet'}</h2>
      </div>

      <form className="card" onSubmit={handleSubmit} onChange={() => setIsDirty(true)}>
        <div className="form-group">
          <label>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="Management Network" />
        </div>
        <div className="form-group">
          <label>CIDR *</label>
          <input value={cidr} onChange={e => setCidr(e.target.value)} required placeholder="192.168.1.0/24" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>VLAN ID</label>
            <input type="number" value={vlanId} onChange={e => setVlanId(e.target.value)} placeholder="100" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        {(validationError || mutation.isError) && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {validationError || (mutation.error as Error)?.message}
          </div>
        )}
        <div className="actions" style={{ marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Subnet')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`${base}/subnets`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
